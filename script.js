(() => {
  // --- AUTOMATIC CACHE WIPE (UPGRADE TO V2) ---
  const CURRENT_VERSION = "v2.0";
  if (localStorage.getItem("wordle-version") !== CURRENT_VERSION) {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith("wordle-")) localStorage.removeItem(key);
    });
    localStorage.setItem("wordle-version", CURRENT_VERSION);
    window.location.reload(true);
    return;
  }
  // ---------------------------------------------

  // --- SUPABASE CONFIGURATION ---
  const supabaseUrl = 'https://hcehsxnudbwjydvenlfz.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZWhzeG51ZGJ3anlkdmVubGZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NzAsImV4cCI6MjA5MDY1Mjg3MH0.dPawhX90yZrme7nftMTq6A1j-KGqfHZJ8QnbBeFurl8';
  const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

  const WORD_SOURCE = "supabase";
  const GUESS_SCALE = 10;

  const safeWords = typeof WORDS !== "undefined" ? WORDS : [
    { word: "CEDAR", category: "Lebanon" },
    { word: "RUINS", category: "Lebanon" }
  ];
  const DAILY_WORDS = safeWords.filter(obj => obj.word && /^[a-zA-Z]+$/.test(obj.word));

  const launchDate = Date.UTC(2026, 3, 1);

  const boardEl = document.getElementById("board");
  const keyboardEl = document.getElementById("keyboard");
  const messageEl = document.getElementById("message");
  const metaLineEl = document.getElementById("meta-line");
  const themeToggle = document.getElementById("theme-toggle");
  const themeIcon = document.getElementById("theme-icon");
  const hintButton = document.getElementById("hint-button");
  const hintBadge = document.getElementById("hint-badge");
  const appLoader = document.getElementById("app-loader");
  const modal = document.getElementById("end-modal");
  const endTitle = document.getElementById("end-title");
  const countdownEl = document.getElementById("countdown");
  const closeModal = document.getElementById("close-modal");
  const wordleStarsLink = document.getElementById("wordle-stars-link");

  const usernameInput = document.getElementById("username-input");
  const passwordInput = document.getElementById("password-input");
  const leaderboardBtn = document.getElementById("leaderboard-button");
  const leaderboardModal = document.getElementById("leaderboard-modal");
  const closeLeaderboardBtn = document.getElementById("close-leaderboard");
  const leaderboardCard = document.querySelector(".leaderboard-card");
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
        <h2 style="margin: 0 0 0.5rem; color: var(--text);">Out of Words</h2>
        <p style="margin: 0; color: var(--muted); font-size: 0.95rem;">Check back tomorrow!</p>
      </div>
    `;
    keyboardEl.style.opacity = "0.5";
    keyboardEl.style.pointerEvents = "none";
    throw new Error("Word list exhausted.");
  }

  const solutionIndex = daysPassed;
  const reminderSentKey = `wordle-reminder-sent-${solutionIndex}`;
  let solution = "";
  let wordCategory = "";
  let wordLength = 0;
  let maxRows = 0;
  let maxHints = 2; // Will update after fetch

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
  let noonReminderTimeout = null;
  let noonReminderInterval = null;

  function generateUUID() { return crypto.randomUUID(); }

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

  async function fetchTodaysWord() {
    if (WORD_SOURCE === "supabase") {
      try {
        const { data, error } = await supabase.from('words').select('word, category').eq('day_index', solutionIndex).single();
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
    maxHints = wordLength >= 7 ? 3 : 2; // Dynamic 3rd hint for 7+ letters

    const userData = getUserData();
    if (userData.username) {
      try {
        const { data: remoteSync, error: syncErr } = await supabase
          .from('leaderboards')
          .select('saved_state')
          .eq('uuid', userData.uuid)
          .maybeSingle();

        if (!syncErr && remoteSync && remoteSync.saved_state) {
          const dbState = remoteSync.saved_state;
          const localState = loadState();

          const localIsCurrent = localState && localState.solutionIndex === solutionIndex;
          const dbIsCurrent = dbState.solutionIndex === solutionIndex;

          if (dbIsCurrent) {
            if (!localIsCurrent) {
              localStorage.setItem(storageKey, JSON.stringify(dbState));
            } else {
              const localProgress = localState.currentRow + (localState.gameOver ? 1 : 0);
              const dbProgress = dbState.currentRow + (dbState.gameOver ? 1 : 0);
              if (dbProgress > localProgress) {
                localStorage.setItem(storageKey, JSON.stringify(dbState));
              }
            }
          }
        }
      } catch (e) {
        console.error("Sync fetch failed:", e);
      }
    }
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
    initializeDailyNotifications();
    hideAppLoader();
    
    if (gameOver) showEndModal(Boolean(savedState?.won));
  });

  function hideAppLoader() {
    if (!appLoader) return;
    // Small delay so the transition feels intentional and smooth.
    window.setTimeout(() => {
      appLoader.classList.add("is-hidden");
      window.setTimeout(() => appLoader.remove(), 500);
    }, 180);
  }

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
        row.appendChild(tile);
      }
      boardEl.appendChild(row);
    }
  }

  function computeTileSize() {
    const vw = window.innerWidth || 375;
    const vh = window.innerHeight || 700;
    const widthFit = (vw - 28 - 5 * (wordLength - 1)) / wordLength;
    const heightFit = (vh * 0.42 - 5 * (maxRows - 1)) / maxRows;
    return Math.max(25, Math.min(58, Math.floor(Math.min(widthFit, heightFit))));
  }

  function buildKeyboard() {
    keyboardEl.innerHTML = "";
    const rows = [
      ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
      ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
      ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"]
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
    const logoutBtn = document.getElementById("leaderboard-logout-button");
    if (logoutBtn) logoutBtn.addEventListener("click", logoutLeaderboardAccount);
    closeModal.addEventListener("click", hideEndModal);

    if (wordleStarsLink) {
      wordleStarsLink.addEventListener("click", (e) => {
        if (e.defaultPrevented) return;
        if (e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        const href = wordleStarsLink.getAttribute("href");
        if (!href) return;

        e.preventDefault();
        document.body.classList.add("page-transition-out");
        window.setTimeout(() => {
          window.location.href = href;
        }, 240);
      });
    }

    // Initialize global tooltip portal (so tooltips are not clipped by modal/tab overflow)
    initGlobalTooltips();

    leaderboardBtn.addEventListener("click", openLeaderboard);
    closeLeaderboardBtn.addEventListener("click", () => leaderboardModal.classList.add("hidden"));

    saveUsernameBtn.addEventListener("click", async () => {
      const name = usernameInput.value.trim();
      const rawPass = passwordInput.value.trim();
      const pass = await hashPassword(rawPass);
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
        const { data: existingUser, error: fetchError } = await supabase
          .from('leaderboards')
          .select('uuid, password, saved_state')
          .eq('username', name)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (existingUser) {
          if (existingUser.password === pass) {
            userData.uuid = existingUser.uuid;
            userData.username = name;
            localStorage.setItem(userKey, JSON.stringify(userData));

            if (existingUser.saved_state && existingUser.saved_state.solutionIndex === solutionIndex) {
               localStorage.setItem(storageKey, JSON.stringify(existingUser.saved_state));
               window.location.reload(); 
               return;
            }
          } else {
            usernameError.textContent = "Username taken or wrong password.";
            usernameError.classList.remove("hidden");
            return;
          }
        } else {
          const { error: insertError } = await supabase.from('leaderboards').insert([
            {
              uuid: userData.uuid,
              username: name,
              password: pass,
              games_played: 0,
              total_guesses: 0,
              winstreak: 0,
              max_winstreak: 0,
              total_hints: 0,
              last_hint_day_index: null,
              saved_state: null, 
              notification_pref: 'off'
            }
          ]);
          if (insertError) throw insertError;
          userData.username = name;
          localStorage.setItem(userKey, JSON.stringify(userData));
        }

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

  function initializeDailyNotifications() {
    if (!("Notification" in window)) return;

    // Behavior:
    // - default => ask on load
    // - granted => don't ask again, just schedule reminders
    // - denied => don't ask again
    if (Notification.permission === "granted") {
      scheduleDailyNoonReminder();
      return;
    }

    if (Notification.permission === "default") {
      Notification.requestPermission()
        .then((permission) => {
          if (permission === "granted") {
            scheduleDailyNoonReminder();
          }
        })
        .catch(() => {});
    }
  }

  function isTodaysWordDone() {
    const state = loadState();
    return Boolean(state && state.solutionIndex === solutionIndex && state.gameOver);
  }

  function currentDayStamp() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function maybeSendDailyReminder() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (isTodaysWordDone()) return;

    const dayStamp = currentDayStamp();
    if (localStorage.getItem(reminderSentKey) === dayStamp) return;

    new Notification("Time for Wordle Unbound", {
      body: "It’s around noon — go do your Wordle!",
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%236aaa64'/><text x='50%' y='50%' dominant-baseline='central' text-anchor='middle' font-size='60' fill='white' font-family='sans-serif' font-weight='bold'>W</text></svg>"
    });

    localStorage.setItem(reminderSentKey, dayStamp);
  }

  function msUntilNextNoon() {
    const now = new Date();
    const nextNoon = new Date(now);
    nextNoon.setHours(12, 0, 0, 0);
    if (now >= nextNoon) nextNoon.setDate(nextNoon.getDate() + 1);
    return Math.max(0, nextNoon.getTime() - now.getTime());
  }

  function scheduleDailyNoonReminder() {
    if (noonReminderTimeout) clearTimeout(noonReminderTimeout);
    if (noonReminderInterval) clearInterval(noonReminderInterval);

    const now = new Date();
    if (now.getHours() >= 12) maybeSendDailyReminder();

    noonReminderTimeout = window.setTimeout(() => {
      maybeSendDailyReminder();
      noonReminderInterval = window.setInterval(maybeSendDailyReminder, 24 * 60 * 60 * 1000);
    }, msUntilNextNoon());
  }

  // Create a tooltip element appended to document.body and show/hide/position on hover
  function initGlobalTooltips() {
    let tt = document.createElement("div");
    tt.id = "global-tooltip";
    tt.className = "global-tooltip";
    document.body.appendChild(tt);

    let activeEl = null;
    let hideTimeout = null;

    document.addEventListener("mouseover", (e) => {
      const el = e.target.closest && e.target.closest(".has-tooltip");
      if (!el) return;
      activeEl = el;
      const text = el.getAttribute("data-tooltip") || "";
      if (!text) return;
      tt.textContent = text;
      tt.style.display = "block";
      // small timeout to allow styles & measurement
      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        // default to right-side placement, but if near right edge, place left
        const ttRect = tt.getBoundingClientRect();
        let left = rect.right + 10;
        let top = rect.top + (rect.height / 2) - (ttRect.height / 2);
        if (left + ttRect.width > window.innerWidth - 8) {
          left = rect.left - ttRect.width - 10;
        }
        if (top < 8) top = 8;
        if (top + ttRect.height > window.innerHeight - 8) top = window.innerHeight - ttRect.height - 8;
        tt.style.left = `${Math.max(8, left)}px`;
        tt.style.top = `${top}px`;
        tt.classList.add("show");
      });
    });

    document.addEventListener("mouseout", (e) => {
      if (!activeEl) return;
      const related = e.relatedTarget;
      if (related && activeEl.contains(related)) return;
      tt.classList.remove("show");
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => { tt.style.display = "none"; }, 120);
      activeEl = null;
    });

    // Also support touch (tap) to show briefly on mobile
    document.addEventListener("touchstart", (e) => {
      const el = e.target.closest && e.target.closest(".has-tooltip");
      if (!el) return;
      const text = el.getAttribute("data-tooltip") || "";
      if (!text) return;
      tt.textContent = text;
      tt.style.display = "block";
      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const ttRect = tt.getBoundingClientRect();
        let left = rect.right + 10;
        let top = rect.top + (rect.height / 2) - (ttRect.height / 2);
        if (left + ttRect.width > window.innerWidth - 8) left = rect.left - ttRect.width - 10;
        tt.style.left = `${Math.max(8, left)}px`;
        tt.style.top = `${Math.max(8, top)}px`;
        tt.classList.add("show");
      });
      setTimeout(() => {
        tt.classList.remove("show");
        tt.style.display = "none";
      }, 2200);
    }, { passive: true });
  }

  function openLeaderboard() {
    leaderboardModal.classList.remove("hidden");
    const logoutBtn = document.getElementById("leaderboard-logout-button");
    const userData = getUserData();
    if (logoutBtn) logoutBtn.style.display = userData.username ? "grid" : "none";

    if (!userData.username) {
      usernameView.classList.remove("hidden");
      statsView.classList.add("hidden");
    } else {
      usernameView.classList.add("hidden");
      statsView.classList.remove("hidden");
      tabBtns[0].click();
    }
  }

  function logoutLeaderboardAccount() {
    localStorage.removeItem(userKey);
    hasSubmittedToLeaderboard = false;
    usernameInput.value = "";
    passwordInput.value = "";
    usernameError.classList.add("hidden");
    
    const freshUser = { uuid: crypto.randomUUID(), username: null };
    localStorage.setItem(userKey, JSON.stringify(freshUser));
    statsView.classList.add("hidden");
    usernameView.classList.remove("hidden");
  }

  async function loadLeaderboardData(type) {
    lbLoading.classList.remove("hidden");
    lbLoading.textContent = "Loading...";
    lbList.classList.add("hidden");
    lbList.innerHTML = "";

    try {
      let data = [];
      if (type === "avg") {
        const { data: res, error } = await supabase.from('leaderboards')
          .select('username, games_played, total_guesses, total_hints, last_hint_day_index')
          .order('games_played', { ascending: false });
        if (error) throw error;
        if (res && res.length > 0) {
          data = res.map(p => ({
            ...p,
            avg: ((p.total_guesses / GUESS_SCALE) / p.games_played).toFixed(2)
          })).sort((a, b) => a.avg - b.avg).slice(0, 50);
        }
      } else if (type === "streak") {
        const { data: res, error } = await supabase.from('leaderboards')
          .select('username, winstreak, max_winstreak, total_hints, last_hint_day_index')
          .order('max_winstreak', { ascending: false }).limit(50);
        if (error) throw error;
        if (res) data = res;
      }

      lbLoading.classList.add("hidden");
      lbList.classList.remove("hidden");

      if (data.length === 0) {
        lbList.innerHTML = `<li class="lb-item lb-empty">No data found.</li>`;
        return;
      }

      const currentUser = getUserData().username;
      
      const medal1 = `<svg class="lb-medal" viewBox="0 0 24 24" fill="none" stroke="#b8860b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>`;
      const medal2 = `<svg class="lb-medal" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>`;
      const medal3 = `<svg class="lb-medal" viewBox="0 0 24 24" fill="none" stroke="#8b4513" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>`;

      data.forEach((player, index) => {
        const li = document.createElement("li");
        li.className = "lb-item";
        if (index === 0) li.classList.add("rank-1");
        else if (index === 1) li.classList.add("rank-2");
        else if (index === 2) li.classList.add("rank-3");

        let medal = index === 0 ? medal1 : index === 1 ? medal2 : index === 2 ? medal3 : "";
        const scoreVal = type === "avg" ? player.avg : (player.max_winstreak ?? player.winstreak ?? 0);
        
        let hintBadge = "";
        if (player.last_hint_day_index === solutionIndex) {
          hintBadge = `
            <span class="has-tooltip" data-tooltip="This user used hints to guess their word">
              <svg class="lb-hint-icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A6 6 0 1 0 7.5 11.5c.76.76 1.23 1.52 1.41 2.5"></path></svg>
            </span>
          `;
        }

        const isCurrentUser = player.username === currentUser;
        li.innerHTML = `
          <div class="lb-left">
            <span class="rank">#${index + 1}</span>
            ${medal}
            <span class="lb-name">${player.username}${hintBadge}${isCurrentUser ? " <span class='lb-self'>(Me)</span>" : ""}</span>
          </div>
          <div class="lb-score">${scoreVal}</div>
        `;
        lbList.appendChild(li);
      });
    } catch (e) {
      console.error("Leaderboard Error", e);
      lbLoading.classList.add("hidden");
      lbList.classList.remove("hidden");
      lbList.innerHTML = `<li class="lb-item lb-empty">Failed to load.</li>`;
    }
  }

  async function updateUserStats(won, rawGuesses, hints) {
    if (hasSubmittedToLeaderboard) return;
    const userData = getUserData();
    if (!userData.username) return;

    const scaledGuesses = rawGuesses * GUESS_SCALE;
    try {
      const { data: userRecord, error: fetchError } = await supabase.from('leaderboards').select('*').eq('uuid', userData.uuid).maybeSingle();
      if (fetchError || !userRecord) return;

      const newWinstreak = won ? userRecord.winstreak + 1 : 0;
      const updates = {
        games_played: userRecord.games_played + 1,
        total_guesses: userRecord.total_guesses + scaledGuesses,
        winstreak: newWinstreak,
        max_winstreak: Math.max(newWinstreak, userRecord.max_winstreak ?? 0),
        total_hints: (userRecord.total_hints || 0) + hints,
        last_hint_day_index: hints > 0 ? solutionIndex : userRecord.last_hint_day_index ?? null
      };
      await supabase.from('leaderboards').update(updates).eq('uuid', userData.uuid);
      hasSubmittedToLeaderboard = true;
      saveState();
    } catch (e) { console.error("Error updating stats", e); }
  }

  function updateHintBadge() {
    const hintsLeft = maxHints - hintsUsed;
    hintBadge.textContent = Math.max(0, hintsLeft);
    if (hintsLeft <= 0) hintBadge.classList.add("empty");
    else hintBadge.classList.remove("empty");
  }

  function showHintPopup(title, body) {
    let overlay = document.getElementById("hint-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "hint-overlay";
      overlay.style.cssText = "position:fixed;inset:0;z-index:999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);animation:fadeIn 0.15s ease;";
      
      const s = document.createElement("style");
      s.textContent = "@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes popIn{from{transform:scale(0.88);opacity:0}to{transform:scale(1);opacity:1}}#hint-card{animation:popIn 0.18s ease;background:var(--bg);border:1.5px solid var(--border);border-radius:16px;padding:28px 32px;min-width:260px;max-width:88vw;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.22);}#hint-card .hint-label{font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--subtext);margin-bottom:10px;font-weight:600;}#hint-card .hint-title{font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px;}#hint-card .hint-body{font-size:22px;font-weight:700;color:var(--text);margin-bottom:22px;line-height:1.3;}#hint-card .hint-close{display:inline-block;padding:9px 28px;border-radius:8px;background:var(--text);color:var(--bg);font-size:14px;font-weight:600;border:none;cursor:pointer;letter-spacing:0.02em;}";
      document.head.appendChild(s);
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div id="hint-card"><div class="hint-label">Hint</div><div class="hint-title">${title}</div><div class="hint-body">${body}</div><button class="hint-close" id="hint-close-btn">Got it</button></div>`;
    overlay.style.display = "flex";

    const close = () => overlay.style.display = "none";
    document.getElementById("hint-close-btn").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  }

  function showHint() {
    if (gameOver || isSubmitting) return;

    if (hintsUsed === 0) {
      // Less-revealing first hint: only indicate whether the word has repeated letters
      const hasRepeat = (() => {
        const counts = {};
        for (const ch of solution) {
          counts[ch] = (counts[ch] || 0) + 1;
          if (counts[ch] > 1) return true;
        }
        return false;
      })();

      const body = hasRepeat ? "This word contains repeated letters." : "This word contains no repeated letters.";
      showHintPopup("Letter Pattern", body);
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
          if (row.colors[i] === "correct" || row.colors[i] === "present") correctLetters.add(row.guess[i]);
        }
      }
      const unrevealed = solution.split("").filter(l => !correctLetters.has(l));

      if (unrevealed.length > 0) {
        const randomHintLetter = unrevealed[Math.floor(Math.random() * unrevealed.length)];
        showHintPopup("Letter hint", `The word contains the letter<br><span style="font-size:36px; color: var(--present);">${randomHintLetter}</span>`);
        hintsUsed++;
        updateHintBadge();
        saveState();

        // Keyboard highlight animation logic
        setTimeout(() => {
          const keyEl = document.getElementById(`key-${randomHintLetter}`);
          if (keyEl) {
            keyEl.classList.add("hint-highlight-anim");
            updateKeyboardColor(randomHintLetter, "present");
            setTimeout(() => keyEl.classList.remove("hint-highlight-anim"), 1000);
          }
        }, 400);

      } else {
        showHintPopup("You're close!", "You've found all the letters —<br>now find their spots!");
      }
      return;
    }

    if (hintsUsed === 2 && maxHints === 3) {
      // 3rd Hint (Only for 7 letter words): Eliminate 3 unused wrong letters
      const keyboardKeys = "QWERTYUIOPASDFGHJKLZXCVBNM".split("");
      const unguessedUnused = keyboardKeys.filter(k => {
        const keyEl = document.getElementById(`key-${k}`);
        const isGuessed = keyEl.classList.contains("correct") || keyEl.classList.contains("present") || keyEl.classList.contains("absent");
        const inSolution = solution.includes(k);
        return !isGuessed && !inSolution;
      });

      if (unguessedUnused.length >= 3) {
        const toEliminate = unguessedUnused.sort(() => 0.5 - Math.random()).slice(0, 3);
        
        setTimeout(() => {
          toEliminate.forEach(k => {
            updateKeyboardColor(k, "absent");
            const keyEl = document.getElementById(`key-${k}`);
            if (keyEl) {
              keyEl.classList.add("hint-eliminate-anim");
              setTimeout(() => keyEl.classList.remove("hint-eliminate-anim"), 1000);
            }
          });
        }, 400);

        showHintPopup("Elimination", `Removed 3 incorrect letters<br>from your keyboard.`);
        hintsUsed++;
        updateHintBadge();
        saveState();
      } else {
        showHintPopup("No more eliminations", "Not enough unused letters left<br>to eliminate.");
      }
    }
  }

  function handleKey(key) {
    if (gameOver || isSubmitting) return;

    if (key === "ENTER") return submitGuess();
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
        updateUserStats(true, currentRow + 1, hintsUsed);
        saveState(true);
        showMessage("Solved.");
        showEndModal(true);
      } else {
        currentRow += 1;
        currentGuess = "";
        if (currentRow >= maxRows) {
          gameOver = true;
          updateUserStats(false, maxRows, hintsUsed);
          saveState(false);
          showMessage(`The word was ${solution}.`);
          showEndModal(false);
        } else {
          updateBoard();
          saveState();
        }
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
    const existing = key.classList.contains("correct") ? "correct" : key.classList.contains("present") ? "present" : key.classList.contains("absent") ? "absent" : null;
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
    if (wordCache[word] !== undefined) return wordCache[word];

    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
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
      if (diff <= 0) return countdownEl.textContent = "00:00:00";
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      countdownEl.textContent = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    };
    update();
    countdownTimer = setInterval(update, 1000);
  }

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

    const userData = getUserData();
    if (userData.username) {
      supabase.from('leaderboards').update({ saved_state: state }).eq('uuid', userData.uuid).then(({error}) => {
         if(error) console.error("Failed to sync state to DB", error);
      });
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  // --- FINAL BINDINGS ---
  leaderboardModal.addEventListener("click", (e) => {
    if (!leaderboardCard.contains(e.target)) leaderboardModal.classList.add("hidden");
  });
  
  if (hintButton) hintButton.addEventListener("click", showHint);

  document.addEventListener("keydown", (e) => {
    // BUG FIX: Ignore physical keystrokes if typing inside the login/register inputs
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    
    if (gameOver || isSubmitting) return;
    if (!e.key) return; // Safeguard against weird browser autofill events

    if (e.key === "Enter") handleKey("ENTER");
    else if (e.key === "Backspace") handleKey("⌫");
    else {
      const letter = e.key.toUpperCase();
      if (/^[A-Z]$/.test(letter)) handleKey(letter);
    }
  });

  window.addEventListener("keydown", (e) => { if (e.code === "Space" && e.target.tagName !== "INPUT") e.preventDefault(); });
  window.addEventListener("resize", () => boardEl.style.setProperty("--tile-size", computeTileSize() + "px"));
  modal.addEventListener("click", (e) => { if (e.target === modal) hideEndModal(); });

})();