(() => {
  const supabaseUrl = "https://hcehsxnudbwjydvenlfz.supabase.co";
  const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZWhzeG51ZGJ3anlkdmVubGZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NzAsImV4cCI6MjA5MDY1Mjg3MH0.dPawhX90yZrme7nftMTq6A1j-KGqfHZJ8QnbBeFurl8";
  const supabase = window.supabase?.createClient(supabaseUrl, supabaseKey);

  const createRoomBtn = document.getElementById("create-room-btn");
  const joinRoomBtn = document.getElementById("join-room-btn");
  const roomInput = document.getElementById("room-input");
  const roomCard = document.getElementById("room-card");
  const roomRoleEl = document.getElementById("room-role");
  const roomHintEl = document.getElementById("room-hint");
  const roomCodeEl = document.getElementById("room-code");
  const roomLinkEl = document.getElementById("room-link");
  const copyCodeBtn = document.getElementById("copy-code-btn");
  const copyLinkBtn = document.getElementById("copy-link-btn");
  const shareLinkBtn = document.getElementById("share-link-btn");
  const startRaceBtn = document.getElementById("start-race-btn");
  const raceGameEl = document.getElementById("race-game");
  const raceBoardEl = document.getElementById("race-board");
  const raceKeyboardEl = document.getElementById("race-keyboard");
  const raceStopwatchEl = document.getElementById("race-stopwatch");
  const raceMessageEl = document.getElementById("race-game-message");
  const appLoader = document.getElementById("app-loader");
  const statusEl = document.getElementById("race-status");

  const roomKey = "wordle-race-room";
  const userKey = "wordle-user-data-v2";
  const clientKey = "wordle-race-client-id";
  const WORD_TABLE = "battle_words";
  const PLAYER_TABLE = "battle_players";

  const PLAYER_ROOM_FIELDS = ["room_code", "code", "room", "battle_code"];
  const PLAYER_ID_FIELDS = ["client_id", "player_id", "uuid", "user_id"];
  const PLAYER_ROLE_FIELDS = ["role", "player_role", "side"];
  const PLAYER_NAME_FIELDS = ["username", "player_name", "display_name", "name"];
  const PLAYER_WORD_FIELDS = ["word", "target_word", "battle_word", "race_word"];
  const PLAYER_FINISHED_FIELDS = ["finished", "is_finished", "done", "completed"];
  const PLAYER_FINISH_MS_FIELDS = ["finish_ms", "elapsed_ms", "time_ms", "duration_ms"];
  const PLAYER_GUESSES_FIELDS = ["guesses", "guess_count", "attempts"];

  let currentRoom = null;
  let currentRole = null;
  let roomPoller = null;
  let currentUser = null;
  let currentUserId = null;
  let currentWord = null;
  let wordLength = 5;
  let currentGuess = "";
  let raceRows = [];
  let raceStarted = false;
  let raceFinished = false;
  let raceStartTs = 0;
  let raceTimer = null;

  function getClientId() {
    let id = localStorage.getItem(clientKey);
    if (!id) {
      id = window.crypto?.randomUUID ? window.crypto.randomUUID() : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(clientKey, id);
    }
    return id;
  }

  function getUserData() {
    try {
      const raw = localStorage.getItem(userKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setControlsEnabled(enabled) {
    createRoomBtn.disabled = !enabled;
    joinRoomBtn.disabled = !enabled;
    roomInput.disabled = !enabled;
    if (startRaceBtn) startRaceBtn.disabled = !enabled;
  }

  function hideLoader() {
    if (!appLoader) return;
    setTimeout(() => appLoader.classList.add("is-hidden"), 140);
  }

  function uniquePayloads(payloads) {
    const seen = new Set();
    const out = [];
    for (const payload of payloads) {
      const key = JSON.stringify(payload);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(payload);
    }
    return out;
  }

  async function tryInsert(table, payloads) {
    const attempts = uniquePayloads(payloads);
    let lastError = null;
    for (const payload of attempts) {
      const { error } = await supabase.from(table).insert([payload]);
      if (!error) return { ok: true, payload };
      lastError = error;
    }
    return { ok: false, error: lastError };
  }

  async function fetchRandomBattleWord() {
    if (!supabase) return null;
    const maxId = 670;
    for (let i = 0; i < 4; i += 1) {
      const randomId = Math.floor(Math.random() * maxId) + 1;
      const { data, error } = await supabase
        .from(WORD_TABLE)
        .select("word")
        .eq("id", randomId)
        .maybeSingle();
      if (!error && data?.word) return String(data.word).toUpperCase();
    }
    return null;
  }

  async function countPlayersInRoom(code) {
    for (const field of PLAYER_ROOM_FIELDS) {
      const { count, error } = await supabase
        .from(PLAYER_TABLE)
        .select("*", { count: "exact", head: true })
        .eq(field, code);

      if (!error) return count ?? 0;
    }
    return -1;
  }

  async function fetchRoomPlayers(code) {
    for (const field of PLAYER_ROOM_FIELDS) {
      const { data, error } = await supabase
        .from(PLAYER_TABLE)
        .select("*")
        .eq(field, code)
        .limit(10);

      if (!error && Array.isArray(data)) return data;
    }
    return null;
  }

  async function roomExists(code) {
    for (const roomField of PLAYER_ROOM_FIELDS) {
      const { data, error } = await supabase
        .from(PLAYER_TABLE)
        .select("*")
        .eq(roomField, code)
        .limit(1)
        .maybeSingle();
      if (!error && data) return true;
      if (!error && !data) return false;
    }
    return false;
  }

  async function registerPlayerRow(code, role) {
  const userIdentifier = currentUser?.uuid || getClientId();
  currentUserId = userIdentifier;
    const userName = currentUser?.username || "Player";

    for (const roomField of PLAYER_ROOM_FIELDS) {
      for (const idField of PLAYER_ID_FIELDS) {
        const check = await supabase
          .from(PLAYER_TABLE)
          .select("*")
          .eq(roomField, code)
          .eq(idField, userIdentifier)
          .limit(1)
          .maybeSingle();
        if (!check.error && check.data) {
          for (const wordField of PLAYER_WORD_FIELDS) {
            if (check.data[wordField]) {
              currentWord = String(check.data[wordField]).toUpperCase();
              wordLength = currentWord.length;
              break;
            }
          }
          return true;
        }
      }
    }

    const hostWord = role === "host" ? await fetchRandomBattleWord() : null;

    const payloads = [];
    for (const roomField of PLAYER_ROOM_FIELDS) {
      for (const idField of PLAYER_ID_FIELDS) {
        for (const roleField of PLAYER_ROLE_FIELDS) {
          payloads.push({ [roomField]: code, [idField]: userIdentifier, [roleField]: role });
          for (const nameField of PLAYER_NAME_FIELDS) {
            payloads.push({ [roomField]: code, [idField]: userIdentifier, [roleField]: role, [nameField]: userName });
          }
          if (hostWord) {
            for (const wordField of PLAYER_WORD_FIELDS) {
              payloads.push({ [roomField]: code, [idField]: userIdentifier, [roleField]: role, [wordField]: hostWord });
              for (const nameField of PLAYER_NAME_FIELDS) {
                payloads.push({ [roomField]: code, [idField]: userIdentifier, [roleField]: role, [nameField]: userName, [wordField]: hostWord });
              }
            }
          }
        }
      }
    }

    const result = await tryInsert(PLAYER_TABLE, payloads);
    if (result.ok && hostWord) {
      currentWord = hostWord;
      wordLength = hostWord.length;
    }
    return result.ok;
  }

  async function hydrateWordFromRoom() {
    if (!currentRoom) return false;
    const players = await fetchRoomPlayers(currentRoom);
    if (!players || !players.length) return false;

    for (const row of players) {
      for (const field of PLAYER_WORD_FIELDS) {
        const candidate = row[field];
        if (typeof candidate === "string" && candidate.trim().length >= 3) {
          currentWord = candidate.toUpperCase();
          wordLength = currentWord.length;
          return true;
        }
      }
    }

    return false;
  }

  function formatStopwatch(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  }

  function tickStopwatch() {
    if (!raceStarted || raceFinished) return;
    const elapsed = Date.now() - raceStartTs;
    raceStopwatchEl.textContent = formatStopwatch(elapsed);
  }

  function startStopwatch() {
    raceStartTs = Date.now();
    raceStopwatchEl.textContent = "00:00.00";
    if (raceTimer) clearInterval(raceTimer);
    raceTimer = setInterval(tickStopwatch, 80);
  }

  function stopStopwatch() {
    if (raceTimer) {
      clearInterval(raceTimer);
      raceTimer = null;
    }
    tickStopwatch();
  }

  function renderRaceBoard() {
    raceBoardEl.innerHTML = "";
    raceBoardEl.style.setProperty("--word-length", wordLength);

    for (let r = 0; r < raceRows.length + 1; r += 1) {
      const row = document.createElement("div");
      row.className = "row";

      const guess = r < raceRows.length ? raceRows[r] : currentGuess;
      for (let c = 0; c < wordLength; c += 1) {
        const tile = document.createElement("div");
        tile.className = "tile";
        const letter = guess?.[c] || "";
        tile.textContent = letter;
        if (letter) tile.classList.add("filled");
        row.appendChild(tile);
      }
      raceBoardEl.appendChild(row);
    }
  }

  function buildRaceKeyboard() {
    raceKeyboardEl.innerHTML = "";
    const rows = [
      ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
      ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
      ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"]
    ];

    rows.forEach((letters) => {
      const row = document.createElement("div");
      row.className = "keyboard-row";
      letters.forEach((letter) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "key";
        button.textContent = letter;
        if (letter === "ENTER" || letter === "⌫") button.classList.add("wide");
        button.addEventListener("click", () => onRaceKey(letter));
        row.appendChild(button);
      });
      raceKeyboardEl.appendChild(row);
    });
  }

  function setRaceMessage(text) {
    raceMessageEl.textContent = text;
  }

  async function updateMyFinishRow(elapsedMs) {
    if (!currentRoom || !currentUserId) return;

    const payloadVariants = [];
    for (const doneField of PLAYER_FINISHED_FIELDS) {
      payloadVariants.push({ [doneField]: true });
      for (const msField of PLAYER_FINISH_MS_FIELDS) {
        payloadVariants.push({ [doneField]: true, [msField]: elapsedMs });
        for (const guessesField of PLAYER_GUESSES_FIELDS) {
          payloadVariants.push({ [doneField]: true, [msField]: elapsedMs, [guessesField]: raceRows.length });
        }
      }
    }

    for (const roomField of PLAYER_ROOM_FIELDS) {
      for (const idField of PLAYER_ID_FIELDS) {
        for (const patch of payloadVariants) {
          const { error } = await supabase
            .from(PLAYER_TABLE)
            .update(patch)
            .eq(roomField, currentRoom)
            .eq(idField, currentUserId);
          if (!error) return;
        }
      }
    }
  }

  function isTruthLike(value) {
    return value === true || value === 1 || value === "1" || value === "true" || value === "yes";
  }

  function rowIsFinished(row) {
    for (const field of PLAYER_FINISHED_FIELDS) {
      if (field in row && isTruthLike(row[field])) return true;
    }
    return false;
  }

  function getFinishMs(row) {
    for (const field of PLAYER_FINISH_MS_FIELDS) {
      const val = Number(row[field]);
      if (Number.isFinite(val) && val >= 0) return val;
    }
    return null;
  }

  async function resolveRaceOutcome(myElapsed) {
    const players = await fetchRoomPlayers(currentRoom);
    if (!players || players.length < 2) {
      setRaceMessage("You solved it. Waiting for opponent result...");
      return;
    }

    let opponentDone = false;
    let opponentMs = null;

    for (const row of players) {
      let rowId = null;
      for (const idField of PLAYER_ID_FIELDS) {
        if (row[idField]) {
          rowId = String(row[idField]);
          break;
        }
      }
      if (rowId && rowId === String(currentUserId)) continue;

      opponentDone = rowIsFinished(row);
      opponentMs = getFinishMs(row);
      if (opponentDone) break;
    }

    if (!opponentDone) {
      setRaceMessage("You solved it first (for now) ✅ Waiting for opponent...");
      return;
    }

    if (opponentMs == null) {
      setRaceMessage("Both solved. Opponent result received.");
      return;
    }

    if (myElapsed <= opponentMs) setRaceMessage("You won the race 🏁");
    else setRaceMessage("Opponent won this one. Run it back 🔁");
  }

  async function submitRaceGuess() {
    if (!raceStarted || raceFinished) return;

    if (currentGuess.length !== wordLength) {
      setRaceMessage(`Need ${wordLength} letters.`);
      return;
    }

    const guess = currentGuess.toUpperCase();
    raceRows.push(guess);
    currentGuess = "";
    renderRaceBoard();

    if (guess === currentWord) {
      raceFinished = true;
      stopStopwatch();
      const elapsed = Date.now() - raceStartTs;
      setRaceMessage(`Solved in ${formatStopwatch(elapsed)}. Checking opponent...`);
      await updateMyFinishRow(elapsed);
      await resolveRaceOutcome(elapsed);
    } else {
      setRaceMessage(`Try #${raceRows.length} — keep going.`);
    }
  }

  function onRaceKey(key) {
    if (!raceStarted || raceFinished) return;

    if (key === "ENTER") {
      void submitRaceGuess();
      return;
    }

    if (key === "⌫") {
      currentGuess = currentGuess.slice(0, -1);
      renderRaceBoard();
      return;
    }

    if (/^[A-Z]$/.test(key) && currentGuess.length < wordLength) {
      currentGuess += key;
      renderRaceBoard();
    }
  }

  async function startRace() {
    if (!currentRoom) {
      setStatus("Create or join a room first.");
      return;
    }

    const hasWord = currentWord || (await hydrateWordFromRoom());
    if (!hasWord) {
      setStatus("Could not get race word from room yet.");
      return;
    }

    raceRows = [];
    currentGuess = "";
    raceStarted = true;
    raceFinished = false;
    raceGameEl.classList.remove("hidden");
    setRaceMessage("Race started. Unlimited tries. No clues — pure speed.");
    renderRaceBoard();
    startStopwatch();
  }

  async function refreshRoomStatus() {
    if (!currentRoom) return;

    const count = await countPlayersInRoom(currentRoom);
    if (count < 0) {
      setStatus("Connected, but table columns didn’t match expected room fields.");
      return;
    }

    if (count >= 2) {
      setStatus("Opponent joined ✅ Room is ready for 1v1.");
      if (startRaceBtn) startRaceBtn.disabled = false;
    } else if (currentRole === "host") {
      setStatus("Room is online. Waiting for opponent to join...");
      if (startRaceBtn) startRaceBtn.disabled = true;
    } else {
      setStatus("You joined. Waiting for host/opponent sync...");
      if (startRaceBtn) startRaceBtn.disabled = true;
    }
  }

  function startRoomPolling() {
    if (roomPoller) clearInterval(roomPoller);
    roomPoller = window.setInterval(refreshRoomStatus, 2500);
    refreshRoomStatus();
  }

  function sanitizeRoomCode(value) {
    return (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  }

  function randomRoomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(6);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);

    let out = "";
    for (let i = 0; i < 6; i += 1) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }

  function roomInviteLink(code) {
    const url = new URL(window.location.href);
    url.searchParams.set("room", code);
    return url.toString();
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}

    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  async function ensureAuthenticatedUser() {
    currentUser = getUserData();

    if (!currentUser?.username) {
      setControlsEnabled(false);
      setStatus("Login required: create/login your account from the main game leaderboard first.");
      return false;
    }

    if (!supabase) {
      setControlsEnabled(false);
      setStatus("Supabase client not loaded on this page.");
      return false;
    }

    const { data, error } = await supabase
      .from("leaderboards")
      .select("uuid, username")
      .eq("uuid", currentUser.uuid)
      .maybeSingle();

    if (error || !data?.username) {
      setControlsEnabled(false);
      setStatus("Account not found in DB. Login again from the main page.");
      return false;
    }

    setControlsEnabled(true);
    if (startRaceBtn) startRaceBtn.disabled = true;
    return true;
  }

  function setRoom(code, role) {
    const cleanCode = sanitizeRoomCode(code);
    if (!cleanCode) return;

    const link = roomInviteLink(cleanCode);
    roomCard.classList.remove("hidden");
    roomCodeEl.textContent = cleanCode;
    roomLinkEl.value = link;

    if (role === "host") {
      roomRoleEl.textContent = "You are Host";
      roomHintEl.textContent = "Invite 1 friend using the code or link below.";
      setStatus("Creating online room...");
    } else {
      roomRoleEl.textContent = "You are Challenger";
      roomHintEl.textContent = "You joined this 1v1 room.";
      setStatus("Joining online room...");
    }

    currentRoom = cleanCode;
    currentRole = role;

    localStorage.setItem(roomKey, JSON.stringify({ code: cleanCode, role, updatedAt: Date.now() }));
    const url = new URL(window.location.href);
    url.searchParams.set("room", cleanCode);
    window.history.replaceState({}, "", url);

    void connectRoomOnline(cleanCode, role);
  }

  async function connectRoomOnline(code, role) {
    if (!(await ensureAuthenticatedUser())) return;

    if (role === "guest") {
      const exists = await roomExists(code);
      if (!exists) {
        setStatus("Room not found online. Check code.");
        return;
      }

      const count = await countPlayersInRoom(code);
      if (count >= 2) {
        setStatus("This room already has 2 players.");
        return;
      }
    }

    const playerOk = await registerPlayerRow(code, role);
    if (!playerOk) {
      setStatus("Could not register you in battle_players (column mismatch or RLS block).");
      return;
    }

    startRoomPolling();
  }

  async function createRoom() {
    if (!(await ensureAuthenticatedUser())) return;
    const code = randomRoomCode();
    setRoom(code, "host");
  }

  async function joinRoom() {
    if (!(await ensureAuthenticatedUser())) return;
    const cleanCode = sanitizeRoomCode(roomInput.value);
    roomInput.value = cleanCode;
    if (cleanCode.length !== 6) {
      setStatus("Room code must be 6 letters/numbers.");
      return;
    }
    setRoom(cleanCode, "guest");
  }

  function restoreLastRoom() {
    if (!currentUser?.username) return;

    const roomFromUrl = sanitizeRoomCode(new URLSearchParams(window.location.search).get("room"));
    if (roomFromUrl) {
      roomInput.value = roomFromUrl;
      setRoom(roomFromUrl, "guest");
      return;
    }

    try {
      const saved = JSON.parse(localStorage.getItem(roomKey) || "null");
      if (saved?.code) {
        setRoom(saved.code, saved.role === "guest" ? "guest" : "host");
      }
    } catch {}
  }

  createRoomBtn?.addEventListener("click", createRoom);
  joinRoomBtn?.addEventListener("click", joinRoom);

  roomInput?.addEventListener("input", () => {
    roomInput.value = sanitizeRoomCode(roomInput.value);
  });

  roomInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") joinRoom();
  });

  copyCodeBtn?.addEventListener("click", async () => {
    const ok = await copyText(roomCodeEl.textContent.trim());
    setStatus(ok ? "Room code copied." : "Could not copy code on this device.");
  });

  copyLinkBtn?.addEventListener("click", async () => {
    const ok = await copyText(roomLinkEl.value);
    setStatus(ok ? "Invite link copied." : "Could not copy link on this device.");
  });

  shareLinkBtn?.addEventListener("click", async () => {
    const link = roomLinkEl.value;
    if (!link) {
      setStatus("Create or join a room first.");
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Wordle Unbound Race",
          text: "Join my 1v1 race room!",
          url: link
        });
        setStatus("Share sheet opened.");
        return;
      } catch {}
    }

    const ok = await copyText(link);
    setStatus(ok ? "Share not available here, so link was copied instead." : "Could not share or copy the link.");
  });

  startRaceBtn?.addEventListener("click", () => {
    void startRace();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (!raceStarted || raceFinished) return;

    if (e.key === "Enter") onRaceKey("ENTER");
    else if (e.key === "Backspace") onRaceKey("⌫");
    else {
      const letter = e.key.toUpperCase();
      if (/^[A-Z]$/.test(letter)) onRaceKey(letter);
    }
  });

  window.addEventListener("beforeunload", () => {
    if (roomPoller) clearInterval(roomPoller);
    if (raceTimer) clearInterval(raceTimer);
  });

  ensureAuthenticatedUser().then((ok) => {
    if (ok) {
      setStatus(`Logged in as ${currentUser.username}. Create or join a 1v1 room.`);
      restoreLastRoom();
    }
    hideLoader();
  });
})();
