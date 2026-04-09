(() => {
  const supabaseUrl = "https://hcehsxnudbwjydvenlfz.supabase.co";
  const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZWhzeG51ZGJ3anlkdmVubGZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NzAsImV4cCI6MjA5MDY1Mjg3MH0.dPawhX90yZrme7nftMTq6A1j-KGqfHZJ8QnbBeFurl8";
  const supabase = window.supabase?.createClient(supabaseUrl, supabaseKey);

  const createStage = document.getElementById("create-stage");
  const createRoomBtn = document.getElementById("create-room-btn");
  const joinCodeInput = document.getElementById("join-code-input");
  const joinCodeBtn = document.getElementById("join-code-btn");

  const roomCard = document.getElementById("room-card");
  const roomRoleEl = document.getElementById("room-role");
  const roomHintEl = document.getElementById("room-hint");
  const roomCodeEl = document.getElementById("room-code");
  const roomLinkEl = document.getElementById("room-link");
  const copyCodeBtn = document.getElementById("copy-code-btn");
  const copyLinkBtn = document.getElementById("copy-link-btn");
  const readyBtn = document.getElementById("ready-btn");
  const statusEl = document.getElementById("race-status");
  const raceBackButton = document.getElementById("race-back-button");
  const presenceSelfNameEl = document.getElementById("presence-self-name");
  const presenceSelfReadyEl = document.getElementById("presence-self-ready");
  const presenceOpponentNameEl = document.getElementById("presence-opponent-name");
  const presenceOpponentReadyEl = document.getElementById("presence-opponent-ready");

  const raceGameEl = document.getElementById("race-game");
  const raceBoardEl = document.getElementById("race-board");
  const raceKeyboardEl = document.getElementById("race-keyboard");
  const raceStopwatchEl = document.getElementById("race-stopwatch");
  const raceLeaveButton = document.getElementById("race-leave-button");
  const opponentPressureEl = document.getElementById("opponent-pressure");
  const raceMessageEl = document.getElementById("race-game-message");
  const appLoader = document.getElementById("app-loader");
  const raceResultModalEl = document.getElementById("race-result-modal");
  const raceResultKickerEl = document.getElementById("race-result-kicker");
  const raceResultTitleEl = document.getElementById("race-result-title");
  const raceResultDetailsEl = document.getElementById("race-result-details");
  const raceResultOkBtn = document.getElementById("race-result-ok");
  const raceLeaveModalEl = document.getElementById("race-leave-modal");
  const raceLeaveCancelBtn = document.getElementById("race-leave-cancel");
  const raceLeaveConfirmBtn = document.getElementById("race-leave-confirm");

  const userKey = "wordle-user-data-v2";
  const historyKeyPrefix = "wordle-race-history-";
  const PLAYER_TABLE = "battle_players";
  const WORD_TABLE = "battle_words";
  const RACE_WORD_LENGTH = 4;

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
  let raceElapsedMs = 0;
  let currentWordId = null;
  let myHistorySet = new Set();
  let opponentHistorySet = new Set();
  let supabaseWordPool = null;
  let terminatedRooms = new Set();
  let opponentName = "Opponent";
  let opponentProgress = 0;
  let selfBestCorrect = 0;
  let opponentBestCorrect = 0;
  let opponentPresent = false;
  let roomOpenedAt = 0;
  let roomIdleTimer = null;
  let profileHeartbeatTimer = null;
  let opponentWatchdogTimer = null;
  let lastOpponentSeenTs = 0;
  let opponentLeftHandled = false;
  let raceDrawSent = false;
  let leaveResolver = null;
  let lastBackPressTs = 0;
  const wordValidationCache = {};
  const ROOM_IDLE_LIMIT_MS = 7 * 60 * 1000;
  const DRAW_LIMIT_MS = 10 * 60 * 1000;
  const OPPONENT_RECONNECT_GRACE_MS = 90 * 1000;

  function syncViewportHeight() {
    const rawHeight = window.visualViewport?.height || window.innerHeight;
    const safeHeight = Math.max(320, Math.round(rawHeight));
    document.documentElement.style.setProperty("--app-height", `${safeHeight}px`);
  }

  function hideLoader() {
    if (!appLoader) return;
    setTimeout(() => appLoader.classList.add("is-hidden"), 140);
  }

  function setStatus(text, tone = "info") {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.remove("info", "success", "warn", "loud");
    statusEl.classList.add(tone);
  }

  function setRaceMessage(text) {
    raceMessageEl.textContent = text;
  }

  function setOpponentPressure(text) {
    if (!opponentPressureEl) return;
    opponentPressureEl.textContent = text;
  }

  function setReadyBadge(el, ready) {
    if (!el) return;
    el.textContent = ready ? "Ready" : "Not ready";
    el.classList.toggle("ready", ready);
    el.classList.toggle("not-ready", !ready);
  }

  function getOpponentDisplayName() {
    return opponentPresent ? (opponentName || "Opponent") : "Waiting for opponent to join";
  }

  function updatePresenceUI() {
    if (presenceSelfNameEl) {
      presenceSelfNameEl.textContent = currentUser?.username ? `${currentUser.username} (You)` : "You";
    }
    if (presenceOpponentNameEl) {
      presenceOpponentNameEl.textContent = getOpponentDisplayName();
    }
    setReadyBadge(presenceSelfReadyEl, selfReady);
    setReadyBadge(presenceOpponentReadyEl, opponentReady);
  }

  function showRaceResultModal({ won, winnerName, winnerMs, word, isDraw = false }) {
    if (!raceResultModalEl) return;
    const shownWord = (word || currentWord || "").toUpperCase();
    const finalWinnerName = winnerName || (won ? currentUser?.username || "You" : opponentName || "Opponent");
    const finalWinnerMs = Number.isFinite(winnerMs) ? winnerMs : won ? raceElapsedMs : null;

    if (isDraw) {
      raceResultKickerEl.textContent = "Time limit reached";
      raceResultTitleEl.textContent = "Draw";
      raceResultDetailsEl.innerHTML = `10:00 reached with no winner.<br>Word was: <strong>${shownWord}</strong>`;
    } else {
      raceResultKickerEl.textContent = "Race Complete";
      raceResultTitleEl.textContent = won ? "You Won 🏁" : "You Lost";
      raceResultDetailsEl.innerHTML = `${finalWinnerName} won${finalWinnerMs !== null ? ` in <strong>${formatStopwatch(finalWinnerMs)}</strong>` : ""}.<br>Word was: <strong>${shownWord}</strong>`;
    }

    const card = raceResultModalEl.querySelector(".race-result-card");
    if (card) {
      card.classList.toggle("draw", isDraw);
      card.classList.toggle("win", won);
      card.classList.toggle("lose", !won && !isDraw);
      card.classList.remove("left");
    }

    raceResultModalEl.classList.remove("hidden");
  }

  function closeRaceResultAndReturn() {
    if (raceResultModalEl) raceResultModalEl.classList.add("hidden");
    if (currentRoom && terminatedRooms.has(currentRoom)) {
      exitRoomToLobby();
      return;
    }
    prepareNextRoundInRoom();
  }

  function isActiveRaceRound() {
    return Boolean(currentRoom && raceStarted && !raceFinished);
  }

  function askLeaveConfirmation() {
    return new Promise((resolve) => {
      if (!raceLeaveModalEl) {
        resolve(false);
        return;
      }
      leaveResolver = resolve;
      raceLeaveModalEl.classList.remove("hidden");
      raceLeaveConfirmBtn?.focus();
    });
  }

  function closeLeaveModal(result) {
    if (raceLeaveModalEl) raceLeaveModalEl.classList.add("hidden");
    if (leaveResolver) {
      const done = leaveResolver;
      leaveResolver = null;
      done(Boolean(result));
    }
  }

  async function terminateCurrentRoomForAll(reason, byUserAction = false) {
    if (!currentRoom) return;
    const roomCode = currentRoom;
    terminatedRooms.add(roomCode);

    if (channel) {
      await sendRaceEvent("race_abort", {
        uuid: currentUser?.uuid,
        username: currentUser?.username || "Player",
        roomCode,
        reason: reason || "left_room"
      });
    }

    raceFinished = true;
    stopStopwatch();
    if (byUserAction) {
      setRaceMessage("You left this match. Room closed.");
      setStatus("Room closed.");
    }
    exitRoomToLobby();
  }

  async function handleBackAttempt(destinationHref) {
    if (!isActiveRaceRound()) {
      window.location.href = destinationHref || "index.html";
      return;
    }

    const confirmed = await askLeaveConfirmation();
    if (!confirmed) return;

    await terminateCurrentRoomForAll("manual_leave", true);
    window.location.href = destinationHref || "index.html";
  }

  function shakeActiveRow() {
    const activeRow = raceBoardEl?.lastElementChild;
    if (!activeRow) return;
    activeRow.classList.remove("race-row-shake");
    void activeRow.offsetWidth;
    activeRow.classList.add("race-row-shake");
  }

  async function sendProfile() {
    await sendRaceEvent("profile", {
      uuid: currentUser.uuid,
      username: currentUser.username,
      history: Array.from(myHistorySet),
      ready: selfReady,
      bestCorrect: selfBestCorrect
    });
  }

  function stopProfileHeartbeat() {
    if (!profileHeartbeatTimer) return;
    clearInterval(profileHeartbeatTimer);
    profileHeartbeatTimer = null;
  }

  function stopOpponentWatchdog() {
    if (!opponentWatchdogTimer) return;
    clearInterval(opponentWatchdogTimer);
    opponentWatchdogTimer = null;
  }

  function markOpponentSeen() {
    opponentPresent = true;
    lastOpponentSeenTs = Date.now();
  }

  function stopRoomIdleWatchdog() {
    if (!roomIdleTimer) return;
    clearInterval(roomIdleTimer);
    roomIdleTimer = null;
  }

  function startRoomIdleWatchdog() {
    stopRoomIdleWatchdog();
    roomIdleTimer = setInterval(() => {
      if (!currentRoom || raceStarted || raceFinished || opponentPresent) return;
      if (!roomOpenedAt) return;
      if (Date.now() - roomOpenedAt < ROOM_IDLE_LIMIT_MS) return;
      setStatus("Room expired after 7 minutes with no second player.", "warn");
      void terminateCurrentRoomForAll("room_idle_timeout", false);
    }, 5000);
  }

  async function handleRaceDraw(localTrigger = false, remoteWord = null) {
    if (raceFinished) return;
    raceFinished = true;
    stopStopwatch();
    markCurrentWordPlayed();
    setRaceMessage("10:00 reached — this match is a draw.");
    setStatus("Match drawn at 10:00.", "warn");

    if (localTrigger && channel && !raceDrawSent) {
      raceDrawSent = true;
      await sendRaceEvent("race_draw", {
        uuid: currentUser.uuid,
        username: currentUser.username,
        word: currentWord
      });
    }

    showRaceResultModal({
      won: false,
      winnerName: null,
      winnerMs: null,
      word: remoteWord || currentWord,
      isDraw: true
    });
  }

  function handleOpponentLeft(reasonName) {
    if (opponentLeftHandled || !currentRoom) return;
    opponentLeftHandled = true;
    raceFinished = true;
    stopStopwatch();
    const quitter = reasonName || opponentName || "Opponent";

    setRaceMessage(`${quitter} left. Match cancelled.`);
    setStatus("Room closed.");

    showRaceResultModal({
      won: true,
      winnerName: currentUser?.username || "You",
      winnerMs: raceElapsedMs,
      word: currentWord || "-"
    });

    const card = raceResultModalEl?.querySelector(".race-result-card");
    if (card) {
      card.classList.remove("win", "lose");
      card.classList.add("left");
    }
    if (raceResultKickerEl) raceResultKickerEl.textContent = "Match Cancelled";
    if (raceResultTitleEl) raceResultTitleEl.textContent = "Opponent Left";
    if (raceResultDetailsEl) {
      raceResultDetailsEl.innerHTML = `${quitter} left the room.<br>This match has been closed.`;
    }

    if (currentRoom) terminatedRooms.add(currentRoom);
  }

  function startOpponentWatchdog() {
    stopOpponentWatchdog();
    opponentWatchdogTimer = setInterval(() => {
      if (!currentRoom || !raceStarted || raceFinished || opponentLeftHandled) return;
      if (!lastOpponentSeenTs) return;
      if (!opponentPresent) return;
      const sinceSeen = Date.now() - lastOpponentSeenTs;
      if (sinceSeen < 25000) return;
      if (sinceSeen < OPPONENT_RECONNECT_GRACE_MS) {
        setStatus("Opponent connection unstable. Waiting for reconnection…", "warn");
        return;
      }
      handleOpponentLeft(opponentName || "Opponent");
    }, 1200);
  }

  function startProfileHeartbeat() {
    stopProfileHeartbeat();
    profileHeartbeatTimer = setInterval(() => {
      if (!currentRoom || !channel) return;
      void sendProfile();
      if (selfReady && !raceStarted) {
        void sendRaceEvent("ready", {
          uuid: currentUser.uuid,
          username: currentUser.username,
          ready: true,
          history: Array.from(myHistorySet)
        });
      }
    }, 2200);
  }

  async function sendGreenProgress(correctCount) {
    if (!raceStarted || raceFinished || !channel) return;
    const safeCount = Math.max(0, Math.min(wordLength, Number(correctCount) || 0));
    await sendRaceEvent("guess_progress", {
      uuid: currentUser.uuid,
      username: currentUser.username,
      correctCount: safeCount,
      wordLength
    });
  }

  function requestedRoomFromUrl() {
    return sanitizeRoomCode(new URLSearchParams(window.location.search).get("room"));
  }

  function redirectToMainForRaceLogin() {
    const url = new URL("index.html", window.location.href);
    url.searchParams.set("raceLogin", "1");
    const room = requestedRoomFromUrl();
    if (room) url.searchParams.set("room", room);
    window.location.replace(url.toString());
  }

  function getUserData() {
    try {
      const raw = localStorage.getItem(userKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function loadMyHistory() {
    if (!currentUser?.uuid) return new Set();
    try {
      const raw = localStorage.getItem(`${historyKeyPrefix}${currentUser.uuid}`);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.map((v) => normalizeWordKey(v)).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function saveMyHistory() {
    if (!currentUser?.uuid) return;
    const arr = Array.from(myHistorySet).filter(Boolean).sort();
    localStorage.setItem(`${historyKeyPrefix}${currentUser.uuid}`, JSON.stringify(arr));
  }

  function markCurrentWordPlayed() {
    const key = normalizeWordKey(currentWord);
    if (!key) return;
    myHistorySet.add(key);
    saveMyHistory();
  }

  async function ensureAuthenticatedUser() {
    currentUser = getUserData();
    if (!currentUser?.uuid || !currentUser?.username) {
      redirectToMainForRaceLogin();
      return false;
    }

    if (!supabase) {
      redirectToMainForRaceLogin();
      return false;
    }

    const { data, error } = await supabase
      .from(PLAYER_TABLE)
      .select("uuid, username")
      .eq("uuid", currentUser.uuid)
      .maybeSingle();

    if (error || !data?.uuid) {
      redirectToMainForRaceLogin();
      return false;
    }

    createRoomBtn.disabled = false;
    myHistorySet = loadMyHistory();
    setStatus("Create room or open an invite link.");
    return true;
  }

  function sanitizeRoomCode(value) {
    return (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  }

  function normalizeWordKey(value) {
    const clean = String(value || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (clean.length !== RACE_WORD_LENGTH) return null;
    return clean;
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

  function combinedBlockedWords() {
    const blocked = new Set();
    for (const value of myHistorySet) {
      const key = normalizeWordKey(value);
      if (key) blocked.add(key);
    }
    for (const value of opponentHistorySet) {
      const key = normalizeWordKey(value);
      if (key) blocked.add(key);
    }
    return blocked;
  }

  function randomAlphaWord(length = RACE_WORD_LENGTH) {
    const vowels = "AEIOU";
    const consonants = "BCDFGHJKLMNPQRSTVWXYZ";
    let out = "";
    for (let i = 0; i < length; i += 1) {
      const pool = i % 2 === 1 ? vowels : consonants;
      out += pool[Math.floor(Math.random() * pool.length)];
    }
    return out;
  }

  async function isDictionaryWordOfLength(word, length = RACE_WORD_LENGTH) {
    if (!word || word.length !== length) return false;
    const cacheKey = `dict:${word}`;
    if (wordValidationCache[cacheKey] !== undefined) return wordValidationCache[cacheKey];
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`);
      const ok = response.ok;
      wordValidationCache[cacheKey] = ok;
      return ok;
    } catch {
      wordValidationCache[cacheKey] = false;
      return false;
    }
  }

  async function pickDictionaryWord(blocked, length = RACE_WORD_LENGTH, maxAttempts = 24) {
    for (let i = 0; i < maxAttempts; i += 1) {
      const candidate = randomAlphaWord(length);
      if (blocked.has(candidate)) continue;
      const ok = await isDictionaryWordOfLength(candidate, length);
      if (ok) return candidate;
    }
    return null;
  }

  async function getSupabaseWordPool() {
    if (supabaseWordPool) return supabaseWordPool;
    try {
      const { data, error } = await supabase
        .from(WORD_TABLE)
        .select("word")
        .limit(1200);
      if (error) throw error;

      const unique = new Set();
      for (const row of data || []) {
        const key = normalizeWordKey(row?.word);
        if (key) unique.add(key);
      }
      supabaseWordPool = Array.from(unique);
      return supabaseWordPool;
    } catch {
      supabaseWordPool = [];
      return supabaseWordPool;
    }
  }

  function pickFallbackWord(blocked) {
    const pool = FALLBACK_WORDS.map((w) => normalizeWordKey(w)).filter(Boolean);
    const available = pool.filter((w) => !blocked.has(w));
    if (available.length > 0) return available[Math.floor(Math.random() * available.length)];
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
    return "RACE";
  }

  async function ensureWordForGame() {
    if (currentWord) return currentWord;

    const blocked = combinedBlockedWords();
    const fromDictionary = await pickDictionaryWord(blocked);
    if (fromDictionary) {
      currentWord = fromDictionary;
      wordLength = currentWord.length;
      currentWordId = null;
      return currentWord;
    }

    const pool = await getSupabaseWordPool();
    const available = pool.filter((w) => !blocked.has(w));
    const chosen = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : pickFallbackWord(blocked);

    currentWord = chosen;
    wordLength = currentWord.length;
    currentWordId = null;
    return currentWord;
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
    if (elapsed >= DRAW_LIMIT_MS) {
      void handleRaceDraw(true);
    }
  }

  function startStopwatch(startAt) {
    raceStartTs = startAt || Date.now();
  raceElapsedMs = 0;
    raceStopwatchEl.textContent = "00:00.00";
    if (raceTimer) clearInterval(raceTimer);
    raceTimer = setInterval(tickStopwatch, 80);
  }

  function stopStopwatch() {
    if (raceTimer) {
      clearInterval(raceTimer);
      raceTimer = null;
    }
    raceElapsedMs = Math.max(0, Date.now() - raceStartTs);
    raceStopwatchEl.textContent = formatStopwatch(raceElapsedMs);
  }

  async function isValidRaceWord(word) {
    if (!word || word.length !== wordLength) return false;
    if (wordValidationCache[word] !== undefined) return wordValidationCache[word];
    if (!/^[A-Z]+$/.test(word)) {
      wordValidationCache[word] = false;
      return false;
    }

    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`);
      const ok = response.ok;
      wordValidationCache[word] = ok;
      return ok;
    } catch {
      wordValidationCache[word] = false;
      return false;
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

    const wrap = raceBoardEl.closest(".board-wrap");
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }

  function enterRaceStage(startAt) {
    roomCard.classList.add("hidden");
    createStage.classList.add("hidden");
    raceGameEl.classList.remove("hidden");

    raceRows = [];
    currentGuess = "";
    raceStarted = true;
    raceFinished = false;
    opponentLeftHandled = false;
  raceDrawSent = false;
    opponentProgress = 0;
  selfBestCorrect = 0;
  opponentBestCorrect = 0;

    buildRaceKeyboard();
    renderRaceBoard();
    setRaceMessage("Race started. Unlimited tries. Same Wordle rules.");
    setOpponentPressure(`${getOpponentDisplayName()}: 0/${wordLength} letters locked in`);
    startOpponentWatchdog();
    startStopwatch(startAt);
  }

  function prepareNextRoundInRoom() {
    raceStarted = false;
    raceFinished = false;
    raceRows = [];
    currentGuess = "";
    currentWord = null;
    currentWordId = null;
    opponentProgress = 0;
    selfBestCorrect = 0;
    opponentBestCorrect = 0;
    selfReady = false;
    opponentReady = false;
    startBroadcasted = false;
  opponentLeftHandled = false;
  raceDrawSent = false;
  lastOpponentSeenTs = Date.now();

    if (raceTimer) {
      clearInterval(raceTimer);
      raceTimer = null;
    }

    raceGameEl.classList.add("hidden");
    roomCard.classList.remove("hidden");
    createStage.classList.add("hidden");
    readyBtn.disabled = false;
    readyBtn.textContent = "Ready";
    setOpponentPressure("");
    setRaceMessage("Waiting to start…");
  setStatus("Round finished. Toggle Ready when you want a rematch.", "info");
    updatePresenceUI();
    void sendProfile();
    startProfileHeartbeat();
    startOpponentWatchdog();
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
      setStatus("Room live. Share code. Room expires in 7 minutes if no one joins.", "loud");
    } else {
      roomRoleEl.textContent = "You are Challenger";
      roomHintEl.textContent = "You joined this room. Ready up to start.";
      copyLinkBtn.classList.add("hidden");
      setStatus("Connected. Toggle Ready when prepared.", "success");
    }
    updatePresenceUI();
  }

  async function maybeStartRace() {
    if (!selfReady || !opponentReady || !channel || startBroadcasted) return;
    if (currentRole !== "host") return;

    startBroadcasted = true;
    const startAt = Date.now() + 800;
    if (!currentWord) await ensureWordForGame();
    await sendRaceEvent("word_selected", { word: currentWord, wordKey: normalizeWordKey(currentWord) });
    await sendRaceEvent("race_start", { startAt });
    setStatus("Both ready. Starting race...");
  }

  async function setupRoom(roomCode, role) {
    if (terminatedRooms.has(roomCode)) {
      setStatus("This room was ended and can't be rejoined. Create a new room.");
      raceGameEl.classList.add("hidden");
      roomCard.classList.add("hidden");
      createStage.classList.remove("hidden");
      return;
    }

    applyLobbyRole(role, roomCode);

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
        markOpponentSeen();
        opponentName = payload.username || opponentName || "Opponent";
        opponentPresent = true;
        if (Array.isArray(payload.history)) {
          opponentHistorySet = new Set(payload.history.map((v) => normalizeWordKey(v)).filter(Boolean));
        }
        opponentReady = Boolean(payload.ready);
        updatePresenceUI();
        setStatus(opponentReady ? `${opponentName} is ready. You can start now.` : `${opponentName} is in room.`, opponentReady ? "success" : "info");
        void maybeStartRace();
      })
      .on("broadcast", { event: "profile" }, ({ payload }) => {
        if (!payload || payload.uuid === currentUser.uuid) return;
        markOpponentSeen();
        opponentName = payload.username || opponentName || "Opponent";
        const arr = Array.isArray(payload.history) ? payload.history : [];
        opponentHistorySet = new Set(arr.map((v) => normalizeWordKey(v)).filter(Boolean));
        if (typeof payload.ready === "boolean") opponentReady = payload.ready;
        const best = Number(payload.bestCorrect);
        if (raceStarted && Number.isFinite(best) && best > opponentBestCorrect) {
          opponentBestCorrect = Math.max(0, Math.min(wordLength, best));
          opponentProgress = opponentBestCorrect;
          if (opponentProgress > 0 && opponentProgress < wordLength) {
            setOpponentPressure(`${opponentName}: ${opponentProgress}/${wordLength} letters locked in`);
            opponentPressureEl?.classList.remove("pressure-pulse");
            void opponentPressureEl?.offsetWidth;
            opponentPressureEl?.classList.add("pressure-pulse");
          }
        }
        updatePresenceUI();
        setStatus(`${opponentName} joined the room.`, "success");
      })
      .on("broadcast", { event: "presence_ping" }, ({ payload }) => {
        if (!payload || payload.uuid === currentUser.uuid) return;
        markOpponentSeen();
        void sendProfile();
      })
      .on("broadcast", { event: "guess_progress" }, ({ payload }) => {
        if (!payload || payload.uuid === currentUser.uuid || !raceStarted || raceFinished) return;
        markOpponentSeen();
        opponentName = payload.username || opponentName || "Opponent";
        const payloadLen = Number(payload.wordLength);
        const expectedLen = Number.isFinite(payloadLen) && payloadLen > 0 ? payloadLen : wordLength;
        const announced = Math.max(0, Math.min(expectedLen, Number(payload.correctCount) || 0));
        opponentBestCorrect = Math.max(opponentBestCorrect, announced);
        opponentProgress = opponentBestCorrect;

        if (opponentProgress > 0 && opponentProgress < wordLength) {
          setOpponentPressure(`${opponentName}: ${opponentProgress}/${wordLength} letters locked in`);
          opponentPressureEl?.classList.remove("pressure-pulse");
          void opponentPressureEl?.offsetWidth;
          opponentPressureEl?.classList.add("pressure-pulse");
        }
      })
      .on("broadcast", { event: "word_selected" }, ({ payload }) => {
        if (!payload?.word) return;
        markOpponentSeen();
        currentWord = normalizeWordKey(payload.word) || String(payload.word).toUpperCase();
        wordLength = currentWord.length;
        currentWordId = null;
      })
      .on("broadcast", { event: "race_start" }, ({ payload }) => {
        markOpponentSeen();
        const startAt = Number(payload?.startAt) || Date.now();
        setStatus("Race started. 10-minute limit active.", "loud");
        enterRaceStage(startAt);
      })
      .on("broadcast", { event: "race_finish" }, ({ payload }) => {
        if (!payload) return;
        if (payload.uuid === currentUser.uuid) return;
        if (raceFinished) return;
        markOpponentSeen();

        raceFinished = true;
        stopStopwatch();
        markCurrentWordPlayed();
        opponentName = payload.username || opponentName || "Opponent";
        setRaceMessage(`You lost. ${opponentName} solved first.`);
        setOpponentPressure(`${opponentName} finished the word.`);
        setStatus("Race complete.", "success");
        showRaceResultModal({
          won: false,
          winnerName: opponentName,
          winnerMs: Number(payload.elapsedMs),
          word: payload.word || currentWord
        });
      })
      .on("broadcast", { event: "race_draw" }, ({ payload }) => {
        if (!payload || payload.uuid === currentUser.uuid || raceFinished) return;
        markOpponentSeen();
        void handleRaceDraw(false, payload.word || currentWord);
      })
      .on("broadcast", { event: "race_abort" }, ({ payload }) => {
        if (!payload || payload.uuid === currentUser.uuid) return;
        markOpponentSeen();
        const roomCode = String(payload.roomCode || currentRoom || "");
        if (roomCode) terminatedRooms.add(roomCode);
        if (!currentRoom || roomCode !== currentRoom) return;
        handleOpponentLeft(payload.username || "Opponent");
      });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setStatus(role === "host" ? "Room online. Share code and toggle Ready." : "Room connected. Toggle Ready to queue.", "loud");
        void sendProfile();
        void sendRaceEvent("presence_ping", {
          uuid: currentUser.uuid,
          username: currentUser.username
        });
        markOpponentSeen();
        startProfileHeartbeat();
        startOpponentWatchdog();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setStatus("Connection unstable. Re-syncing room...", "warn");
      } else if (status === "CLOSED") {
        setStatus("Connection closed. Rejoin room if needed.", "warn");
      }
    });

    selfReady = false;
    opponentReady = false;
    opponentName = "";
    opponentPresent = false;
  opponentLeftHandled = false;
  lastOpponentSeenTs = Date.now();
  opponentBestCorrect = 0;
  roomOpenedAt = Date.now();
    startBroadcasted = false;
    readyBtn.disabled = false;
    readyBtn.textContent = "Ready";
    readyBtn.classList.remove("is-ready");
    startRoomIdleWatchdog();
    updatePresenceUI();
  }

  function exitRoomToLobby() {
    currentRoom = null;
    currentRole = null;
    currentWord = null;
    currentWordId = null;
    selfReady = false;
    opponentReady = false;
    startBroadcasted = false;
    raceStarted = false;
    raceFinished = false;
    raceRows = [];
    currentGuess = "";
    opponentProgress = 0;
    selfBestCorrect = 0;
    opponentBestCorrect = 0;
    opponentPresent = false;
  opponentLeftHandled = false;
  lastOpponentSeenTs = 0;

    if (raceTimer) {
      clearInterval(raceTimer);
      raceTimer = null;
    }

    if (channel) {
      supabase.removeChannel(channel).catch(() => {});
      channel = null;
    }

    stopProfileHeartbeat();
  stopOpponentWatchdog();
  stopRoomIdleWatchdog();

    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url);

    raceGameEl.classList.add("hidden");
    roomCard.classList.add("hidden");
    createStage.classList.remove("hidden");
    readyBtn.disabled = false;
    readyBtn.textContent = "Ready";
    setStatus("Create room or join with a code.", "info");
    setOpponentPressure("");
  }

  async function handleReady() {
    if (!currentRoom || raceStarted || startBroadcasted) return;

    selfReady = !selfReady;
    readyBtn.disabled = false;
    readyBtn.textContent = selfReady ? "Ready ✓" : "Ready";
    readyBtn.classList.toggle("is-ready", selfReady);
    updatePresenceUI();

    await sendRaceEvent("ready", {
      uuid: currentUser.uuid,
      username: currentUser.username,
      ready: selfReady,
      history: Array.from(myHistorySet)
    });
    await sendProfile();

    if (selfReady && opponentReady) {
      setStatus("Both ready. Starting...", "success");
      readyBtn.disabled = true;
      readyBtn.textContent = "Starting…";
      await maybeStartRace();
      return;
    }

    if (selfReady) {
      setStatus(opponentPresent ? `${opponentName} is in room. Waiting for them to ready.` : "Ready set. Waiting for opponent to join.", "info");
    } else {
      setStatus("You are unready.", "info");
    }
  }

  async function createRoom() {
    const code = randomRoomCode();
    await setupRoom(code, "host");
  }

  async function joinRoomByCodeInput() {
    const roomCode = sanitizeRoomCode(joinCodeInput.value);
    joinCodeInput.value = roomCode;
    if (roomCode.length !== 6) {
      setStatus("Enter a valid 6-character room code.");
      return;
    }
    await setupRoom(roomCode, "guest");
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
      shakeActiveRow();
      return;
    }

    const guess = currentGuess.toUpperCase();
    const validWord = await isValidRaceWord(guess);
    if (!validWord) {
      setRaceMessage("That word is not accepted.");
      shakeActiveRow();
      return;
    }

    const colors = getTileColors(guess, currentWord);
    const correctCount = colors.filter((c) => c === "correct").length;
    selfBestCorrect = Math.max(selfBestCorrect, correctCount);
    await sendGreenProgress(selfBestCorrect);

    const rowIndex = raceRows.length;
    raceRows.push({ guess, colors: [] });
    currentGuess = "";
    renderRaceBoard();

    for (let i = 0; i < colors.length; i += 1) {
      window.setTimeout(() => {
        raceRows[rowIndex].colors[i] = colors[i];
        updateKeyboardColor(guess[i], colors[i]);
        renderRaceBoard();
      }, i * 180);
    }

    if (guess === currentWord) {
      raceFinished = true;
      window.setTimeout(async () => {
        stopStopwatch();
        markCurrentWordPlayed();
        setRaceMessage("You won the race 🏁");
        setStatus("Race complete.");
        await sendRaceEvent("race_finish", {
          uuid: currentUser.uuid,
          username: currentUser.username,
          elapsedMs: raceElapsedMs,
          word: currentWord
        });
        showRaceResultModal({
          won: true,
          winnerName: currentUser.username,
          winnerMs: raceElapsedMs,
          word: currentWord
        });
      }, colors.length * 180 + 120);
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

  joinCodeBtn?.addEventListener("click", () => {
    void joinRoomByCodeInput();
  });

  joinCodeInput?.addEventListener("input", () => {
    joinCodeInput.value = sanitizeRoomCode(joinCodeInput.value);
  });

  joinCodeInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void joinRoomByCodeInput();
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

  const onBackPress = (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastBackPressTs < 260) return;
    lastBackPressTs = now;
    raceBackButton?.classList.add("pressed");
    window.setTimeout(() => raceBackButton?.classList.remove("pressed"), 140);
    const href = raceBackButton.getAttribute("href") || "index.html";
    void handleBackAttempt(href);
  };

  raceBackButton?.addEventListener("click", onBackPress);
  raceBackButton?.addEventListener("touchend", onBackPress, { passive: false });
  raceBackButton?.addEventListener("pointerup", onBackPress);

  raceLeaveButton?.addEventListener("click", (e) => {
    e.preventDefault();
    void handleBackAttempt("index.html");
  });
  raceLeaveButton?.addEventListener("touchend", (e) => {
    e.preventDefault();
    void handleBackAttempt("index.html");
  }, { passive: false });

  raceResultOkBtn?.addEventListener("click", () => {
    closeRaceResultAndReturn();
  });

  raceLeaveCancelBtn?.addEventListener("click", () => closeLeaveModal(false));
  raceLeaveConfirmBtn?.addEventListener("click", () => closeLeaveModal(true));
  raceLeaveModalEl?.addEventListener("click", (e) => {
    if (e.target === raceLeaveModalEl) closeLeaveModal(false);
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
    stopProfileHeartbeat();
    stopOpponentWatchdog();
    if (raceTimer) clearInterval(raceTimer);
    if (channel) {
      try {
        await supabase.removeChannel(channel);
      } catch {}
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !currentRoom || !channel) return;
    void sendProfile();
    void sendRaceEvent("presence_ping", {
      uuid: currentUser?.uuid,
      username: currentUser?.username || "Player"
    });

    if (selfReady && !raceStarted) {
      void sendRaceEvent("ready", {
        uuid: currentUser.uuid,
        username: currentUser.username,
        ready: true,
        history: Array.from(myHistorySet)
      });
    }
  });

  syncViewportHeight();
  window.addEventListener("resize", syncViewportHeight, { passive: true });
  window.addEventListener("orientationchange", syncViewportHeight, { passive: true });
  window.visualViewport?.addEventListener("resize", syncViewportHeight, { passive: true });

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
