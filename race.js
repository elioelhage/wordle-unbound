(() => {
  const supabaseUrl = "https://hcehsxnudbwjydvenlfz.supabase.co";
  const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZWhzeG51ZGJ3anlkdmVubGZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NzAsImV4cCI6MjA5MDY1Mjg3MH0.dPawhX90yZrme7nftMTq6A1j-KGqfHZJ8QnbBeFurl8";
  const supabase = window.supabase?.createClient(supabaseUrl, supabaseKey);

  const createStage = document.getElementById("create-stage");
  const createRoomBtn = document.getElementById("create-room-btn");

  const roomCard = document.getElementById("room-card");
  const roomRoleEl = document.getElementById("room-role");
  const roomHintEl = document.getElementById("room-hint");
  const roomCodeEl = document.getElementById("room-code");
  const roomLinkEl = document.getElementById("room-link");
  const copyCodeBtn = document.getElementById("copy-code-btn");
  const copyLinkBtn = document.getElementById("copy-link-btn");
  const readyBtn = document.getElementById("ready-btn");
  const statusEl = document.getElementById("race-status");

  const raceGameEl = document.getElementById("race-game");
  const raceBoardEl = document.getElementById("race-board");
  const raceKeyboardEl = document.getElementById("race-keyboard");
  const raceStopwatchEl = document.getElementById("race-stopwatch");
  const raceMessageEl = document.getElementById("race-game-message");
  const appLoader = document.getElementById("app-loader");

  const userKey = "wordle-user-data-v2";
  const PLAYER_TABLE = "battle_players";
  const WORD_TABLE = "battle_words";

  const FALLBACK_WORDS = [
    "ABLE", "AREA", "BIRD", "BLUE", "BOAT", "CODE", "COLD", "CROW", "DEEP", "DRAW",
    "EPIC", "FAIR", "FIRE", "FLOW", "GAME", "GLOW", "GOAL", "GROW", "HARD", "HOME",
    "IDEA", "JOIN", "JUMP", "KEEP", "KING", "KNOW", "LAND", "LIFE", "LOOK", "LOOP",
    "LUCK", "MAKE", "MOON", "MOVE", "MYTH", "NEAR", "NOTE", "OPEN", "PACE", "PLAY",
    "RACE", "RING", "ROAD", "ROOM", "RULE", "SAME", "SEEK", "SHIP", "SHOW", "SLOW",
    "SPIN", "STAR", "STEP", "STOP", "SYNC", "TAKE", "TASK", "TEAM", "TEST", "TIME",
    "TRUE", "TURN", "TYPE", "WAVE", "WIDE", "WILD", "WIND", "WING", "WORD", "WORK",
    "YEAR", "ZONE", "ZOOM"
  ];

  let currentUser = null;
  let currentRoom = null;
  let currentRole = null;
  let channel = null;

  let selfReady = false;
  let opponentReady = false;
  let startBroadcasted = false;

  let currentWord = null;
  let wordLength = 5;
  let currentGuess = "";
  let raceRows = [];
  let raceStarted = false;
  let raceFinished = false;
  let raceStartTs = 0;
  let raceTimer = null;

  function hideLoader() {
    if (!appLoader) return;
    setTimeout(() => appLoader.classList.add("is-hidden"), 140);
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function setRaceMessage(text) {
    raceMessageEl.textContent = text;
  }

  function getUserData() {
    try {
      const raw = localStorage.getItem(userKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function ensureAuthenticatedUser() {
    currentUser = getUserData();
    if (!currentUser?.uuid || !currentUser?.username) {
      createRoomBtn.disabled = true;
      setStatus("Login required. Go back and sign in from leaderboard first.");
      return false;
    }

    if (!supabase) {
      createRoomBtn.disabled = true;
      setStatus("Supabase is not available.");
      return false;
    }

    const { data, error } = await supabase
      .from(PLAYER_TABLE)
      .select("uuid, username")
      .eq("uuid", currentUser.uuid)
      .maybeSingle();

    if (error || !data?.uuid) {
      createRoomBtn.disabled = true;
      setStatus("Your account is not present in battle_players.");
      return false;
    }

    createRoomBtn.disabled = false;
    setStatus("Create room or open an invite link.");
    return true;
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

  function roomCodeToWordId(code) {
    let hash = 0;
    const clean = String(code || "").toUpperCase();
    for (let i = 0; i < clean.length; i += 1) {
      hash = (hash * 31 + clean.charCodeAt(i)) % 670;
    }
    return (hash % 670) + 1;
  }

  async function fetchBattleWordById(id) {
    const { data, error } = await supabase
      .from(WORD_TABLE)
      .select("word")
      .eq("id", id)
      .maybeSingle();

    if (error || !data?.word) return null;
    return String(data.word).toUpperCase();
  }

  function fallbackWordForRoom(code) {
    const idx = (roomCodeToWordId(code) - 1) % FALLBACK_WORDS.length;
    return FALLBACK_WORDS[Math.max(0, idx)] || "RACE";
  }

  async function ensureWordForRoom(code) {
    if (currentWord) return currentWord;

    const remote = await fetchBattleWordById(roomCodeToWordId(code));
    const chosen = remote || fallbackWordForRoom(code);
    currentWord = chosen;
    wordLength = chosen.length;
    return chosen;
  }

  function formatStopwatch(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  }

  function tickStopwatch() {
    if (!raceStarted || raceFinished) return;
    raceStopwatchEl.textContent = formatStopwatch(Date.now() - raceStartTs);
  }

  function startStopwatch(startAt) {
    raceStartTs = startAt || Date.now();
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
        button.id = `race-key-${letter}`;
        button.textContent = letter;
        if (letter === "ENTER" || letter === "⌫") button.classList.add("wide");
        button.addEventListener("click", () => onRaceKey(letter));
        row.appendChild(button);
      });
      raceKeyboardEl.appendChild(row);
    });
  }

  function updateKeyboardColor(letter, color) {
    const key = document.getElementById(`race-key-${letter}`);
    if (!key) return;

    const priority = { absent: 0, present: 1, correct: 2 };
    const existing = key.classList.contains("correct")
      ? "correct"
      : key.classList.contains("present")
      ? "present"
      : key.classList.contains("absent")
      ? "absent"
      : null;

    if (existing && priority[existing] >= priority[color]) return;

    key.classList.remove("correct", "present", "absent");
    key.classList.add(color);
  }

  function getTileColors(guess, answer) {
    const answerLetters = answer.split("");
    const guessLetters = guess.split("");
    const colors = Array(answer.length).fill("absent");

    for (let i = 0; i < answer.length; i += 1) {
      if (guessLetters[i] === answerLetters[i]) {
        colors[i] = "correct";
        answerLetters[i] = null;
        guessLetters[i] = null;
      }
    }

    for (let i = 0; i < answer.length; i += 1) {
      const letter = guessLetters[i];
      if (letter && answerLetters.includes(letter)) {
        colors[i] = "present";
        answerLetters[answerLetters.indexOf(letter)] = null;
      }
    }

    return colors;
  }

  function renderRaceBoard() {
    raceBoardEl.innerHTML = "";
    raceBoardEl.style.setProperty("--word-length", wordLength);

    for (let r = 0; r < raceRows.length + 1; r += 1) {
      const row = document.createElement("div");
      row.className = "row";
      const rowData = raceRows[r] || null;
      const guess = rowData ? rowData.guess : currentGuess;
      const colors = rowData ? rowData.colors : [];

      for (let c = 0; c < wordLength; c += 1) {
        const tile = document.createElement("div");
        tile.className = "tile";
        const letter = guess?.[c] || "";
        tile.textContent = letter;
        if (letter) tile.classList.add("filled");
        if (colors[c]) tile.classList.add(colors[c]);
        row.appendChild(tile);
      }

      raceBoardEl.appendChild(row);
    }
  }

  function enterRaceStage(startAt) {
    roomCard.classList.add("hidden");
    createStage.classList.add("hidden");
    raceGameEl.classList.remove("hidden");

    raceRows = [];
    currentGuess = "";
    raceStarted = true;
    raceFinished = false;

    buildRaceKeyboard();
    renderRaceBoard();
    setRaceMessage("Race started. Unlimited tries. Same Wordle rules.");
    startStopwatch(startAt);
  }

  async function sendRaceEvent(event, payload) {
    if (!channel) return;
    await channel.send({
      type: "broadcast",
      event,
      payload
    });
  }

  function applyLobbyRole(role, roomCode) {
    currentRole = role;
    currentRoom = roomCode;
    roomCodeEl.textContent = roomCode;
    roomLinkEl.value = roomInviteLink(roomCode);

    createStage.classList.add("hidden");
    roomCard.classList.remove("hidden");

    if (role === "host") {
      roomRoleEl.textContent = "You are Host";
      roomHintEl.textContent = "Share this code with your challenger.";
      copyLinkBtn.classList.remove("hidden");
      setStatus("Room created. Waiting for challenger to join and ready up.");
    } else {
      roomRoleEl.textContent = "You are Challenger";
      roomHintEl.textContent = "You joined this room. Ready up to start.";
      copyLinkBtn.classList.add("hidden");
      setStatus("Joined room. Click Ready.");
    }
  }

  async function maybeStartRace() {
    if (!selfReady || !opponentReady || !channel || startBroadcasted) return;
    if (currentRole !== "host") return;

    startBroadcasted = true;
    const startAt = Date.now() + 800;
    await sendRaceEvent("race_start", { startAt });
    setStatus("Both ready. Starting race...");
  }

  async function setupRoom(roomCode, role) {
    applyLobbyRole(role, roomCode);
    await ensureWordForRoom(roomCode);

    if (channel) {
      try {
        await supabase.removeChannel(channel);
      } catch {}
      channel = null;
    }

    channel = supabase.channel(`race:${roomCode}`, {
      config: { broadcast: { self: true } }
    });

    channel
      .on("broadcast", { event: "ready" }, ({ payload }) => {
        if (!payload || payload.uuid === currentUser.uuid) return;
        opponentReady = Boolean(payload.ready);
        setStatus(opponentReady ? "Opponent is ready. Waiting for you." : "Opponent is not ready yet.");
        void maybeStartRace();
      })
      .on("broadcast", { event: "race_start" }, ({ payload }) => {
        const startAt = Number(payload?.startAt) || Date.now();
        setStatus("Race started.");
        enterRaceStage(startAt);
      })
      .on("broadcast", { event: "race_finish" }, ({ payload }) => {
        if (!payload) return;
        if (payload.uuid === currentUser.uuid) return;
        if (raceFinished) return;

        raceFinished = true;
        stopStopwatch();
        setRaceMessage(`You lost. ${payload.username || "Opponent"} solved first.`);
        setStatus("Race complete.");
      });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setStatus(role === "host" ? "Room live. Share code and click Ready." : "Connected to room. Click Ready.");
      }
    });

    selfReady = false;
    opponentReady = false;
    startBroadcasted = false;
    readyBtn.disabled = false;
    readyBtn.textContent = "Ready";
  }

  async function handleReady() {
    if (!currentRoom || raceStarted) return;

    selfReady = true;
    readyBtn.disabled = true;
    readyBtn.textContent = "Ready ✓";

    await sendRaceEvent("ready", {
      uuid: currentUser.uuid,
      username: currentUser.username,
      ready: true
    });

    setStatus(opponentReady ? "Both ready. Starting..." : "Ready. Waiting for opponent...");
    await maybeStartRace();
  }

  async function createRoom() {
    const code = randomRoomCode();
    await setupRoom(code, "host");
  }

  async function joinRoomFromUrl() {
    const roomCode = sanitizeRoomCode(new URLSearchParams(window.location.search).get("room"));
    if (!roomCode) return false;
    await setupRoom(roomCode, "guest");
    return true;
  }

  async function submitRaceGuess() {
    if (!raceStarted || raceFinished) return;

    if (currentGuess.length !== wordLength) {
      setRaceMessage(`Need ${wordLength} letters.`);
      return;
    }

    const guess = currentGuess.toUpperCase();
    const colors = getTileColors(guess, currentWord);
    raceRows.push({ guess, colors });
    currentGuess = "";

    for (let i = 0; i < guess.length; i += 1) {
      updateKeyboardColor(guess[i], colors[i]);
    }

    renderRaceBoard();

    if (guess === currentWord) {
      raceFinished = true;
      stopStopwatch();
      setRaceMessage("You won the race 🏁");
      setStatus("Race complete.");
      await sendRaceEvent("race_finish", {
        uuid: currentUser.uuid,
        username: currentUser.username,
        elapsedMs: Date.now() - raceStartTs
      });
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

  createRoomBtn?.addEventListener("click", () => {
    void createRoom();
  });

  copyCodeBtn?.addEventListener("click", async () => {
    const ok = await copyText(roomCodeEl.textContent.trim());
    setStatus(ok ? "Room code copied." : "Could not copy room code.");
  });

  copyLinkBtn?.addEventListener("click", async () => {
    const ok = await copyText(roomLinkEl.value);
    setStatus(ok ? "Invite link copied." : "Could not copy invite link.");
  });

  readyBtn?.addEventListener("click", () => {
    void handleReady();
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

  window.addEventListener("beforeunload", async () => {
    if (raceTimer) clearInterval(raceTimer);
    if (channel) {
      try {
        await supabase.removeChannel(channel);
      } catch {}
    }
  });

  ensureAuthenticatedUser().then(async (ok) => {
    if (ok) {
      const joined = await joinRoomFromUrl();
      if (!joined) {
        createStage.classList.remove("hidden");
        roomCard.classList.add("hidden");
      }
    }
    hideLoader();
  });
})();
