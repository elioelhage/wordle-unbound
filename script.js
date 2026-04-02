(() => {
  // --- SUPABASE CONFIGURATION ---
  const supabaseUrl = 'https://hcehsxnudbwjydvenlfz.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZWhzeG51ZGJ3anlkdmVubGZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NzAsImV4cCI6MjA5MDY1Mjg3MH0.dPawhX90yZrme7nftMTq6A1j-KGqfHZJ8QnbBeFurl8';
  const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

  const WORD_SOURCE = "supabase";

  const GUESS_SCALE = 10;  // multiply real guesses by this for DB storage

  // Fallback word list (only used if supabase fails)
  const safeWords = typeof WORDS !== "undefined" ? WORDS : [
    { word: "CEDAR", category: "Lebanon" },
    { word: "RUINS", category: "Lebanon" } 
  ];
  const DAILY_WORDS = safeWords.filter(obj => obj.word && /^[a-zA-Z]+$/.test(obj.word));
  
  // Fixed launch date
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
  const usernameInput = document.getElementById("username-input");
  const passwordInput = document.getElementById("password-input"); 
  const leaderboardBtn = document.getElementById("leaderboard-button");
  const leaderboardModal = document.getElementById("leaderboard-modal");
  const closeLeaderboardBtn = document.getElementById("close-leaderboard");
  const usernameView = document.getElementById("username-view");
  const statsView = document.getElementById("stats-view");
  const saveUsernameBtn = document.getElementById("save-username-btn");
  const usernameError = document.getElementById("username-error");
  const tabBtns = document.querySelectorAll(".tab-btn");
  const lbLoading = document.getElementById("lb-loading");
  const lbList = document.getElementById("lb-list");

  const wordCache = {};

  const today = new Date();
  const localDateAsUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const daysPassed = Math.max(0, Math.floor((localDateAsUTC - launchDate) / 86400000));
  
  if (WORD_SOURCE !== "supabase" && daysPassed >= DAILY_WORDS.length) {
    boardEl.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; padding: 1rem;">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" style="width: 3rem; height: 3rem; margin-bottom: 1rem;">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <h2 style="margin: 0 0 0.5rem; color: var(--text);">Out of Words</h2>
        <p style="margin: 0; color: var(--muted); font-size: 0.95rem;">We've exhausted the local dictionary. Check back tomorrow!</p>
      </div>
    `;
    keyboardEl.style.opacity = "0.5";
    keyboardEl.style.pointerEvents = "none";
    throw new Error("Word list exhausted.");
  }

  const solutionIndex = daysPassed;
  
  let solution = "";
  let wordCategory = "";
  let wordLength = 0;
  let maxRows = 0;

  async function fetchTodaysWord() {
    if (WORD_SOURCE === "supabase") {
      try {
        const { data, error } = await supabase
          .from('words')
          .select('word, category')
          .eq('day_index', solutionIndex)
          .single();

        if (error) throw error;

        solution = data.word.toUpperCase();
        wordCategory = data.category;
        
      } catch (err) {
        console.error("Database query failed:", err);
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

  const storageKey = `wordle-mobile-${solutionIndex}`;
  const themeKey = "wordle-mobile-theme";
  const userKey = "wordle-user-data-v2"; 

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
    return crypto.randomUUID();
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
        const rawPass = passwordInput.value.trim();
        const pass = await hashPassword(rawPass); // Now 'pass' is a secure string of gibberish!
        usernameError.classList.add("hidden");
      
      if (name.length < 3) {
        usernameError.textContent = "Name too short (min 3 characters)";
        usernameError.classList.remove("hidden");
        return;
      }
      if (rawPass.length < 3) {
        usernameError.textContent = "Password too short (min 3 characters)";
        usernameError.classList.remove("hidden");
        return;
      }
      
      const userData = getUserData();
      saveUsernameBtn.textContent = "Saving...";
      saveUsernameBtn.disabled = true;

      try {
        // 1. Check if the username already exists in the database
        const { data: existingUser, error: fetchError } = await supabase
          .from('leaderboards')
          .select('uuid, password')
          .eq('username', name)
          .maybeSingle();

        if (existingUser) {
          // USER EXISTS -> Check password (LOGIN FLOW)
          if (existingUser.password === pass) {
            // Password matches! Sync this device to the cloud profile
            userData.uuid = existingUser.uuid;
            userData.username = name;
            localStorage.setItem(userKey, JSON.stringify(userData));
          } else {
            // Wrong password
            usernameError.textContent = "Username taken or wrong password.";
            usernameError.classList.remove("hidden");
            return;
          }
        } else {
          // USER DOES NOT EXIST -> Create new record (REGISTER FLOW)
          const { error: insertError } = await supabase.from('leaderboards').insert([
            { 
              uuid: userData.uuid, 
              username: name, 
              password: pass, 
              games_played: 0, 
              total_guesses: 0, 
              winstreak: 0, 
              max_winstreak: 0,
              total_hints: 0
            }
          ]);
          if (insertError) throw insertError;
          
          userData.username = name;
          localStorage.setItem(userKey, JSON.stringify(userData));
        }
        
        // Success! Swap views and load leaderboard
        usernameView.classList.add("hidden");
        statsView.classList.remove("hidden");
        loadLeaderboardData("avg");

      } catch (error) {
        console.error("Save error:", error);
        usernameError.textContent = "Could not save. Try again.";
        usernameError.classList.remove("hidden");
      } finally {
        saveUsernameBtn.textContent = "Login / Register";
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
        // Select total_hints added here
        const { data: res, error } = await supabase
          .from('leaderboards')
          .select('username, games_played, total_guesses, total_hints')
          .order('games_played', { ascending: false });
        
        if (error) throw error;

        if (res && res.length > 0) {
          data = res.map(p => ({
            ...p,
            avg: ((p.total_guesses / GUESS_SCALE) / p.games_played).toFixed(2)
          })).sort((a, b) => a.avg - b.avg).slice(0, 50);
        }

      } else if (type === "streak") {
        // Select total_hints added here
        const { data: res, error } = await supabase
          .from('leaderboards')
          .select('username, winstreak, max_winstreak, total_hints')
          .order('max_winstreak', { ascending: false })
          .limit(50);
          
        if (error) throw error;
        if (res) data = res;
      }

      lbLoading.classList.add("hidden");
      lbList.classList.remove("hidden");

      if (data.length === 0) {
        const msg = type === "avg"
          ? "No games played yet. Be the first!"
          : "No streaks to show yet. Win some games!";
        lbList.innerHTML = `<li class="lb-item" style="justify-content:center; color: var(--muted); font-size:0.9rem;">${msg}</li>`;
        return;
      }

      // Grab the current user's name so we can highlight them
      const currentUser = getUserData().username;

      data.forEach((player, index) => {
        const li = document.createElement("li");
        li.className = "lb-item";
        if (index === 0) li.classList.add("rank-1");
        else if (index === 1) li.classList.add("rank-2");
        else if (index === 2) li.classList.add("rank-3");

        let medal = "";
        if (index === 0) medal = "🥇 ";
        else if (index === 1) medal = "🥈 ";
        else if (index === 2) medal = "🥉 ";
        
        const scoreVal = type === "avg"
          ? player.avg
          : (player.max_winstreak ?? player.winstreak ?? 0);
        
        // The Hint Badge: Only shows up if they have used at least 1 hint
        let hintBadge = "";
        if (player.total_hints > 0) {
          hintBadge = ` <span style="font-size: 0.8em; opacity: 0.8;" title="${player.total_hints} hints used all-time">💡${player.total_hints}</span>`;
        }

        let displayName = player.username + hintBadge;

        // Check if this row belongs to the person looking at the screen
        if (player.username === currentUser) {
          displayName += " <i style='opacity: 0.6; font-weight: normal; font-size: 0.85em;'>(Me)</i>";
        }
        
        li.innerHTML = `
          <div><span class="rank">#${index + 1}</span> ${medal}${displayName}</div>
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

  // Updated stats – no hint penalties, but tracks total hints
  async function updateUserStats(won, rawGuesses, hints) {
    if (hasSubmittedToLeaderboard) return;
    
    const userData = getUserData();
    if (!userData.username) return; 

    const scaledGuesses = rawGuesses * GUESS_SCALE; 

    try {
      const { data: userRecord, error: fetchError } = await supabase
        .from('leaderboards')
        .select('*')
        .eq('uuid', userData.uuid)
        .maybeSingle();

      if (fetchError || !userRecord) return;

      const newWinstreak = won ? userRecord.winstreak + 1 : 0;
      const updates = {
        games_played: userRecord.games_played + 1,
        total_guesses: userRecord.total_guesses + scaledGuesses,
        winstreak: newWinstreak,
        max_winstreak: Math.max(newWinstreak, userRecord.max_winstreak ?? 0),
        total_hints: (userRecord.total_hints || 0) + hints // <-- Adds the hints to their permanent record
      };

      await supabase.from('leaderboards').update(updates).eq('uuid', userData.uuid);
        
      hasSubmittedToLeaderboard = true;
      saveState();

    } catch (e) {
      console.error("Error updating stats", e);
    }
  }

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

  // New first hint: fetch definition
  function showHint() {
    if (gameOver || isSubmitting) return;

    if (hintsUsed === 0) {
      // First hint: fetch definition
      showHintPopup("Loading...", "Looking up the word...");
      fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${solution.toLowerCase()}`)
        .then(response => response.ok ? response.json() : Promise.reject())
        .then(data => {
          if (data && data[0] && data[0].meanings && data[0].meanings[0].definitions) {
            const definition = data[0].meanings[0].definitions[0].definition;
            showHintPopup("Definition", definition);
          } else {
            throw new Error();
          }
        })
        .catch(() => {
          // Fallback to category
          showHintPopup("Category", wordCategory);
        });
      hintsUsed++;
      updateHintBadge();
      saveState();
      return;
    }

    if (hintsUsed === 1) {
      // Second hint: reveal a missing letter
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
        updateUserStats(true, currentRow + 1, hintsUsed); // Passed hintsUsed here
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
        updateUserStats(false, maxRows, hintsUsed); // Passed hintsUsed here
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

  // Scrambles the password into a secure hash before sending to Supabase
  async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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