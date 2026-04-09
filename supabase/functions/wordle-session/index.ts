// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function getMaxGuesses(wordLength: number) {
  return wordLength <= 5 ? 6 : Math.min(16, wordLength + 1);
}

type SessionRow = {
  id: number;
  day_index: number;
  principal_key: string;
  session_token: string;
  guess_count: number;
  request_count: number;
  guesses: Array<{ guess: string; colors: string[] }>;
  game_over: boolean;
  won: boolean;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function isUuidLike(value: unknown) {
  return typeof value === "string" && /^[0-9a-fA-F-]{30,80}$/.test(value);
}

function setupErrorPayload(error: any, fallbackCode: string, fallbackMessage: string) {
  const pgCode = String(error?.code || "");
  if (pgCode === "42P01") {
    return {
      status: 500,
      body: {
        ok: false,
        code: "BACKEND_SETUP_REQUIRED",
        message: "Required table is missing. Run SQL migration: 2026-04-09_secure_wordle.sql"
      }
    };
  }
  if (pgCode === "42703") {
    return {
      status: 500,
      body: {
        ok: false,
        code: "BACKEND_SETUP_REQUIRED",
        message: "Database schema mismatch. Re-run SQL migrations for secure daily mode."
      }
    };
  }
  return {
    status: 500,
    body: {
      ok: false,
      code: fallbackCode,
      message: error?.message || fallbackMessage
    }
  };
}

async function resolveWordForDay(admin: any, dayIndex: number) {
  const exact = await admin
    .from("words")
    .select("word, day_index")
    .eq("day_index", dayIndex)
    .limit(1)
    .maybeSingle();

  if (!exact.error && exact.data?.word) {
    return { word: String(exact.data.word), source: "exact" as const };
  }

  const countRes = await admin
    .from("words")
    .select("day_index", { count: "exact", head: true });

  if (countRes.error) {
    throw new Error(countRes.error.message || "Could not count words table.");
  }

  const count = Number(countRes.count) || 0;
  if (count <= 0) {
    throw new Error("No rows found in words table.");
  }

  const offset = ((dayIndex % count) + count) % count;
  const rolled = await admin
    .from("words")
    .select("word, day_index")
    .order("day_index", { ascending: true })
    .range(offset, offset)
    .maybeSingle();

  if (rolled.error || !rolled.data?.word) {
    throw new Error(rolled.error?.message || "Could not resolve word fallback.");
  }

  return { word: String(rolled.data.word), source: "rolled" as const };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dayIndex = Number(body?.dayIndex);
    const userUuid = isUuidLike(body?.userUuid) ? String(body.userUuid) : null;
    const sessionSeed = isUuidLike(body?.sessionSeed) ? String(body.sessionSeed) : null;

    if (!Number.isFinite(dayIndex) || dayIndex < 0) {
      return json({ ok: false, code: "BAD_DAY_INDEX" }, 400);
    }

    if (!userUuid && !sessionSeed) {
      return json({ ok: false, code: "MISSING_SESSION_IDENTITY", message: "sessionSeed or userUuid is required." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRole) {
      return json({ ok: false, code: "SERVER_CONFIG_ERROR" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false }
    });

    const principalKey = userUuid ? `user:${userUuid}` : `seed:${sessionSeed}`;

    let resolvedWord: string;
    try {
      const resolved = await resolveWordForDay(admin, dayIndex);
      resolvedWord = resolved.word;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Word resolution failed.";
      return json({ ok: false, code: "WORD_NOT_FOUND", message: msg }, 404);
    }

    const wordLength = String(resolvedWord).trim().length;
    const maxGuesses = getMaxGuesses(wordLength);

    const { data: existing, error: existingErr } = await admin
      .from("wordle_daily_sessions")
      .select("id, day_index, principal_key, session_token, guess_count, request_count, guesses, game_over, won")
      .eq("day_index", dayIndex)
      .eq("principal_key", principalKey)
      .maybeSingle<SessionRow>();

    if (existingErr) {
      const mapped = setupErrorPayload(existingErr, "SESSION_LOOKUP_FAILED", "Session lookup failed.");
      return json(mapped.body, mapped.status);
    }

    if (existing) {
      return json({
        ok: true,
        sessionToken: existing.session_token,
        wordLength,
  maxGuesses,
        guessesUsed: Number(existing.guess_count) || 0,
        requestCount: Number(existing.request_count) || 0,
        gameOver: Boolean(existing.game_over),
        won: Boolean(existing.won),
        boardState: Array.isArray(existing.guesses) ? existing.guesses : []
      });
    }

    const sessionToken = crypto.randomUUID();

    const { data: created, error: insertErr } = await admin
      .from("wordle_daily_sessions")
      .insert({
        day_index: dayIndex,
        principal_key: principalKey,
        session_token: sessionToken,
        guess_count: 0,
        request_count: 0,
        guesses: [],
        game_over: false,
        won: false
      })
      .select("session_token")
      .single();

    if (insertErr || !created) {
      if (String(insertErr?.code || "") === "23505") {
        const retry = await admin
          .from("wordle_daily_sessions")
          .select("session_token, guess_count, request_count, guesses, game_over, won")
          .eq("day_index", dayIndex)
          .eq("principal_key", principalKey)
          .maybeSingle();

        if (!retry.error && retry.data?.session_token) {
          return json({
            ok: true,
            sessionToken: retry.data.session_token,
            wordLength,
            maxGuesses,
            guessesUsed: Number(retry.data.guess_count) || 0,
            requestCount: Number(retry.data.request_count) || 0,
            gameOver: Boolean(retry.data.game_over),
            won: Boolean(retry.data.won),
            boardState: Array.isArray(retry.data.guesses) ? retry.data.guesses : []
          });
        }
      }

      const mapped = setupErrorPayload(insertErr, "SESSION_CREATE_FAILED", "Session creation failed.");
      return json(mapped.body, mapped.status);
    }

    return json({
      ok: true,
      sessionToken: created.session_token,
      wordLength,
  maxGuesses,
      guessesUsed: 0,
      requestCount: 0,
      gameOver: false,
      won: false,
      boardState: []
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ ok: false, code: "INTERNAL_ERROR", message }, 500);
  }
});
