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
  const presenceSelfNameEl = document.getElementById("presence-self-name");
  const presenceSelfReadyEl = document.getElementById("presence-self-ready");
  const presenceOpponentNameEl = document.getElementById("presence-opponent-name");
  const presenceOpponentReadyEl = document.getElementById("presence-opponent-ready");

  const raceGameEl = document.getElementById("race-game");
  const raceBoardEl = document.getElementById("race-board");
  const raceKeyboardEl = document.getElementById("race-keyboard");
  const raceStopwatchEl = document.getElementById("race-stopwatch");
  const opponentPressureEl = document.getElementById("opponent-pressure");
  const raceMessageEl = document.getElementById("race-game-message");
  const appLoader = document.getElementById("app-loader");
  const raceResultModalEl = document.getElementById("race-result-modal");
  const raceResultKickerEl = document.getElementById("race-result-kicker");
  const raceResultTitleEl = document.getElementById("race-result-title");
  const raceResultDetailsEl = document.getElementById("race-result-details");
  const raceResultOkBtn = document.getElementById("race-result-ok");

  const userKey = "wordle-user-data-v2";
  const historyKeyPrefix = "wordle-race-history-";
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
  let raceElapsedMs = 0;
  let currentWordId = null;
  let myHistorySet = new Set();
  let opponentHistorySet = new Set();
  let opponentName = "Opponent";
  let opponentProgress = 0;
  let lastSentProgressCount = -1;
  const wordValidationCache = {};

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

  function setOpponentPressure(text) {
    if (!opponentPressureEl) return;
    opponentPressureEl.textContent = text;
  }

  function ordinalWord(n) {
    const map = {
      1: "first",
      2: "second",
      3: "third",
      4: "fourth",
      5: "fifth",
      6: "sixth",
      7: "seventh",
      8: "eighth",
      9: "ninth",
      10: "tenth"
    };
    return map[n] || `${n}th`;
  }

  function setReadyBadge(el, ready) {
    if (!el) return;
    el.textContent = ready ? "Ready" : "Not ready";
    el.classList.toggle("ready", ready);
    el.classList.toggle("not-ready", !ready);
  }

  function updatePresenceUI() {
    if (presenceSelfNameEl) {
      presenceSelfNameEl.textContent = currentUser?.username ? `${currentUser.username} (You)` : "You";
    }
    if (presenceOpponentNameEl) {
      presenceOpponentNameEl.textContent = opponentName || "Waiting for opponent…";
    }
    setReadyBadge(presenceSelfReadyEl, selfReady);
    setReadyBadge(presenceOpponentReadyEl, opponentReady);
  }

  function showRaceResultModal({ won, winnerName, winnerMs, word }) {
    if (!raceResultModalEl) return;
    const shownWord = (word || currentWord || "").toUpperCase();
    const finalWinnerName = winnerName || (won ? currentUser?.username || "You" : opponentName || "Opponent");
    const finalWinnerMs = Number.isFinite(winnerMs) ? winnerMs : won ? raceElapsedMs : null;

    raceResultKickerEl.textContent = "Race Complete";
    raceResultTitleEl.textContent = won ? "You Won 🏁" : "You Lost";
    raceResultDetailsEl.innerHTML = `${finalWinnerName} won${finalWinnerMs !== null ? ` in <strong>${formatStopwatch(finalWinnerMs)}</strong>` : ""}.<br>Word was: <strong>${shownWord}</strong>`;

    const card = raceResultModalEl.querySelector(".race-result-card");
    if (card) {
      card.classList.toggle("win", won);
      card.classList.toggle("lose", !won);
    }

    raceResultModalEl.classList.remove("hidden");
  }

  function closeRaceResultAndReturn() {
    if (raceResultModalEl) raceResultModalEl.classList.add("hidden");
    window.location.href = "index.html";
  }

  function shakeActiveRow() {
    const activeRow = raceBoardEl?.lastElementChild;
    if (!activeRow) return;
    activeRow.classList.remove("race-row-shake");
    void activeRow.offsetWidth;
    activeRow.classList.add("race-row-shake");
  }

  async function sendTypingProgress(count) {
    if (!raceStarted || raceFinished || !channel) return;
    const safeCount = Math.max(0, Math.min(wordLength, Number(count) || 0));
    if (safeCount === lastSentProgressCount) return;
    lastSentProgressCount = safeCount;
    await sendRaceEvent("typing_progress", {
      uuid: currentUser.uuid,
      username: currentUser.username,
      count: safeCount
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
      return new Set(parsed.map(v => Number(v)).filter(v => Number.isFinite(v) && v > 0));
    } catch {
      return new Set();
    }
  }

  function saveMyHistory() {
    if (!currentUser?.uuid) return;
    const arr = Array.from(myHistorySet).sort((a, b) => a - b);
    localStorage.setItem(`${historyKeyPrefix}${currentUser.uuid}`, JSON.stringify(arr));
  }

  function markCurrentWordPlayed() {
    if (!currentWordId) return;
    myHistorySet.add(currentWordId);
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

  function chooseWordIdForRoom(roomCode) {
    const preferred = roomCodeToWordId(roomCode);
    const blocked = new Set([...myHistorySet, ...opponentHistorySet]);

    for (let offset = 0; offset < 670; offset += 1) {
      const candidate = ((preferred - 1 + offset) % 670) + 1;
      if (!blocked.has(candidate)) return candidate;
    }

    return preferred;
  }

  function fallbackWordForRoom(code) {
    const idx = (roomCodeToWordId(code) - 1) % FALLBACK_WORDS.length;
    return FALLBACK_WORDS[Math.max(0, idx)] || "RACE";
  }

  async function ensureWordForRoom(code) {
    if (currentWord) return currentWord;

    currentWordId = chooseWordIdForRoom(code);
    const remote = await fetchBattleWordById(currentWordId);
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
    opponentProgress = 0;
    lastSentProgressCount = -1;

    buildRaceKeyboard();
    renderRaceBoard();
    setRaceMessage("Race started. Unlimited tries. Same Wordle rules.");
    setOpponentPressure(`${opponentName || "Opponent"} is starting...`);
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
    updatePresenceUI();
  }

  async function maybeStartRace() {
    if (!selfReady || !opponentReady || !channel || startBroadcasted) return;
    if (currentRole !== "host") return;

    startBroadcasted = true;
    const startAt = Date.now() + 800;
    if (!currentWord) await ensureWordForRoom(currentRoom);
    await sendRaceEvent("word_selected", { word: currentWord, wordId: currentWordId });
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
        opponentName = payload.username || opponentName || "Opponent";
        opponentReady = Boolean(payload.ready);
        updatePresenceUI();
        setStatus(opponentReady ? "Opponent is ready. Waiting for you." : "Opponent is not ready yet.");
        void maybeStartRace();
      })
      .on("broadcast", { event: "profile" }, ({ payload }) => {
        if (!payload || payload.uuid === currentUser.uuid) return;
        opponentName = payload.username || opponentName || "Opponent";
        const arr = Array.isArray(payload.history) ? payload.history : [];
        opponentHistorySet = new Set(arr.map(v => Number(v)).filter(v => Number.isFinite(v) && v > 0));
        if (typeof payload.ready === "boolean") opponentReady = payload.ready;
        updatePresenceUI();
        setStatus(`${opponentName} joined the room.`);
      })
      .on("broadcast", { event: "typing_progress" }, ({ payload }) => {
        if (!payload || payload.uuid === currentUser.uuid || !raceStarted || raceFinished) return;
        opponentName = payload.username || opponentName || "Opponent";
        opponentProgress = Math.max(0, Math.min(wordLength, Number(payload.count) || 0));

        if (opponentProgress <= 0) {
          setOpponentPressure(`${opponentName} is preparing a guess...`);
        } else if (opponentProgress >= wordLength) {
          setOpponentPressure(`${opponentName} completed a guess.`);
        } else {
          setOpponentPressure(`${opponentName} guessed the ${ordinalWord(opponentProgress)} letter...`);
        }
      })
      .on("broadcast", { event: "word_selected" }, ({ payload }) => {
        if (!payload?.word) return;
        currentWord = String(payload.word).toUpperCase();
        wordLength = currentWord.length;
        const idNum = Number(payload.wordId);
        if (Number.isFinite(idNum) && idNum > 0) currentWordId = idNum;
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
        markCurrentWordPlayed();
        opponentName = payload.username || opponentName || "Opponent";
        setRaceMessage(`You lost. ${opponentName} solved first.`);
        setOpponentPressure(`${opponentName} finished the word.`);
        setStatus("Race complete.");
        showRaceResultModal({
          won: false,
          winnerName: opponentName,
          winnerMs: Number(payload.elapsedMs),
          word: payload.word || currentWord
        });
      });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setStatus(role === "host" ? "Room live. Share code and click Ready." : "Connected to room. Click Ready.");
        void sendRaceEvent("profile", {
          uuid: currentUser.uuid,
          username: currentUser.username,
          history: Array.from(myHistorySet),
          ready: selfReady
        });
      }
    });

    selfReady = false;
    opponentReady = false;
    opponentName = "Opponent";
    startBroadcasted = false;
    readyBtn.disabled = false;
    readyBtn.textContent = "Ready";
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
  lastSentProgressCount = -1;

    if (raceTimer) {
      clearInterval(raceTimer);
      raceTimer = null;
    }

    if (channel) {
      supabase.removeChannel(channel).catch(() => {});
      channel = null;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url);

    raceGameEl.classList.add("hidden");
    roomCard.classList.add("hidden");
    createStage.classList.remove("hidden");
    readyBtn.disabled = false;
    readyBtn.textContent = "Ready";
    setStatus("Create room or join with a code.");
    setOpponentPressure("");
  }

  async function handleReady() {
    if (!currentRoom || raceStarted) return;

    selfReady = true;
    readyBtn.disabled = true;
    readyBtn.textContent = "Ready ✓";
    updatePresenceUI();

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
    const rowIndex = raceRows.length;
    raceRows.push({ guess, colors: [] });
    currentGuess = "";
    renderRaceBoard();
  opponentProgress = 0;
  await sendTypingProgress(wordLength);
  await sendTypingProgress(0);

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
      void sendTypingProgress(currentGuess.length);
      return;
    }

    if (/^[A-Z]$/.test(key) && currentGuess.length < wordLength) {
      currentGuess += key;
      renderRaceBoard();
      void sendTypingProgress(currentGuess.length);
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

  raceResultOkBtn?.addEventListener("click", () => {
    closeRaceResultAndReturn();
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
