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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function computeColors(guess: string, answer: string): string[] {
  const answerLetters = answer.split("");
  const guessLetters = guess.split("");
  const colors = Array(guess.length).fill("gray");

  for (let i = 0; i < guess.length; i += 1) {
    if (guessLetters[i] === answerLetters[i]) {
      colors[i] = "green";
      answerLetters[i] = "\0";
      guessLetters[i] = "\0";
    }
  }

  for (let i = 0; i < guess.length; i += 1) {
    const letter = guessLetters[i];
    if (letter !== "\0" && answerLetters.includes(letter)) {
      colors[i] = "yellow";
      answerLetters[answerLetters.indexOf(letter)] = "\0";
    }
  }

  return colors;
}

async function resolveWordForDay(admin: any, dayIndex: number) {
  const exact = await admin
    .from("words")
    .select("word, day_index")
    .eq("day_index", dayIndex)
    .limit(1)
    .maybeSingle();

  if (!exact.error && exact.data?.word) {
    return String(exact.data.word);
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

  return String(rolled.data.word);
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
    const sessionToken = String(body?.sessionToken || "").trim();
    const guess = String(body?.guess || "").toUpperCase().trim();

    if (!Number.isFinite(dayIndex) || dayIndex < 0 || !sessionToken) {
      return json({ ok: false, code: "BAD_REQUEST" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRole) {
      return json({ ok: false, code: "SERVER_CONFIG_ERROR" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false }
    });

    const { data: session, error: sessionErr } = await admin
      .from("wordle_daily_sessions")
      .select("id, guess_count, request_count, guesses, game_over, won")
      .eq("day_index", dayIndex)
      .eq("session_token", sessionToken)
      .maybeSingle();

    if (sessionErr) {
      const mapped = setupErrorPayload(sessionErr, "SESSION_NOT_FOUND", "Session lookup failed.");
      return json(mapped.body, mapped.status);
    }

    if (!session) {
      return json({ ok: false, code: "SESSION_NOT_FOUND" }, 404);
    }

    let answer: string;
    try {
      answer = String(await resolveWordForDay(admin, dayIndex)).toUpperCase().trim();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Word resolution failed.";
      return json({ ok: false, code: "WORD_NOT_FOUND", message: msg }, 404);
    }
    const maxGuesses = getMaxGuesses(answer.length);
    const currentRequests = Number(session.request_count) || 0;
    if (currentRequests >= maxGuesses) {
      return json({ ok: false, code: "RATE_LIMIT", message: `Daily request limit reached (${maxGuesses}/${maxGuesses}).` }, 429);
    }

    const requestCount = currentRequests + 1;

    const { error: bumpErr } = await admin
      .from("wordle_daily_sessions")
      .update({ request_count: requestCount, updated_at: new Date().toISOString() })
      .eq("id", session.id);

    if (bumpErr) {
      const mapped = setupErrorPayload(bumpErr, "SESSION_UPDATE_FAILED", "Could not update request count.");
      return json(mapped.body, mapped.status);
    }

    if (session.game_over) {
      return json({ ok: false, code: "RATE_LIMIT", message: "Game already finished for today." }, 429);
    }

    if (!/^[A-Z]+$/.test(guess) || guess.length !== answer.length) {
      const gameOverFromRequests = requestCount >= maxGuesses;
      if (gameOverFromRequests) {
        await admin
          .from("wordle_daily_sessions")
          .update({ game_over: true, updated_at: new Date().toISOString() })
          .eq("id", session.id);
      }
      return json({ ok: false, code: "INVALID_WORD", message: "Guess format is invalid for today\u2019s word length." }, 400);
    }

    // Optional dictionary check (if table exists).
    const dictLookup = await admin
      .from("word_dictionary")
      .select("word")
      .eq("word", guess.toLowerCase())
      .maybeSingle();

    if (!dictLookup.error && !dictLookup.data) {
      const gameOverFromRequests = requestCount >= maxGuesses;
      if (gameOverFromRequests) {
        await admin
          .from("wordle_daily_sessions")
          .update({ game_over: true, updated_at: new Date().toISOString() })
          .eq("id", session.id);
      }
      return json({ ok: false, code: "INVALID_WORD", message: "That word is not accepted." }, 400);
    }

    const colors = computeColors(guess, answer);
    const won = colors.every((c) => c === "green");
    const previousGuesses = Array.isArray(session.guesses) ? session.guesses : [];
    const guessCount = (Number(session.guess_count) || 0) + 1;
  const gameOver = won || guessCount >= maxGuesses || requestCount >= maxGuesses;

    const nextGuesses = [
      ...previousGuesses,
      { guess, colors }
    ];

    const { error: updateErr } = await admin
      .from("wordle_daily_sessions")
      .update({
        guess_count: guessCount,
        guesses: nextGuesses,
        game_over: gameOver,
        won,
        updated_at: new Date().toISOString(),
        last_guess_at: new Date().toISOString()
      })
      .eq("id", session.id);

    if (updateErr) {
      return json({ ok: false, code: "SESSION_UPDATE_FAILED", message: updateErr.message }, 500);
    }

    return json({
      ok: true,
      colors,
      guessesUsed: guessCount,
      requestCount,
      gameOver,
      won
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ ok: false, code: "INTERNAL_ERROR", message }, 500);
  }
});
