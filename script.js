(function() {
  // ======================= AUTHENTICATION =======================
  let authenticated = false;
  const passwordOverlay = document.getElementById("password-overlay");
  const passwordInput = document.getElementById("password-input");
  const passwordSubmit = document.getElementById("password-submit");
  const passwordError = document.getElementById("password-error");
  const gamePanel = document.getElementById("game-panel");

  // Prevent removal of password overlay via devtools
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.removedNodes.length > 0) {
        const overlayExists = document.getElementById("password-overlay");
        if (!overlayExists && !authenticated) {
          // Overlay was removed, re-add it and reset auth
          document.body.insertBefore(passwordOverlay, document.body.firstChild);
          passwordOverlay.style.display = "flex";
          authenticated = false;
          if (gamePanel) gamePanel.style.display = "none";
          // Also clear local token
          localStorage.removeItem(AUTH_KEY);
        }
      }
    });
  });
  observer.observe(document.body, { childList: true, subtree: false });

  // ======================= GAME CONSTANTS =======================
  const oliverTwistWords = [
    "fagin", "sikes", "nancy", "oliver", "twist", "orphan", "pauper", "workhouse",
    "pickpocket", "beggar", "alley", "street", "villain", "gang", "sneak",
    "scoundrel", "bully", "charity", "chimney", "ragged", "thief", "crime",
    "robber", "escape", "misery", "gruel", "hunger", "destitute", "boy"
  ];

  const lebanonWords = [
    "bekaa", "cedar", "cedars", "zaatar", "hummus", "tabbouleh", "falafel", "mezze",
    "kibbeh", "olive", "olives", "pine", "mountain", "coast", "harbor", "souk",
    "bazaar", "hillside", "terrace", "orchard", "valley", "dabke", "manaqish",
    "shawarma", "knafeh"
  ];

  const theaterWords = [
    "actor", "actress", "stage", "scene", "script", "cue", "role", "drama", "comedy",
    "tragedy", "curtain", "audience", "rehearsal", "director", "casting", "spotlight",
    "applause", "backstage", "monologue", "dialogue", "ticket", "premiere", "matinee",
    "costume", "orchestra", "playbill", "theater", "theatre", "ballet", "entrance",
    "exit", "prompt", "props", "set", "scenery", "understudy", "encore", "usher",
    "aisle", "seat", "playwright", "intermission", "auditorium", "blocking", "pageant",
    "musical", "stagecraft", "audition", "revue"
  ];

  const divineWords = [
    "jesus", "bible", "prayer", "miracle", "faith", "angel", "grace", "heaven", "holy",
    "mercy", "altar", "church", "chapel", "gospel", "saint", "spirit", "blessed",
    "worship", "psalm", "cross", "temple", "salvation", "redemption", "covenant",
    "prophet", "savior", "resurrection", "priest", "fasting", "devout", "sacred",
    "divine", "amen", "hallelujah", "hymn", "creed", "blessing", "devotion",
    "scripture", "forgiveness", "deliverance", "eternity", "holiness", "sanctity",
    "revival", "prayerful", "communion", "sermon", "pastor", "apostle", "disciple",
    "trinity", "nativity", "crucifix", "sanctuary", "providence", "theology",
    "righteous", "virtuous", "anointed", "soul", "redeem", "spiritual", "doctrine",
    "atonement", "chaplain", "discern", "humility"
  ];

  const generalWords = [
    "amber", "anchor", "blossom", "candle", "canyon", "compass", "crystal", "ember",
    "feather", "galaxy", "horizon", "lantern", "marble", "meadow", "mirror", "moon",
    "moonlight", "music", "ocean", "pearl", "pillow", "ribbon", "river", "shadow",
    "silver", "thunder", "velvet", "window", "winter", "summer", "autumn", "breeze",
    "cloud", "forest", "garden", "puzzle", "whisper", "willow", "zephyr", "prism",
    "rustic", "summit", "voyage", "honest", "island", "jacket", "kettle", "library",
    "notion", "oracle", "portal", "quartz", "rocket", "signal", "tractor", "unlock",
    "vivid", "yellow", "bright", "gentle", "hidden", "humble", "kindred", "lively",
    "modest", "narrow", "patient", "quieter", "rapid", "smooth", "tender", "upward",
    "wavy", "zealous", "brisk", "calm", "daring", "eager", "frank", "gritty", "kind",
    "lunar", "mellow", "noble", "plain", "quiet", "royal", "sharp", "tidy", "urban",
    "vapor", "woven", "young", "zesty", "bloom", "craft", "dwell", "fable", "glow",
    "grain", "heart", "jewel", "knock", "ledge", "mirth", "north", "opal", "plume",
    "quest", "rally", "spark", "tune", "unity", "verse", "whale", "xenon", "yield",
    "zenith"
  ];

  const API_BASE = "https://wordle-auth.hajjelio1.workers.dev";
  const AUTH_KEY = "stupid-wordle-token";

  const dailyEntries = [
    ...oliverTwistWords.map(word => ({ word, theme: "Oliver Twist" })),
    ...lebanonWords.map(word => ({ word, theme: "Lebanon" })),
    ...theaterWords.map(word => ({ word, theme: "Theater" })),
    ...divineWords.map(word => ({ word, theme: "Divine Intervention" })),
    ...generalWords.map(word => ({ word, theme: "General" }))
  ];

  const encodedWords = dailyEntries.map(entry => btoa(entry.word.toUpperCase()));
  const localWordSet = new Set(dailyEntries.map(entry => entry.word.toLowerCase()));

  const launchDate = Date.UTC(2024, 2, 30);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysPassed = Math.max(0, Math.floor((today.getTime() - launchDate) / 86400000));
  const solutionIndex = Math.min(daysPassed, encodedWords.length - 1);
  const solution = atob(encodedWords[solutionIndex]).toUpperCase();
  const currentTheme = dailyEntries[solutionIndex].theme;
  const wordLength = solution.length;
  const maxRows = Math.max(6, wordLength + 1);

  const storageKey = `stupid-wordle-${solutionIndex}`;
  let savedState = loadState();

  const grid = document.getElementById("grid");
  const keyboardContainer = document.getElementById("keyboard");
  const messageBoard = document.getElementById("message-board");
  const lookupStatus = document.getElementById("lookup-status");
  const statusBadge = document.getElementById("status");
  const hintButton = document.getElementById("hint-button");

  const modal = document.getElementById("end-modal");
  const endTitle = document.getElementById("end-title");
  const countdownEl = document.getElementById("countdown");

  statusBadge.textContent = `${wordLength}-letter word • ${maxRows} tries`;
  grid.style.setProperty("--cols", wordLength);

  let currentRow = 0;
  let currentGuess = "";
  let gameOver = false;
  let isSubmitting = false;
  let boardState = Array.from({ length: maxRows }, () => null);
  let countdownTimer = null;
  let hintsUsed = savedState?.hintsUsed || 0;
  let gameStarted = false;
  let eventsBound = false;

  if (savedState && savedState.solutionIndex === solutionIndex) {
    currentRow = Math.min(savedState.currentRow ?? 0, maxRows - 1);
    currentGuess = typeof savedState.currentGuess === "string" ? savedState.currentGuess : "";
    gameOver = Boolean(savedState.gameOver);
    boardState = Array.from({ length: maxRows }, (_, i) => savedState.boardState?.[i] ?? null);
  }

  syncTitleIcon();
  initPasswordGate();

  function syncTitleIcon() {
    const favicon = document.querySelector('link[rel="icon"]');
    const titleIcon = document.querySelector(".title-icon");
    if (!titleIcon || !favicon) return;
    titleIcon.src = favicon.getAttribute("href");
  }

  async function unlockSite() {
    const entered = passwordInput.value.trim();
    try {
      const res = await fetch(`${API_BASE}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: entered })
      });
      const data = await res.json();
      if (data.ok) {
        localStorage.setItem(AUTH_KEY, data.token);
        authenticated = true;
        passwordOverlay.style.display = "none";
        passwordError.textContent = "";
        if (gamePanel) gamePanel.style.display = "flex";
        startGame();
      } else {
        passwordError.textContent = "Wrong password.";
      }
    } catch {
      passwordError.textContent = "Could not reach the server.";
    }
  }

  async function initPasswordGate() {
    const token = localStorage.getItem(AUTH_KEY);
    if (token) {
      try {
        const res = await fetch(`${API_BASE}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (data.ok) {
          authenticated = true;
          passwordOverlay.style.display = "none";
          if (gamePanel) gamePanel.style.display = "flex";
          startGame();
          return;
        }
        localStorage.removeItem(AUTH_KEY);
      } catch {
        localStorage.removeItem(AUTH_KEY);
      }
    }
    passwordOverlay.style.display = "flex";
    passwordSubmit.addEventListener("click", unlockSite);
    passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") unlockSite();
    });
  }

  function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    buildGrid();
    buildKeyboard();
    restoreBoard();
    updateGrid();
    if (gameOver) {
      const winState = savedState?.won === true;
      showEndModal(winState);
    }
    bindEvents();
  }

  function bindEvents() {
    document.getElementById("close-modal").addEventListener("click", hideEndModal);
    if (eventsBound) return;
    eventsBound = true;
    hintButton.addEventListener("click", handleHintClick);
    document.addEventListener("keydown", (e) => {
      if (!authenticated) return;  // No game if not authenticated
      if (gameOver || isSubmitting) return;
      if (e.key === "Enter") {
        handleKeyPress("ENTER");
      } else if (e.key === "Backspace") {
        handleKeyPress("⌫");
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        handleKeyPress(e.key.toUpperCase());
      }
    });
  }

  function handleHintClick() {
    if (!authenticated) return;
    if (gameOver || isSubmitting) return;
    if (hintsUsed === 0) {
      showMessage(`Theme hint: ${currentTheme}`);
      hintsUsed++;
      saveState();
      return;
    }
    if (hintsUsed === 1) {
      revealLetterHint();
      hintsUsed++;
      saveState();
      return;
    }
    showMessage("No more hints available.");
  }

  function saveState(won = null) {
    const state = {
      solutionIndex,
      currentRow,
      currentGuess,
      gameOver,
      won,
      boardState,
      hintsUsed
    };
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function revealLetterHint() {
    const indices = [];
    for (let i = 0; i < wordLength; i++) indices.push(i);
    const index = indices[Math.floor(Math.random() * indices.length)];
    const letter = solution[index];
    const tile = document.getElementById(`row-${currentRow}-col-${index}`);
    if (!tile) return;
    tile.textContent = letter;
    tile.classList.add("present", "hint-reveal");
    setTimeout(() => tile.classList.remove("hint-reveal"), 600);
    showMessage("A letter has been revealed.");
  }

  function buildGrid() {
    grid.innerHTML = "";
    for (let r = 0; r < maxRows; r++) {
      const row = document.createElement("div");
      row.className = "row";
      for (let c = 0; c < wordLength; c++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.id = `row-${r}-col-${c}`;
        row.appendChild(tile);
      }
      grid.appendChild(row);
    }
  }

  function buildKeyboard() {
    keyboardContainer.innerHTML = "";
    const keys = [
      ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
      ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
      ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"]
    ];
    keys.forEach(rowKeys => {
      const rowEl = document.createElement("div");
      rowEl.className = "key-row";
      rowKeys.forEach(key => {
        const button = document.createElement("button");
        button.className = "key";
        button.id = `key-${key}`;
        button.textContent = key;
        if (key === "ENTER" || key === "⌫") button.classList.add("large");
        button.addEventListener("click", () => handleKeyPress(key));
        rowEl.appendChild(button);
      });
      keyboardContainer.appendChild(rowEl);
    });
  }

  function handleKeyPress(key) {
    if (!authenticated) return;
    if (gameOver || isSubmitting) return;
    if (key === "ENTER") {
      submitGuess();
      return;
    }
    if (key === "⌫") {
      currentGuess = currentGuess.slice(0, -1);
      updateGrid();
      saveState();
      return;
    }
    if (/^[A-Z]$/.test(key) && currentGuess.length < wordLength) {
      currentGuess += key;
      updateGrid();
      saveState();
    }
  }

  function updateGrid() {
    for (let i = 0; i < wordLength; i++) {
      const tile = document.getElementById(`row-${currentRow}-col-${i}`);
      if (!tile) continue;
      tile.textContent = currentGuess[i] || "";
      tile.classList.toggle("filled", Boolean(currentGuess[i]));
    }
  }

  function restoreBoard() {
    for (let r = 0; r < maxRows; r++) {
      const rowData = boardState[r];
      if (!rowData) continue;
      const guess = rowData.guess || "";
      const colors = rowData.colors || [];
      for (let c = 0; c < wordLength; c++) {
        const tile = document.getElementById(`row-${r}-col-${c}`);
        if (!tile) continue;
        tile.textContent = guess[c] || "";
        if (guess[c]) tile.classList.add("filled");
        if (colors[c]) {
          tile.classList.add(colors[c]);
          tile.style.color = "white";
          tile.style.border = "none";
        }
      }
    }
  }

  async function submitGuess() {
    if (!authenticated) return;
    if (currentGuess.length !== wordLength) {
      showMessage(`You need ${wordLength} letters.`);
      return;
    }
    const guess = currentGuess.toLowerCase();
    isSubmitting = true;
    const isValid = await isRealWord(guess);
    if (!isValid) {
      showMessage("That is not a real word.");
      isSubmitting = false;
      return;
    }
    const rowIndex = currentRow;
    const guessSnapshot = currentGuess;
    const tileColors = getTileColors(guessSnapshot, solution);
    boardState[rowIndex] = { guess: guessSnapshot, colors: tileColors };
    saveState();
    animateGuess(rowIndex, guessSnapshot, tileColors);
    setTimeout(() => {
      if (guessSnapshot === solution) {
        gameOver = true;
        saveState(true);
        showEndModal(true);
        showMessage("Wow. You actually got it.");
        isSubmitting = false;
        return;
      }
      currentRow += 1;
      currentGuess = "";
      if (currentRow >= maxRows) {
        gameOver = true;
        saveState(false);
        showEndModal(false);
        showMessage(`You failed. The word was ${solution}`);
      } else {
        updateGrid();
        saveState();
      }
      isSubmitting = false;
    }, wordLength * 300 + 500);
  }

  function getTileColors(guess, answer) {
    const answerLetters = answer.split("");
    const guessLetters = guess.split("");
    const colors = Array(wordLength).fill("absent");
    for (let i = 0; i < wordLength; i++) {
      if (guessLetters[i] === answerLetters[i]) {
        colors[i] = "correct";
        answerLetters[i] = null;
        guessLetters[i] = null;
      }
    }
    for (let i = 0; i < wordLength; i++) {
      if (guessLetters[i] && answerLetters.includes(guessLetters[i])) {
        colors[i] = "present";
        answerLetters[answerLetters.indexOf(guessLetters[i])] = null;
      }
    }
    return colors;
  }

  function animateGuess(rowIndex, guess, colors) {
    for (let i = 0; i < wordLength; i++) {
      const tile = document.getElementById(`row-${rowIndex}-col-${i}`);
      const letter = guess[i];
      setTimeout(() => {
        tile.classList.add("flip-in");
        setTimeout(() => {
          tile.classList.remove("flip-in");
          tile.classList.add(colors[i]);
          tile.classList.add("flip-out");
          tile.style.color = "white";
          tile.style.border = "none";
          updateKeyboard(letter, colors[i]);
        }, 220);
      }, i * 300);
    }
  }

  function updateKeyboard(letter, color) {
    const keyElement = document.getElementById(`key-${letter}`);
    if (!keyElement) return;
    const priority = { absent: 0, present: 1, correct: 2 };
    const existing = keyElement.classList.contains("correct") ? "correct" :
                     keyElement.classList.contains("present") ? "present" :
                     keyElement.classList.contains("absent") ? "absent" : null;
    if (existing && priority[existing] >= priority[color]) return;
    keyElement.classList.remove("correct", "present", "absent");
    keyElement.classList.add(color);
  }

  async function isRealWord(word) {
    const normalized = word.toLowerCase();
    if (localWordSet.has(normalized)) return true;
    showLookupStatus(true);
    try {
      const response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalized)}`
      );
      return response.ok;
    } catch {
      return false;
    } finally {
      showLookupStatus(false);
    }
  }

  function showLookupStatus(show) {
    if (show) lookupStatus.classList.remove("hidden");
    else lookupStatus.classList.add("hidden");
  }

  function showMessage(msg) {
    messageBoard.textContent = msg;
    messageBoard.classList.add("show");
    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => {
      if (!gameOver) messageBoard.classList.remove("show");
    }, 2200);
  }

  function showEndModal(won) {
    endTitle.textContent = won ? "You got it." : `The word was ${solution}`;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    startCountdown();
  }

  function hideEndModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    const update = () => {
      const now = new Date();
      const tomorrow = new Date();
      tomorrow.setHours(24, 0, 0, 0);
      const diff = tomorrow - now;
      if (diff <= 0) {
        countdownEl.textContent = "00:00:00";
        hideEndModal();
        showMessage("New word is live. Reload the page to play it.");
        return;
      }
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      countdownEl.textContent = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    };
    update();
    countdownTimer = setInterval(update, 1000);
  }
})();