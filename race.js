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
  const createRoomCard = document.getElementById("create-room-card");
  const joinRoomCard = document.getElementById("join-room-card");

  const roomKey = "wordle-race-room";
  const userKey = "wordle-user-data-v2";
  const WORD_TABLE = "battle_words";
  const PLAYER_TABLE = "battle_players";

  let currentUser = null;
  let currentRoom = null;
  let currentRole = null;
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

  function getUserData() {
    try {
      const raw = localStorage.getItem(userKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function setRaceMessage(text) {
    raceMessageEl.textContent = text;
  }

  function setControlsEnabled(enabled) {
    createRoomBtn.disabled = !enabled;
    joinRoomBtn.disabled = !enabled;
    roomInput.disabled = !enabled;
    startRaceBtn.disabled = true;
  }

  async function ensureAuthenticatedUser() {
    currentUser = getUserData();
    if (!currentUser?.username || !currentUser?.uuid) {
      setControlsEnabled(false);
      setStatus("Login required: create/login your account from the main game leaderboard first.");
      return false;
    }

    if (!supabase) {
      setControlsEnabled(false);
      setStatus("Supabase client not loaded.");
      return false;
    }

    const { data, error } = await supabase
      .from(PLAYER_TABLE)
      .select("uuid, username")
      .eq("uuid", currentUser.uuid)
      .maybeSingle();

    if (error || !data?.uuid) {
      setControlsEnabled(false);
      setStatus("Your account is not in battle_players yet.");
      return false;
    }

    setControlsEnabled(true);
    setStatus(`Logged in as ${currentUser.username}. Create or join a room.`);
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

  async function ensureWordForRoom(code) {
    if (currentWord) return currentWord;
    const word = await fetchBattleWordById(roomCodeToWordId(code));
    if (!word) return null;
    currentWord = word;
    wordLength = word.length;
    return word;
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

  function applyRoleUI(role) {
    if (role === "host") {
      createRoomCard?.classList.remove("hidden");
      joinRoomCard?.classList.add("hidden");
      shareLinkBtn?.classList.remove("hidden");
      copyLinkBtn?.classList.remove("hidden");
      roomRoleEl.textContent = "You are Host";
      roomHintEl.textContent = "Share this code/link with your challenger.";
    } else {
      joinRoomCard?.classList.remove("hidden");
      createRoomCard?.classList.add("hidden");
      shareLinkBtn?.classList.add("hidden");
      copyLinkBtn?.classList.add("hidden");
      roomRoleEl.textContent = "You are Challenger";
      roomHintEl.textContent = "You joined the room. Press Play when ready.";
    }
  }

  function setRoom(code, role) {
    const cleanCode = sanitizeRoomCode(code);
    if (!cleanCode) return;

    currentRoom = cleanCode;
    currentRole = role;
    currentWord = null;

    roomCard.classList.remove("hidden");
    roomCodeEl.textContent = cleanCode;
    roomLinkEl.value = roomInviteLink(cleanCode);
    localStorage.setItem(roomKey, JSON.stringify({ code: cleanCode, role, updatedAt: Date.now() }));

    const url = new URL(window.location.href);
    url.searchParams.set("room", cleanCode);
    window.history.replaceState({}, "", url);

    applyRoleUI(role);
    startRaceBtn.disabled = false;
    setStatus(role === "host" ? "Room created. Share the code with challenger." : "Room joined. Ready to race.");
  }

  async function createRoom() {
    if (!(await ensureAuthenticatedUser())) return;
    if (currentRole === "host" && currentRoom) {
      setStatus("You already host a room. Share your code or start race.");
      return;
    }
    setRoom(randomRoomCode(), "host");
  }

  async function joinRoom() {
    if (!(await ensureAuthenticatedUser())) return;
    if (currentRole === "host" && currentRoom) {
      setStatus("Host cannot join another room. Use your current room.");
      return;
    }

    const cleanCode = sanitizeRoomCode(roomInput.value);
    roomInput.value = cleanCode;
    if (cleanCode.length !== 6) {
      setStatus("Room code must be 6 letters/numbers.");
      return;
    }
    setRoom(cleanCode, "guest");
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
      setRaceMessage(`Solved in ${formatStopwatch(Date.now() - raceStartTs)}. Share your time with opponent.`);
      setStatus("Solved ✅ Compare time with your opponent.");
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

    const word = await ensureWordForRoom(currentRoom);
    if (!word) {
      setStatus("Could not load race word.");
      return;
    }

    raceRows = [];
    currentGuess = "";
    raceStarted = true;
    raceFinished = false;
    raceGameEl.classList.remove("hidden");
    setRaceMessage("Race started. Unlimited tries. No clues.");
    renderRaceBoard();
    startStopwatch();
  }

  function restoreRoomFromUrlOrState() {
    const roomFromUrl = sanitizeRoomCode(new URLSearchParams(window.location.search).get("room"));
    if (roomFromUrl) {
      roomInput.value = roomFromUrl;
      setRoom(roomFromUrl, "guest");
      return;
    }

    try {
      const saved = JSON.parse(localStorage.getItem(roomKey) || "null");
      if (saved?.code && (saved.role === "host" || saved.role === "guest")) {
        setRoom(saved.code, saved.role);
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
      setStatus("Create a room first.");
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
    setStatus(ok ? "Share not available here, link copied instead." : "Could not share/copy link.");
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
    if (raceTimer) clearInterval(raceTimer);
  });

  buildRaceKeyboard();
  ensureAuthenticatedUser().then((ok) => {
    if (ok) restoreRoomFromUrlOrState();
    hideLoader();
  });
})();
