(() => {
  // --- SUPABASE CONFIGURATION ---
  const supabaseUrl = 'https://hcehsxnudbwjydvenlfz.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZWhzeG51ZGJ3anlkdmVubGZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NzAsImV4cCI6MjA5MDY1Mjg3MH0.dPawhX90yZrme7nftMTq6A1j-KGqfHZJ8QnbBeFurl8';
  const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

  const WORD_SOURCE = "supabase"; // Fetching from database now

  // ─── HINT PENALTY CONSTANTS ────────────────────────────────────────────────
  const HINT_PENALTY_1 = 8;   // 0.8 * 10
  const HINT_PENALTY_2 = 15;  // 1.5 * 10
  const GUESS_SCALE    = 10;  // multiply real guesses by this for DB storage
  // ──────────────────────────────────────────────────────────────────────────

  // Provide a safe fallback so the script doesn't crash if WORDS isn't loaded
  const safeWords = typeof WORDS !== "undefined" ? WORDS : [
    { word: "CEDAR", category: "Lebanon" },
    { word: "RUINS", category: "Lebanon" } 
  ];
  const DAILY_WORDS = safeWords.filter(obj => obj.word && /^[a-zA-Z]+$/.test(obj.word));
  
  // FIXED LAUNCH DATE: This syncs the math perfectly if RUINS was day 0 (March 30).
  // 2 = March, 30 = 30th. Let the math handle the offsets natively.
  const launchDate = Date.UTC(2026, 3, 1);
  
  const boardEl = document.getElementById("board");
  const keyboardEl = document.getElementById("keyboard");
  const messageEl = document.getElementById("message");
  const metaLineEl = document.getElementById("meta-line");
  const themeToggle = document.getElementById("theme-toggle");
  const themeIcon = document.getElementById("theme-icon");
  const hintButton = document.getElementById("hint-button");
  const hintBadge = document.getElementById("hint-badge");
  const modal = document.getElementById("end-modal");
  const endTitle = document.getElementById("end-title");
  const countdownEl = document.getElementById("countdown");
  const closeModal = document.getElementById("close-modal");

  // Leaderboard Elements
  const leaderboardBtn = document.getElementById("leaderboard-button");
  const leaderboardModal = document.getElementById("leaderboard-modal");
  const closeLeaderboardBtn = document.getElementById("close-leaderboard");
  const usernameView = document.getElementById("username-view");
  const statsView = document.getElementById("stats-view");
  const usernameInput = document.getElementById("username-input");
  const saveUsernameBtn = document.getElementById("save-username-btn");
  const tabBtns = document.querySelectorAll(".tab-btn");
  const lbLoading = document.getElementById("lb-loading");
  const lbList = document.getElementById("lb-list");

  const wordCache = {};

  const today = new Date();
  const localDateAsUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const daysPassed = Math.max(0, Math.floor((localDateAsUTC - launchDate) / 86400000));
  
  // Only check for exhaustion if we are relying strictly on the local array
  if (WORD_SOURCE !== "supabase" && daysPassed >= DAILY_WORDS.length) {
    document.body.innerHTML = "<h1 style='text-align:center; padding: 2rem; color: var(--text); font-family: sans-serif;'>We are out of words! Check back later.</h1>";
    throw new Error("Word list exhausted.");
  }

  const solutionIndex = daysPassed;
  
  // ── Word loading: local or supabase ──────────────────────────────────────
  let solution = "";
  let wordCategory = "";
  let wordLength = 0;
  let maxRows = 0;

  async function fetchTodaysWord() {
    if (WORD_SOURCE === "supabase") {
      try {
        // We are deleting the Edge Function 'fetch' and querying the table directly.
        // NOTE: Replace 'YOUR_TABLE_NAME' with the actual name of your table!
        const { data, error } = await supabase
          .from('YOUR_TABLE_NAME')
          .select('word, category')
          .eq('day_index', solutionIndex)
          .single();

        if (error) throw error;

        // If it finds the word in Supabase, use it
        solution = data.word.toUpperCase();
        wordCategory = data.category;
        
      } catch (err) {
        console.error("Database query failed, pulling from local file instead:", err);
        const obj = DAILY_WORDS[solutionIndex % DAILY_WORDS.length];
        solution = obj.word.toUpperCase();
        wordCategory = obj.category;
      }
    } else {
      const obj = DAILY_WORDS[solutionIndex];
      solution = obj.word.toUpperCase();
      wordCategory = obj.category;
    }
    
    wordLength = solution.length;
    maxRows = wordLength <= 5 ? 6 : wordLength + 1;
  }
  // ─────────────────────────────────────────────────────────────────────────

  const storageKey = `wordle-mobile-${solutionIndex}`;
  const themeKey = "wordle-mobile-theme";
  const userKey = "wordle-user-data"; 

  let currentRow = 0;
  let currentGuess = "";
  let boardState = [];
  let gameOver = false;
  let isSubmitting = false;
  let countdownTimer = null;
  let messageTimer = null;
  let hintsUsed = 0;
  let hasSubmittedToLeaderboard = false;

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getUserData() {
    let data = localStorage.getItem(userKey);
    if (!data) {
      data = { uuid: generateUUID(), username: null };
      localStorage.setItem(userKey, JSON.stringify(data));
    } else {
      data = JSON.parse(data);
    }
    return data;
  }

  // ── Kick off everything after the word is loaded ─────────────────────────
  fetchTodaysWord().then(() => {
    boardState = Array.from({ length: maxRows }, () => null);

    const savedState = loadState();
    if (savedState && savedState.solutionIndex === solutionIndex) {
      currentRow = Math.min(savedState.currentRow ?? 0, maxRows - 1);
      currentGuess = typeof savedState.currentGuess === "string" ? savedState.currentGuess : "";
      gameOver = Boolean(savedState.gameOver);
      boardState = Array.from({ length: maxRows }, (_, i) => savedState.boardState?.[i] ?? null);
      hintsUsed = savedState.hintsUsed || 0;
      hasSubmittedToLeaderboard = savedState.hasSubmittedToLeaderboard || false;
    }

    setupTheme();
    setMetaText();
    buildBoard();
    buildKeyboard();
    restoreBoard();
    updateBoard();
    updateKeyboardColorsFromBoard();
    updateHintBadge();
    bindEvents();

    if (gameOver) showEndModal(Boolean(savedState?.won));
  });
  // ─────────────────────────────────────────────────────────────────────────

  function setMetaText() {
    metaLineEl.textContent = `${wordLength} letters · ${maxRows} tries`;
    boardEl.style.setProperty("--word-length", wordLength);
  }

  function setupTheme() {
    const savedTheme = localStorage.getItem(themeKey);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme = savedTheme || (prefersDark ? "dark" : "light");
    setTheme(initialTheme);

    themeToggle.addEventListener("click", () => {
      const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
      setTheme(nextTheme);
      localStorage.setItem(themeKey, nextTheme);
    });
  }

  function setTheme(theme) {
    document.body.dataset.theme = theme;
    themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    themeIcon.innerHTML = theme === "dark" ? sunIcon() : moonIcon();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#121213" : "#ffffff");
  }

  function moonIcon() { return `<path d="M20 13.2A7.8 7.8 0 0 1 10.8 4a8.8 8.8 0 1 0 9.2 9.2Z"></path>`; }

  function sunIcon() {
    return `
      <circle cx="12" cy="12" r="4.2"></circle>
      <path d="M12 2.8v2.3"></path>
      <path d="M12 18.9v2.3"></path>
      <path d="M2.8 12h2.3"></path>
      <path d="M18.9 12h2.3"></path>
      <path d="M4.6 4.6l1.6 1.6"></path>
      <path d="M17.8 17.8l1.6 1.6"></path>
      <path d="M19.4 4.6l-1.6 1.6"></path>
      <path d="M6.2 17.8l-1.6 1.6"></path>
    `;
  }

  function buildBoard() {
    boardEl.innerHTML = "";
    boardEl.style.setProperty("--tile-size", computeTileSize() + "px");

    for (let r = 0; r < maxRows; r += 1) {
      const row = document.createElement("div");
      row.className = "row";
      for (let c = 0; c < wordLength; c += 1) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.id = `tile-${r}-${c}`;
        tile.setAttribute("aria-label", `Row ${r + 1} column ${c + 1}`);
        row.appendChild(tile);
      }
      boardEl.appendChild(row);
    }
  }

  function computeTileSize() {
    const vw = window.innerWidth || 375;
    const vh = window.innerHeight || 700;
    const boardPadding = 28;
    const gap = 5;
    const widthFit = (vw - boardPadding - gap * (wordLength - 1)) / wordLength;
    const heightFit = (vh * 0.42 - gap * (maxRows - 1)) / maxRows;
    return Math.max(25, Math.min(58, Math.floor(Math.min(widthFit, heightFit))));
  }

  function buildKeyboard() {
    keyboardEl.innerHTML = "";
    const rows = [
      ["Q","W","E","R","T","Y","U","I","O","P"],
      ["A","S","D","F","G","H","J","K","L"],
      ["ENTER","Z","X","C","V","B","N","M","⌫"]
    ];

    rows.forEach((letters) => {
      const row = document.createElement("div");
      row.className = "keyboard-row";
      letters.forEach(letter => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "key";
        button.id = `key-${letter}`;
        button.textContent = letter;
        if (letter === "ENTER" || letter === "⌫") button.classList.add("wide");
        button.addEventListener("click", () => handleKey(letter));
        row.appendChild(button);
      });
      keyboardEl.appendChild(row);
    });
  }

  function bindEvents() {
    hintButton.addEventListener("click", showHint);

    window.addEventListener("resize", () => {
      boardEl.style.setProperty("--tile-size", computeTileSize() + "px");
    });

    document.addEventListener("keydown", (event) => {
      if (leaderboardModal.classList.contains("hidden") === false) return; 
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Enter") {
        event.preventDefault();
        handleKey("ENTER");
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        handleKey("⌫");
        return;
      }
      if (/^[a-zA-Z]$/.test(event.key)) {
        event.preventDefault();
        handleKey(event.key.toUpperCase());
      }
    });

    closeModal.addEventListener("click", hideEndModal);
    
    // Leaderboard Events
    leaderboardBtn.addEventListener("click", openLeaderboard);
    closeLeaderboardBtn.addEventListener("click", () => leaderboardModal.classList.add("hidden"));
    
    saveUsernameBtn.addEventListener("click", async () => {
      const name = usernameInput.value.trim();
      if (name.length < 3) return showMessage("Name too short");
      
      const userData = getUserData();
      saveUsernameBtn.textContent = "Saving...";
      saveUsernameBtn.disabled = true;

      try {
        // 1. Check if the username is already taken by SOMEONE ELSE
        const { data: existing } = await supabase
          .from('leaderboards')
          .select('uuid')
          .eq('username', name)
          .neq('uuid', userData.uuid) // Ignore our own UUID in the check
          .maybeSingle();

        if (existing) {
          showMessage("Username taken");
          return; 
        }

        // 2. Check if the user already has a record in the database
        const { data: userRecord } = await supabase
          .from('leaderboards')
          .select('uuid')
          .eq('uuid', userData.uuid)
          .maybeSingle();

        if (userRecord) {
          // Update existing name
          const { error: updateError } = await supabase
            .from('leaderboards')
            .update({ username: name })
            .eq('uuid', userData.uuid);
            
          if (updateError) throw updateError;
        } else {
          // Insert new user
          const { error: insertError } = await supabase.from('leaderboards').insert([
            { uuid: userData.uuid, username: name, games_played: 0, total_guesses: 0, winstreak: 0, max_winstreak: 0 }
          ]);
          
          if (insertError) throw insertError;
        }
        
        // 3. Success! Update local storage and swap the UI views
        userData.username = name;
        localStorage.setItem(userKey, JSON.stringify(userData));
        
        usernameView.classList.add("hidden");
        statsView.classList.remove("hidden");
        loadLeaderboardData("avg");

      } catch (error) {
        console.error("Save error:", error);
        showMessage("Could not save. Try again.");
      } finally {
        saveUsernameBtn.textContent = "Save Name";
        saveUsernameBtn.disabled = false;
      }
    });

    tabBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        tabBtns.forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        loadLeaderboardData(e.target.dataset.tab);
      });
    });
  }

  // --- LEADERBOARD LOGIC ---
  function openLeaderboard() {
    leaderboardModal.classList.remove("hidden");
    const userData = getUserData();
    
    // THE ULTIMATE LOCK: If username exists, the add name view physically cannot be reached
    if (!userData.username) {
      usernameView.classList.remove("hidden");
      statsView.classList.add("hidden");
    } else {
      usernameView.classList.add("hidden");
      statsView.classList.remove("hidden");
      tabBtns[0].click(); // Default to avg tab
    }
  }

  async function loadLeaderboardData(type) {
    lbLoading.classList.remove("hidden");
    lbLoading.textContent = "Loading...";
    lbList.classList.add("hidden");
    lbList.innerHTML = "";

    try {
      let data = [];

      if (type === "avg") {
        const { data: res, error } = await supabase
          .from('leaderboards')
          .select('username, games_played, total_guesses')
          .gte('games_played', 3);
        
        if (error) throw error;

        if (res && res.length > 0) {
          data = res.map(p => ({
            ...p,
            avg: ((p.total_guesses / GUESS_SCALE) / p.games_played).toFixed(2)
          })).sort((a, b) => a.avg - b.avg).slice(0, 50);
        }

      } else if (type === "streak") {
        const { data: res, error } = await supabase
          .from('leaderboards')
          .select('username, winstreak, max_winstreak')
          .order('max_winstreak', { ascending: false })
          .limit(50);
          
        if (error) throw error;
        if (res) data = res;
      }

      lbLoading.classList.add("hidden");
      lbList.classList.remove("hidden");

      if (data.length === 0) {
        const msg = type === "avg"
          ? "No players with 3+ games yet. Keep playing!"
          : "No streaks to show yet. Win some games!";
        lbList.innerHTML = `<li class="lb-item" style="justify-content:center; color: var(--muted); font-size:0.9rem;">${msg}</li>`;
        return;
      }

      // Renders names as plain text, no click handlers
      data.forEach((player, index) => {
        const li = document.createElement("li");
        li.className = "lb-item";
        
        const scoreVal = type === "avg"
          ? player.avg
          : (player.max_winstreak ?? player.winstreak ?? 0);
        
        li.innerHTML = `
          <div><span class="rank">#${index + 1}</span> ${player.username}</div>
          <div class="score">${scoreVal}</div>
        `;

        lbList.appendChild(li);
      });

    } catch (e) {
      console.error("Leaderboard Error", e);
      lbLoading.classList.add("hidden");
      lbList.classList.remove("hidden");
      lbList.innerHTML = `<li class="lb-item" style="justify-content:center; color: var(--muted); font-size:0.9rem;">Failed to load. Check your connection.</li>`;
    }
  }

  async function updateUserStats(won, rawGuesses) {
    if (hasSubmittedToLeaderboard) return;
    
    const userData = getUserData();
    if (!userData.username) return; 

    let scaledPenalty = 0;
    if (hintsUsed >= 1) scaledPenalty += HINT_PENALTY_1;
    if (hintsUsed >= 2) scaledPenalty += HINT_PENALTY_2;

    const scaledGuesses = (rawGuesses * GUESS_SCALE) + scaledPenalty;

    try {
      const { data: userRecord, error: fetchError } = await supabase
        .from('leaderboards')
        .select('*')
        .eq('uuid', userData.uuid)
        .maybeSingle();

      if (fetchError) {
        console.error("Fetch user record error:", fetchError);
        return;
      }

      if (!userRecord) {
        console.warn("No leaderboard record found for this user UUID.");
        return;
      }

      const newWinstreak = won ? userRecord.winstreak + 1 : 0;
      const updates = {
        games_played: userRecord.games_played + 1,
        total_guesses: userRecord.total_guesses + scaledGuesses,
        winstreak: newWinstreak,
        max_winstreak: Math.max(newWinstreak, userRecord.max_winstreak ?? 0),
      };

      const { error: updateError } = await supabase
        .from('leaderboards')
        .update(updates)
        .eq('uuid', userData.uuid);

      if (updateError) {
        console.error("Error updating stats:", updateError);
        return;
      }
        
      hasSubmittedToLeaderboard = true;
      saveState();

    } catch (e) {
      console.error("Error updating stats", e);
    }
  }
  // --- END LEADERBOARD LOGIC ---

  function updateHintBadge() {
    const hintsLeft = 2 - hintsUsed;
    hintBadge.textContent = Math.max(0, hintsLeft);
    if (hintsLeft <= 0) {
      hintBadge.classList.add("empty");
    } else {
      hintBadge.classList.remove("empty");
    }
  }

  function showHintPopup(title, body) {
    let overlay = document.getElementById("hint-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "hint-overlay";
      overlay.style.cssText = [
        "position:fixed", "inset:0", "z-index:999",
        "display:flex", "align-items:center", "justify-content:center",
        "background:rgba(0,0,0,0.45)", "animation:fadeIn 0.15s ease"
      ].join(";");

      if (!document.getElementById("hint-overlay-style")) {
        const s = document.createElement("style");
        s.id = "hint-overlay-style";
        s.textContent = [
          "@keyframes fadeIn{from{opacity:0}to{opacity:1}}",
          "@keyframes popIn{from{transform:scale(0.88);opacity:0}to{transform:scale(1);opacity:1}}",
          "#hint-card{animation:popIn 0.18s ease;background:var(--bg);border:1.5px solid var(--border);",
          "border-radius:16px;padding:28px 32px;min-width:260px;max-width:88vw;text-align:center;",
          "box-shadow:0 8px 32px rgba(0,0,0,0.22);}",
          "#hint-card .hint-label{font-size:11px;letter-spacing:0.1em;text-transform:uppercase;",
          "color:var(--subtext);margin-bottom:10px;font-weight:600;}",
          "#hint-card .hint-title{font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px;}",
          "#hint-card .hint-body{font-size:22px;font-weight:700;color:var(--text);margin-bottom:22px;line-height:1.3;}",
          "#hint-card .hint-close{display:inline-block;padding:9px 28px;border-radius:8px;",
          "background:var(--text);color:var(--bg);font-size:14px;font-weight:600;",
          "border:none;cursor:pointer;letter-spacing:0.02em;}"
        ].join("");
        document.head.appendChild(s);
      }

      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div id="hint-card">
        <div class="hint-label">Hint</div>
        <div class="hint-title">${title}</div>
        <div class="hint-body">${body}</div>
        <button class="hint-close" id="hint-close-btn">Got it</button>
      </div>
    `;

    overlay.style.display = "flex";

    const close = () => { overlay.style.display = "none"; };
    document.getElementById("hint-close-btn").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  }

  function showHint() {
    if (gameOver || isSubmitting) return;

    if (hintsUsed === 0) {
      showHintPopup("Category", wordCategory);
      hintsUsed++;
      updateHintBadge();
      saveState();
      return;
    }

    if (hintsUsed === 1) {
      const correctLetters = new Set();
      for (const row of boardState) {
        if (!row) continue;
        for (let i = 0; i < wordLength; i++) {
          if (row.colors[i] === "correct" || row.colors[i] === "present") {
            correctLetters.add(row.guess[i]);
          }
        }
      }

      const unrevealed = solution.split("").filter(l => !correctLetters.has(l));

      if (unrevealed.length > 0) {
        const randomHintLetter = unrevealed[Math.floor(Math.random() * unrevealed.length)];
        showHintPopup("Letter hint", `The word contains the letter<br><span style="font-size:36px">${randomHintLetter}</span>`);
        hintsUsed++;
        updateHintBadge();
        saveState();
      } else {
        showHintPopup("You're close!", "You've found all the letters —<br>now find their spots!");
      }
      return;
    }
  }

  function handleKey(key) {
    if (gameOver || isSubmitting) return;

    if (key === "ENTER") {
      submitGuess();
      return;
    }

    if (key === "⌫") {
      if (!currentGuess.length) return;
      currentGuess = currentGuess.slice(0, -1);
      updateBoard();
      saveState();
      return;
    }

    if (/^[A-Z]$/.test(key) && currentGuess.length < wordLength) {
      currentGuess += key;
      animateTilePop();
      updateBoard();
      saveState();
    }
  }

  function animateTilePop() {
    const tile = document.getElementById(`tile-${currentRow}-${Math.max(0, currentGuess.length - 1)}`);
    if (!tile) return;
    tile.classList.remove("pop");
    void tile.offsetWidth;
    tile.classList.add("pop");
  }

  function updateBoard() {
    for (let c = 0; c < wordLength; c += 1) {
      const tile = document.getElementById(`tile-${currentRow}-${c}`);
      if (!tile) continue;
      const letter = currentGuess[c] || "";
      tile.textContent = letter;
      tile.classList.toggle("filled", Boolean(letter));
    }
  }

  function restoreBoard() {
    for (let r = 0; r < maxRows; r += 1) {
      const rowData = boardState[r];
      if (!rowData) continue;

      const guess = rowData.guess || "";
      const colors = rowData.colors || [];
      for (let c = 0; c < wordLength; c += 1) {
        const tile = document.getElementById(`tile-${r}-${c}`);
        if (!tile) continue;
        tile.textContent = guess[c] || "";
        tile.classList.toggle("filled", Boolean(guess[c]));
        if (colors[c]) {
          tile.classList.add(colors[c]);
          tile.style.color = "#fff";
          tile.style.borderColor = "transparent";
        }
      }
    }
  }

  async function submitGuess() {
    if (!currentGuess || currentGuess.length !== wordLength) {
      showMessage(`Need ${wordLength} letters.`);
      shakeCurrentRow();
      return;
    }

    const guess = currentGuess.toUpperCase();
    isSubmitting = true;

    messageEl.textContent = "Loading...";
    messageEl.classList.add("show");

    const valid = await isValidWord(guess.toLowerCase());

    messageEl.classList.remove("show");

    if (!valid) {
      showMessage("That word is not accepted.");
      shakeCurrentRow();
      isSubmitting = false;
      return;
    }

    const colors = getTileColors(guess, solution);
    boardState[currentRow] = { guess, colors };
    saveState();

    animateFlip(currentRow, guess, colors);

    window.setTimeout(() => {
      if (guess === solution) {
        gameOver = true;
        updateUserStats(true, currentRow + 1); 
        saveState(true);
        showMessage("Solved.");
        showEndModal(true);
        isSubmitting = false;
        return;
      }

      currentRow += 1;
      currentGuess = "";

      if (currentRow >= maxRows) {
        gameOver = true;
        updateUserStats(false, maxRows); 
        saveState(false);
        showMessage(`The word was ${solution}.`);
        showEndModal(false);
      } else {
        updateBoard();
        saveState();
      }

      isSubmitting = false;
    }, wordLength * 280 + 420);
  }

  function getTileColors(guess, answer) {
    const answerLetters = answer.split("");
    const guessLetters = guess.split("");
    const colors = Array(wordLength).fill("absent");

    for (let i = 0; i < wordLength; i += 1) {
      if (guessLetters[i] === answerLetters[i]) {
        colors[i] = "correct";
        answerLetters[i] = null;
        guessLetters[i] = null;
      }
    }

    for (let i = 0; i < wordLength; i += 1) {
      const letter = guessLetters[i];
      if (letter && answerLetters.includes(letter)) {
        colors[i] = "present";
        answerLetters[answerLetters.indexOf(letter)] = null;
      }
    }

    return colors;
  }

  function animateFlip(rowIndex, guess, colors) {
    for (let i = 0; i < wordLength; i += 1) {
      const tile = document.getElementById(`tile-${rowIndex}-${i}`);
      if (!tile) continue;

      window.setTimeout(() => {
        tile.classList.add("flip");
        window.setTimeout(() => {
          tile.classList.remove("flip");
          tile.classList.add(colors[i]);
          tile.style.color = "#fff";
          tile.style.borderColor = "transparent";
          updateKeyboardColor(guess[i], colors[i]);
        }, 220);
      }, i * 250);
    }
  }

  function shakeCurrentRow() {
    const row = boardEl.children[currentRow];
    if (!row) return;
    row.classList.remove("shake");
    void row.offsetWidth;
    row.classList.add("shake");
    window.setTimeout(() => row.classList.remove("shake"), 360);
  }

  function updateKeyboardColor(letter, color) {
    const key = document.getElementById(`key-${letter}`);
    if (!key) return;

    const priority = { absent: 0, present: 1, correct: 2 };
    const existing = key.classList.contains("correct") ? "correct"
      : key.classList.contains("present") ? "present"
      : key.classList.contains("absent") ? "absent"
      : null;

    if (existing && priority[existing] >= priority[color]) return;

    key.classList.remove("correct", "present", "absent");
    key.classList.add(color);
  }

  function updateKeyboardColorsFromBoard() {
    for (const rowData of boardState) {
      if (!rowData) continue;
      const guess = rowData.guess || "";
      const colors = rowData.colors || [];
      for (let i = 0; i < guess.length; i += 1) {
        updateKeyboardColor(guess[i], colors[i]);
      }
    }
  }

  function showMessage(text) {
    messageEl.textContent = text;
    messageEl.classList.add("show");
    clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => {
      if (!gameOver) messageEl.classList.remove("show");
    }, 1800);
  }

  async function isValidWord(word) {
    if (word.length !== wordLength) return false;

    // Always allow words from our fallback list just in case
    if (DAILY_WORDS.some(w => w.word.toLowerCase() === word)) return true;

    if (!/^[a-z]+$/.test(word)) return false;

    if (wordCache[word] !== undefined) {
      return wordCache[word];
    }

    try {
      const response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
      );
      const result = response.ok;
      wordCache[word] = result;
      return result;
    } catch {
      wordCache[word] = false;
      return false;
    }
  }

  function showEndModal(won) {
    endTitle.textContent = won ? "You got it." : `The word was ${solution}`;
    modal.classList.remove("hidden");
    startCountdown();
  }

  function hideEndModal() {
    modal.classList.add("hidden");
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
      const diff = tomorrow.getTime() - now.getTime();

      if (diff <= 0) {
        countdownEl.textContent = "00:00:00";
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

  function saveState(won = null) {
    const state = {
      solutionIndex,
      currentRow,
      currentGuess,
      gameOver,
      won,
      boardState,
      hintsUsed,
      hasSubmittedToLeaderboard 
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
})();