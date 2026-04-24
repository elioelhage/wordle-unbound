(() => {
  // --- AUTOMATIC CACHE WIPE (UPGRADE TO V2) ---
  const CURRENT_VERSION = "v2.0";
  if (localStorage.getItem("wordle-version") !== CURRENT_VERSION) {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith("wordle-")) localStorage.removeItem(key);
    });
    localStorage.setItem("wordle-version", CURRENT_VERSION);
    const fresh = new URL(window.location.href);
    fresh.searchParams.set("_refresh", String(Date.now()));
    window.location.replace(fresh.toString());
    return;
  }
  // ---------------------------------------------

  // --- SUPABASE CONFIGURATION ---
  // Keys are now protected on backend - frontend calls API instead
  const API_URL = 'https://wordshift-api.onrender.com'; // Change to your Render URL
  const supabase = null; // Not used directly, keeping as null for compatibility

  const WORD_SOURCE = "supabase";
  const GUESS_SCALE = 10;
  const LEADERBOARD_LOW_AVG_THRESHOLD = 3.0;
  const LEADERBOARD_LOW_AVG_MIN_GAMES = 2;
  const LEADERBOARD_CONSISTENCY_BONUS_MODE = "flat"; // "flat" | "percent"
  const LEADERBOARD_CONSISTENCY_BONUS_CAP = 0.30;

  const LEADERBOARD_CONSISTENCY_BONUS_TIERS = [
    { games: 50, bonus: 0.30 },
    { games: 21, bonus: 0.20 },
    { games: 7, bonus: 0.10 },
    { games: 3, bonus: 0.07 }
  ];

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

  const usernameInput = document.getElementById("username-input");
  const passwordInput = document.getElementById("password-input");
  const leaderboardBtn = document.getElementById("leaderboard-button");
  const raceLobbyBtn = document.getElementById("race-lobby-button");
  const accountMenuButton = document.getElementById("account-menu-button");
  const accountMenuPanel = document.getElementById("account-menu-panel");
  const accountActionBtn = document.getElementById("account-action-btn");
  const passafloraThemeBtn = document.getElementById("passaflora-theme-btn");
  const giveUpBtn = document.getElementById("give-up-btn");
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
  const lbRulesToggle = document.getElementById("lb-rules-toggle");
  const lbRulesPanel = document.getElementById("lb-rules-panel");
  const walkthroughModal = document.getElementById("walkthrough-modal");
  const walkthroughCard = walkthroughModal?.querySelector(".walkthrough-card");
  const walkthroughTitle = document.getElementById("walkthrough-title");
  const walkthroughText = document.getElementById("walkthrough-text");
  const walkthroughDemo = document.getElementById("walkthrough-demo");
  const walkthroughStepIndicator = document.getElementById("walkthrough-step-indicator");
  const walkthroughSkipBtn = document.getElementById("walkthrough-skip");
  const walkthroughPrevBtn = document.getElementById("walkthrough-prev");
  const walkthroughNextBtn = document.getElementById("walkthrough-next");
  const walkthroughAccountBtn = document.getElementById("walkthrough-account");
  const walkthroughActions = walkthroughModal?.querySelector(".walkthrough-actions");

  const wordCache = {};

  function getCurrentSolutionIndex() {
    const now = new Date();
    const localDateAsUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.floor((localDateAsUTC - launchDate) / 86400000));
  }

  const daysPassed = getCurrentSolutionIndex();

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
  const reminderSentPrefix = `wordle-reminder-sent-${solutionIndex}`;
  let solution = "";
  let wordCategory = "";
  let wordLength = 0;
  let maxRows = 0;
  let maxHints = 2; // Will update after fetch

  const storageKey = `wordle-mobile-${solutionIndex}`;
  const endModalSeenKey = `wordle-end-modal-seen-${solutionIndex}`;
  const themeKey = "wordle-mobile-theme";
  const userKey = "wordle-user-data-v2";
  const walkthroughKey = "wordle-first-walkthrough-v1";
  const pageParams = new URLSearchParams(window.location.search);
  const raceLoginIntent = pageParams.get("raceLogin") === "1";
  const raceRoomIntent = (pageParams.get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

  if (pageParams.has("_refresh")) {
    const clean = new URL(window.location.href);
    clean.searchParams.delete("_refresh");
    window.history.replaceState({}, "", clean);
  }

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
  let afternoonReminderTimeout = null;
  let afternoonReminderInterval = null;
  let dayRolloverTimeout = null;
  let hasTriggeredDayReset = false;
  let loaderFailsafeTimer = null;
  let walkthroughLengthTimer = null;
  let walkthroughLengthFrame = 0;

  function safeHardRefresh(delay = 220) {
    const url = new URL(window.location.href);
    url.searchParams.set("_refresh", String(Date.now()));
    window.setTimeout(() => {
      window.location.replace(url.toString());
    }, delay);
  }

  function armLoaderFailsafe(timeoutMs = 9000) {
    if (loaderFailsafeTimer) clearTimeout(loaderFailsafeTimer);
    loaderFailsafeTimer = window.setTimeout(() => {
      hideAppLoader();
      if (!gameOver) {
        showMessage("Loading took too long. You can keep playing or refresh.");
      }
    }, timeoutMs);
  }

  function clearLoaderFailsafe() {
    if (!loaderFailsafeTimer) return;
    clearTimeout(loaderFailsafeTimer);
    loaderFailsafeTimer = null;
  }
  let walkthroughStep = 0;

  const walkthroughSteps = [
    {
  title: "Welcome to WordShift",
      body: "Guess the hidden daily word by typing letters and submitting with ENTER. Every day has a fresh word.",
      demo: "intro",
      pulse: false
    },
    {
      title: "Green and yellow feedback",
      body: "Green means correct letter in the exact spot. Yellow means correct letter but wrong position.",
      demo: "colors",
      pulse: false
    },
    {
      title: "Word length changes by day",
      body: "Some days are short, some are longer. The board and allowed tries automatically adjust to today’s word length.",
      demo: "length",
      pulse: false
    },
    {
      title: "Hints can save a run",
      body: "Use hints when stuck. They can reveal patterns, letters, or eliminate options depending on word length.",
      demo: "hint",
      pulse: false
    },
    {
      title: "Turn on reminders",
      body: "Turn on reminders to do the daily WordShift.",
      demo: "notify",
      pulse: false
    },
    {
      title: "Create an account for the full experience",
      body: "Accounts unlock synced progress, race mode, and leaderboard placement — this is where the real competition happens.",
      demo: "account",
      pulse: true
    }
  ];

  function generateUUID() { return crypto.randomUUID(); }

  // NOTE: User requested client-side AES decryption with provided key.
  // Format assumption for `word_encrypted`:
  // base64(12-byte IV || ciphertext+tag)
  const WORDSHIFT_AES_KEY_HEX = "0f55cbb6cc1ba7a09803f99276dcec8f9a4e4bb8e833a0a9c90c176e711db892";

  function hexToBytes(hex) {
    const clean = (hex || "").trim();
    if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
      throw new Error("Invalid AES key hex format.");
    }
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
    }
    return out;
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }

  async function decryptEncryptedWord(payloadBase64) {
    if (!payloadBase64) throw new Error("Missing encrypted payload.");

    const keyBytes = hexToBytes(WORDSHIFT_AES_KEY_HEX);
    const payload = base64ToBytes(payloadBase64);
    if (payload.length < 13) throw new Error("Encrypted payload is too short.");

    const iv = payload.slice(0, 12);
    const ciphertext = payload.slice(12);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    const plainBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      ciphertext
    );

    return new TextDecoder().decode(plainBuffer).trim().toUpperCase();
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

  async function fetchTodaysWord() {
    if (WORD_SOURCE === "supabase" && supabase) {
      try {
        const { data, error } = await supabase
          .from('words')
          .select('word_encrypted, word_length, category')
          .eq('day_index', solutionIndex)
          .single();
        if (error) throw error;

        solution = await decryptEncryptedWord(data.word_encrypted);
        if (!solution) throw new Error("Decryption returned empty word.");

        if (typeof data.word_length === "number" && data.word_length > 0 && solution.length !== data.word_length) {
          throw new Error(`Decrypted word length mismatch: got ${solution.length}, expected ${data.word_length}`);
        }

        wordCategory = data.category;
        wordLength = typeof data.word_length === "number" && data.word_length > 0
          ? data.word_length
          : solution.length;
      } catch (err) {
        console.error("Database query failed:", err);
        const obj = DAILY_WORDS[solutionIndex % DAILY_WORDS.length];
        solution = obj.word.toUpperCase();
        wordCategory = obj.category;
        wordLength = solution.length;
      }
    } else {
      const obj = DAILY_WORDS[solutionIndex];
      solution = obj.word.toUpperCase();
      wordCategory = obj.category;
      wordLength = solution.length;
    }

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

  armLoaderFailsafe();

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
    } else {
      // New day or fresh game - reset submission flag
      hasSubmittedToLeaderboard = false;
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
  scheduleDayRolloverReset();
    if (raceLoginIntent) {
      openAuthModal("Login to continue to Race Lobby.");
      usernameView.classList.remove("hidden");
      statsView.classList.add("hidden");
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("raceLogin");
      cleanUrl.searchParams.delete("room");
      window.history.replaceState({}, "", cleanUrl);
    }
    
  if (gameOver) showEndModal(inferWonFromState(savedState));

    maybeShowFirstTimeWalkthrough();
  }).catch((err) => {
    console.error("Initialization failed:", err);
    showMessage("Something failed to load. Please try again.");
  }).finally(() => {
    hideAppLoader();
  });

  function setWalkthroughSeen() {
    localStorage.setItem(walkthroughKey, "1");
  }

  function inferWonFromState(state) {
    if (!state?.gameOver) return false;
    if (typeof state.won === "boolean") return state.won;
    const rows = Array.isArray(state.boardState) ? state.boardState : [];
    return rows.some((row) => row?.guess === solution);
  }

  function clearWalkthroughLengthAnimation() {
    if (!walkthroughLengthTimer) return;
    clearInterval(walkthroughLengthTimer);
    walkthroughLengthTimer = null;
  }

  function renderLengthTransitionFrame() {
    if (!walkthroughDemo) return;
    const frames = [
      { word: "STARS", length: 5 },
      { word: "GALAXY", length: 6 },
      { word: "ROCKETS", length: 7 }
    ];
    const frame = frames[walkthroughLengthFrame % frames.length];
    walkthroughLengthFrame += 1;

    const chars = frame.word.split("");
    walkthroughDemo.innerHTML = `
      <div class="walkthrough-row walkthrough-row-length" data-length="${frame.length}">
        ${chars.map((char) => `<span class="walkthrough-tile w-demo-letter">${char}</span>`).join("")}
      </div>
      <div class="walkthrough-legend">
        <span class="walkthrough-badge neutral">Today can be ${frame.length} letters</span>
      </div>
    `;
    walkthroughDemo.classList.add("length-transition");
  }

  function clearWalkthroughTransientState() {
    clearWalkthroughLengthAnimation();
    walkthroughDemo?.classList.remove("show-colors", "length-transition");
  }

  function renderWalkthroughDemo(step) {
    if (!walkthroughDemo) return;
    clearWalkthroughTransientState();

    if (step.demo === "colors") {
      walkthroughDemo.innerHTML = `
        <div class="walkthrough-row">
          <span class="walkthrough-tile w-demo-letter">W</span>
          <span class="walkthrough-tile w-demo-letter">O</span>
          <span class="walkthrough-tile w-demo-letter">R</span>
          <span class="walkthrough-tile w-demo-letter">D</span>
          <span class="walkthrough-tile w-demo-letter">S</span>
        </div>
        <div class="walkthrough-legend">
          <span class="walkthrough-badge correct">Green = right spot</span>
          <span class="walkthrough-badge present">Yellow = right letter, wrong spot</span>
        </div>
      `;
      walkthroughDemo.classList.add("show-colors");
      return;
    }

    if (step.demo === "length") {
      walkthroughLengthFrame = 0;
      renderLengthTransitionFrame();
      walkthroughLengthTimer = window.setInterval(renderLengthTransitionFrame, 1000);
      return;
    }

    if (step.demo === "hint") {
      walkthroughDemo.innerHTML = `
        <div class="walkthrough-hint-showcase">
          <button class="icon-button hint-button walkthrough-hint-focus" type="button" aria-label="Hint example" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 18h6"></path>
              <path d="M10 22h4"></path>
              <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A6 6 0 1 0 7.5 11.5c.76.76 1.23 1.52 1.41 2.5"></path>
            </svg>
            <span class="hint-badge">2</span>
          </button>
        </div>
        <div class="walkthrough-legend">
          <span class="walkthrough-badge neutral">Tap the lightbulb button for help when you’re stuck.</span>
        </div>
      `;
      return;
    }

    if (step.demo === "notify") {
      const permission = ("Notification" in window) ? Notification.permission : "unsupported";
      const statusText = permission === "granted"
        ? "Notifications are enabled. You’re set."
        : permission === "denied"
          ? "Notifications are blocked in this browser."
          : permission === "unsupported"
            ? "This browser doesn’t support notifications."
            : "Enable notifications to get reminder pings.";

      const canEnable = permission === "default";
      walkthroughDemo.innerHTML = `
        <div class="walkthrough-notify-showcase">
          <button id="walkthrough-enable-notifications" class="primary-button walkthrough-notify-btn" type="button" ${canEnable ? "" : "disabled"}>${canEnable ? "Allow notifications" : "Notifications status"}</button>
        </div>
        <div class="walkthrough-legend">
          <span class="walkthrough-badge neutral">${statusText}</span>
        </div>
      `;
      return;
    }

    if (step.demo === "account") {
      walkthroughDemo.innerHTML = `
        <div class="walkthrough-row">
          <span class="walkthrough-tile w-demo-letter">R</span>
          <span class="walkthrough-tile w-demo-letter">A</span>
          <span class="walkthrough-tile w-demo-letter">C</span>
          <span class="walkthrough-tile w-demo-letter">E</span>
          <span class="walkthrough-tile w-demo-letter">S</span>
        </div>
        <div class="walkthrough-legend">
          <span class="walkthrough-badge neutral">Play without an account, or sign in to join leaderboards and race mode.</span>
        </div>
      `;
      return;
    }

    walkthroughDemo.innerHTML = `
      <div class="walkthrough-row">
        <span class="walkthrough-tile w-demo-letter">W</span>
        <span class="walkthrough-tile w-demo-letter">O</span>
        <span class="walkthrough-tile w-demo-letter">R</span>
        <span class="walkthrough-tile w-demo-letter">D</span>
        <span class="walkthrough-tile w-demo-letter">L</span>
        <span class="walkthrough-tile w-demo-letter">E</span>
      </div>
      <div class="walkthrough-legend">
        <span class="walkthrough-badge neutral">One fresh puzzle every day.</span>
      </div>
    `;
  }

  function closeWalkthrough(markSeen = true) {
    if (markSeen) setWalkthroughSeen();
    clearWalkthroughTransientState();
    walkthroughModal?.classList.add("hidden");
  }

  function renderWalkthroughStep() {
    if (!walkthroughModal) return;
    const step = walkthroughSteps[walkthroughStep] || walkthroughSteps[0];
    walkthroughTitle.textContent = step.title;
    walkthroughText.textContent = step.body;
    walkthroughStepIndicator.textContent = `${walkthroughStep + 1} / ${walkthroughSteps.length}`;
    renderWalkthroughDemo(step);
    walkthroughCard?.classList.toggle("pulse-account", Boolean(step.pulse));
    const isLastStep = walkthroughStep === walkthroughSteps.length - 1;
    const hideSkip = walkthroughStep >= 3;
    walkthroughActions?.classList.toggle("skip-collapsed", hideSkip);
    walkthroughActions?.classList.toggle("final-step-actions", isLastStep);
    walkthroughSkipBtn?.classList.toggle("hidden", hideSkip);
    walkthroughPrevBtn.disabled = walkthroughStep === 0;
    walkthroughNextBtn.textContent = isLastStep ? "Play without account" : "Next";
    if (walkthroughAccountBtn) walkthroughAccountBtn.textContent = "Play with account";
    walkthroughAccountBtn?.classList.toggle("hidden", !isLastStep);
    walkthroughAccountBtn?.classList.toggle("account-cta-primary", isLastStep);
    walkthroughNextBtn?.classList.toggle("walkthrough-next-secondary", isLastStep);
  }

  function openWalkthrough() {
    walkthroughStep = 0;
    renderWalkthroughStep();
    walkthroughModal?.classList.remove("hidden");
  }

  function maybeShowFirstTimeWalkthrough() {
    const userData = getUserData();
    const seen = localStorage.getItem(walkthroughKey) === "1";
    if (seen) return false;
    if (userData?.username) return false;
    if (raceLoginIntent) return false;
    openWalkthrough();
    return true;
  }

  function hideAppLoader() {
    if (!appLoader) return;
    clearLoaderFailsafe();
    // Small delay so the transition feels intentional and smooth.
    window.setTimeout(() => {
      appLoader.classList.add("is-hidden");
    }, 180);
  }

  function showAppLoader(text = "Loading WordShift…") {
    if (!appLoader) return;
    const loaderText = appLoader.querySelector(".loader-text");
    if (loaderText) loaderText.textContent = text;
    appLoader.classList.remove("is-hidden");
  }

  function triggerDayReset() {
    if (hasTriggeredDayReset) return;
    hasTriggeredDayReset = true;

    gameOver = true;
    isSubmitting = true;
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }

    showAppLoader("Loading next puzzle…");
    safeHardRefresh(220);
  }

  function msUntilNextWordChange() {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    return Math.max(0, nextMidnight.getTime() - now.getTime());
  }

  function scheduleDayRolloverReset() {
    if (dayRolloverTimeout) clearTimeout(dayRolloverTimeout);

    dayRolloverTimeout = window.setTimeout(() => {
      if (getCurrentSolutionIndex() !== solutionIndex) {
        triggerDayReset();
        return;
      }

      scheduleDayRolloverReset();
    }, msUntilNextWordChange() + 150);
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

    passafloraThemeBtn?.addEventListener("click", () => {
      setTheme("passaflora");
      localStorage.setItem(themeKey, "passaflora");
      accountMenuPanel?.classList.add("hidden");
      accountMenuButton?.setAttribute("aria-expanded", "false");
      showMessage("Passaflora theme on.");
    });

    giveUpBtn?.addEventListener("click", () => {
      if (gameOver) {
        showMessage("Game already over.");
        accountMenuPanel?.classList.add("hidden");
        accountMenuButton?.setAttribute("aria-expanded", "false");
        return;
      }

      if (!confirm("Give up? You will see the word, but the game won't count toward your score.")) {
        return;
      }

      // Show the word without counting it as a played game
      const wordToShow = currentWord?.toUpperCase() || "Unknown";
      gameOver = true;
      showMessage(`Word: ${wordToShow}`);
      showEndModal(false, "Gave up");
      
      // Close menu
      accountMenuPanel?.classList.add("hidden");
      accountMenuButton?.setAttribute("aria-expanded", "false");
    });
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    const isDark = theme === "dark";
    themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    themeIcon.innerHTML = isDark ? sunIcon() : moonIcon();
    const themeColor = isDark ? "#121213" : (theme === "passaflora" ? "#eaf9ef" : "#ffffff");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
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
    closeModal.addEventListener("click", hideEndModal);

    // Initialize global tooltip portal (so tooltips are not clipped by modal/tab overflow)
    initGlobalTooltips();

    leaderboardBtn.addEventListener("click", (e) => {
      e.preventDefault();
      document.body.classList.add("page-transition-out");
      window.setTimeout(() => {
        window.location.href = "leaderboard.html";
      }, 200);
    });

    accountMenuButton?.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = accountMenuPanel.classList.contains("hidden");
      accountMenuPanel.classList.toggle("hidden", !isHidden);
      accountMenuButton.setAttribute("aria-expanded", String(isHidden));
      refreshAccountMenuAction();
    });

    accountActionBtn?.addEventListener("click", () => {
      const userData = getUserData();
      accountMenuPanel.classList.add("hidden");
      accountMenuButton?.setAttribute("aria-expanded", "false");

      if (userData?.username) {
        logoutLeaderboardAccount();
      } else {
        openAuthModal("Sign in to sync your stats across devices.");
      }
    });

    document.addEventListener("click", (e) => {
      if (!accountMenuPanel || !accountMenuButton) return;
      const insideMenu = accountMenuPanel.contains(e.target);
      const insideBtn = accountMenuButton.contains(e.target);
      if (!insideMenu && !insideBtn) {
        accountMenuPanel.classList.add("hidden");
        accountMenuButton.setAttribute("aria-expanded", "false");
      }
    });

    if (raceLobbyBtn) {
      raceLobbyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const userData = getUserData();

        if (!userData?.username) {
          openAuthModal("Create or login to your account before entering Race Lobby.");
          return;
        }

        document.body.classList.add("page-transition-out");
        window.setTimeout(() => {
          window.location.href = raceLobbyBtn.getAttribute("href") || "race.html";
        }, 200);
      });
    }
    closeLeaderboardBtn.addEventListener("click", () => {
      leaderboardModal.classList.add("hidden");
      usernameError.classList.add("hidden");
      lbRulesPanel?.classList.add("hidden");
      lbRulesToggle?.setAttribute("aria-expanded", "false");
    });

    lbRulesToggle?.addEventListener("click", () => {
      if (!lbRulesPanel) return;
      const isHidden = lbRulesPanel.classList.contains("hidden");
      lbRulesPanel.classList.toggle("hidden", !isHidden);
      lbRulesToggle.setAttribute("aria-expanded", String(isHidden));
    });

    walkthroughSkipBtn?.addEventListener("click", () => {
      closeWalkthrough(true);
      openAuthModal("Create an account to join races and the leaderboard. You can close this anytime.");
    });
    walkthroughPrevBtn?.addEventListener("click", () => {
      walkthroughStep = Math.max(0, walkthroughStep - 1);
      renderWalkthroughStep();
    });
    walkthroughNextBtn?.addEventListener("click", () => {
      if (walkthroughStep >= walkthroughSteps.length - 1) {
        closeWalkthrough(true);
        return;
      }
      walkthroughStep += 1;
      renderWalkthroughStep();
    });
    walkthroughAccountBtn?.addEventListener("click", () => {
      closeWalkthrough(true);
  openAuthModal("Create an account for the full WordShift experience.");
    });
    walkthroughDemo?.addEventListener("click", async (e) => {
      const target = e.target.closest("#walkthrough-enable-notifications");
      if (!target) return;
      const permission = await requestNotificationPermissionFromUI();
      if (permission === "granted") {
        showMessage("Notifications enabled.");
      } else if (permission === "denied") {
        showMessage("Notifications blocked in browser settings.");
      }
      renderWalkthroughStep();
    });
    walkthroughModal?.addEventListener("click", (e) => {
      if (e.target === walkthroughModal) closeWalkthrough(true);
    });

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

   if (!raceLoginIntent && existingUser.saved_state && existingUser.saved_state.solutionIndex === solutionIndex) {
     localStorage.setItem(storageKey, JSON.stringify(existingUser.saved_state));
     showAppLoader("Syncing your account…");
     safeHardRefresh(220);
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

        if (raceLoginIntent) {
          document.body.classList.add("page-transition-out");
          const target = raceRoomIntent ? `race.html?room=${encodeURIComponent(raceRoomIntent)}` : "race.html";
          window.setTimeout(() => {
            window.location.href = target;
          }, 200);
          return;
        }

        leaderboardModal.classList.add("hidden");
        usernameView.classList.remove("hidden");
        statsView.classList.add("hidden");
        usernameError.classList.add("hidden");
        refreshAccountMenuAction();
        showMessage("Account ready.");
      } catch (error) {
        console.error("Save error:", error);
        usernameError.textContent = "Could not save. Try again.";
        usernameError.classList.remove("hidden");
      } finally {
        saveUsernameBtn.textContent = "Login / Register";
        saveUsernameBtn.disabled = false;
      }
    });

    refreshAccountMenuAction();
  }

  function initializeDailyNotifications() {
    if (!("Notification" in window)) return;

    // Behavior:
    // - default => ask on load
    // - granted => don't ask again, just schedule reminders
    // - denied => don't ask again
    if (Notification.permission === "granted") {
      scheduleDailyReminders();
      return;
    }
  }

  async function requestNotificationPermissionFromUI() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") {
      scheduleDailyReminders();
      return "granted";
    }
    if (Notification.permission === "denied") return "denied";
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") scheduleDailyReminders();
      return permission;
    } catch {
      return "default";
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

  function reminderSentKeyFor(slot) {
    return `${reminderSentPrefix}-${slot}`;
  }

  function maybeSendDailyReminder(slot) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (isTodaysWordDone()) return;

    const dayStamp = currentDayStamp();
    const reminderKey = reminderSentKeyFor(slot);
    if (localStorage.getItem(reminderKey) === dayStamp) return;

  const title = "Time for WordShift";
    const body = slot === "noon"
  ? "It’s noon — your daily WordShift is waiting."
  : "4 PM check-in: still time to finish today’s WordShift.";

    new Notification(title, {
      body,
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%236aaa64'/><text x='50%' y='50%' dominant-baseline='central' text-anchor='middle' font-size='60' fill='white' font-family='sans-serif' font-weight='bold'>W</text></svg>"
    });

    localStorage.setItem(reminderKey, dayStamp);
  }

  function msUntilNextHour(targetHour) {
    const now = new Date();
    const next = new Date(now);
    next.setHours(targetHour, 0, 0, 0);
    if (now >= next) next.setDate(next.getDate() + 1);
    return Math.max(0, next.getTime() - now.getTime());
  }

  function scheduleDailyReminders() {
    if (noonReminderTimeout) clearTimeout(noonReminderTimeout);
    if (noonReminderInterval) clearInterval(noonReminderInterval);
    if (afternoonReminderTimeout) clearTimeout(afternoonReminderTimeout);
    if (afternoonReminderInterval) clearInterval(afternoonReminderInterval);

    const now = new Date();
    if (now.getHours() >= 12) maybeSendDailyReminder("noon");
    if (now.getHours() >= 16) maybeSendDailyReminder("afternoon");

    noonReminderTimeout = window.setTimeout(() => {
      maybeSendDailyReminder("noon");
      noonReminderInterval = window.setInterval(() => maybeSendDailyReminder("noon"), 24 * 60 * 60 * 1000);
    }, msUntilNextHour(12));

    afternoonReminderTimeout = window.setTimeout(() => {
      maybeSendDailyReminder("afternoon");
      afternoonReminderInterval = window.setInterval(() => maybeSendDailyReminder("afternoon"), 24 * 60 * 60 * 1000);
    }, msUntilNextHour(16));
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

  function openAuthModal(promptText = "") {
    leaderboardModal.classList.remove("hidden");
    usernameView.classList.remove("hidden");
    statsView.classList.add("hidden");
    if (promptText) {
      usernameError.textContent = promptText;
      usernameError.classList.remove("hidden");
    } else {
      usernameError.classList.add("hidden");
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
    refreshAccountMenuAction();

    showAppLoader("Refreshing...");
    safeHardRefresh(220);
  }

  function refreshAccountMenuAction() {
    if (!accountActionBtn) return;
    const userData = getUserData();
    accountActionBtn.textContent = userData?.username ? "Log out" : "Sign in / Sign up";
  }

  function getGamesPlayedBonus(gamesPlayedValue) {
    const gamesPlayed = Number(gamesPlayedValue) || 0;
    const tier = LEADERBOARD_CONSISTENCY_BONUS_TIERS.find((t) => gamesPlayed >= t.games);
    return Math.min(LEADERBOARD_CONSISTENCY_BONUS_CAP, tier ? tier.bonus : 0);
  }

  function applyConsistencyBonus(baseAvg, gamesPlayedValue) {
    const avg = Number(baseAvg);
    if (!Number.isFinite(avg) || avg <= 0) return { score: avg, bonusApplied: 0 };

    const bonus = getGamesPlayedBonus(gamesPlayedValue);
    if (bonus <= 0) return { score: avg, bonusApplied: 0 };

    if (LEADERBOARD_CONSISTENCY_BONUS_MODE === "percent") {
      return {
        score: Math.max(0, avg * (1 - bonus)),
        bonusApplied: bonus
      };
    }

    return {
      score: Math.max(0, avg - bonus),
      bonusApplied: bonus
    };
  }

  function formatConsistencyBonus(bonusValue) {
    const bonus = Number(bonusValue) || 0;
    if (LEADERBOARD_CONSISTENCY_BONUS_MODE === "percent") {
      return `${Math.round(bonus * 100)}%`;
    }
    return `-${bonus.toFixed(2)}`;
  }

  async function loadLeaderboardData(type) {
    const requestedType = type === "avg" ? "avg" : "avg";
    lbLoading.classList.remove("hidden");
    lbLoading.textContent = "Loading...";
    lbList.classList.add("hidden");
    lbList.innerHTML = "";

    try {
      let data = [];
      if (requestedType === "avg") {
        const { data: res, error } = await supabase.from('leaderboards')
          .select('username, games_played, total_guesses, total_hints, last_hint_day_index')
          .order('games_played', { ascending: false });
        if (error) throw error;
        if (res && res.length > 0) {
          const currentUser = getUserData().username;
          const ranked = res
            .map((p) => {
              const gamesPlayed = Number(p.games_played) || 0;

              if (gamesPlayed <= 0) {
                return {
                  ...p,
                  gamesPlayed,
                  isUnrated: true,
                  avgRaw: Number.POSITIVE_INFINITY,
                  avg: "—",
                  rankScoreRaw: Number.POSITIVE_INFINITY,
                  rankScore: "???",
                  consistencyBonus: 0
                };
              }

              const unscaledAvg = Number(p.total_guesses) / gamesPlayed;
              const rawAvg = (Number(p.total_guesses) / GUESS_SCALE) / gamesPlayed;
              if (!Number.isFinite(rawAvg)) return null;

              const shouldBeUnrated = gamesPlayed === 1 && rawAvg <= LEADERBOARD_LOW_AVG_THRESHOLD;
              if (shouldBeUnrated) {
                return {
                  ...p,
                  gamesPlayed,
                  isUnrated: true,
                  avgRaw: rawAvg,
                  avg: rawAvg.toFixed(2),
                  rankScoreRaw: Number.POSITIVE_INFINITY,
                  rankScore: "???",
                  consistencyBonus: 0
                };
              }

              const gameBonus = applyConsistencyBonus(rawAvg, gamesPlayed);
              return {
                ...p,
                gamesPlayed,
                isUnrated: false,
                avgRaw: rawAvg,
                avg: rawAvg.toFixed(2),
                rankScoreRaw: gameBonus.score,
                rankScore: gameBonus.score.toFixed(2),
                consistencyBonus: gameBonus.bonusApplied
              };
            })
            .filter(Boolean)
            .sort((a, b) => {
              if (a.isUnrated !== b.isUnrated) return a.isUnrated ? 1 : -1;
              if (a.rankScoreRaw !== b.rankScoreRaw) return a.rankScoreRaw - b.rankScoreRaw;
              if (a.avgRaw !== b.avgRaw) return a.avgRaw - b.avgRaw;
              return (b.gamesPlayed || 0) - (a.gamesPlayed || 0);
            })
            .map((p, i) => ({ ...p, leaderboardRank: i + 1 }));

          data = ranked.slice(0, 50);

          if (currentUser && !data.some((p) => p.username === currentUser)) {
            const currentPlayer = ranked.find((p) => p.username === currentUser);
            if (currentPlayer) data.push(currentPlayer);
          }
        }
      }

      lbLoading.classList.add("hidden");
      lbList.classList.remove("hidden");

      if (data.length === 0) {
        lbList.innerHTML = `<li class="lb-item" style="justify-content:center; color: var(--muted); font-size:0.9rem;">No data found.</li>`;
        return;
      }

  const currentUser = getUserData().username;
      
      const medal1 = `<svg class="lb-medal" viewBox="0 0 24 24" fill="none" stroke="#b8860b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>`;
      const medal2 = `<svg class="lb-medal" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>`;
      const medal3 = `<svg class="lb-medal" viewBox="0 0 24 24" fill="none" stroke="#8b4513" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>`;

      data.forEach((player, index) => {
        const li = document.createElement("li");
        li.className = "lb-item";
    const rankNumber = player.leaderboardRank ?? (index + 1);
    if (rankNumber === 1) li.classList.add("rank-1");
    else if (rankNumber === 2) li.classList.add("rank-2");
    else if (rankNumber === 3) li.classList.add("rank-3");
    if (player.isUnrated) li.classList.add("unrated-entry");

    let medal = rankNumber === 1 ? medal1 : rankNumber === 2 ? medal2 : rankNumber === 3 ? medal3 : "";
  const scoreVal = player.isUnrated ? "???" : (player.rankScore ?? player.avg);
        
        let hintBadge = "";
        if (player.last_hint_day_index === solutionIndex) {
          hintBadge = `
            <span class="has-tooltip" data-tooltip="This user used hints to guess their word">
              <svg class="lb-hint-icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A6 6 0 1 0 7.5 11.5c.76.76 1.23 1.52 1.41 2.5"></path></svg>
            </span>
          `;
        }

        let displayName = player.username + hintBadge;
        if (player.username === currentUser) displayName += " <i style='opacity: 0.6; font-weight: normal; font-size: 0.85em;'>(Me)</i>";

        const gamesPlayed = Number(player.gamesPlayed ?? player.games_played) || 0;
        const bonusText = player.isUnrated
          ? `<div class="lb-meta">Unrated for now • complete one more day to unlock your score</div>`
          : Number(player.consistencyBonus) > 0
            ? `<div class="lb-meta">Avg ${player.avg} guesses • milestone bonus active (${gamesPlayed} games played)</div>`
            : `<div class="lb-meta">Avg ${player.avg} guesses</div>`;

        li.innerHTML = `
          <div class="lb-left">
            <span class="rank">#${rankNumber}</span>
            ${medal}
            <div class="lb-name">
              <div class="lb-name-main">${displayName}</div>
              ${bonusText}
            </div>
          </div>
          <div class="lb-score ${player.isUnrated ? "unrated" : ""}">${scoreVal}</div>
        `;
        lbList.appendChild(li);
      });
    } catch (e) {
      console.error("Leaderboard Error", e);
      lbLoading.classList.add("hidden");
      lbList.classList.remove("hidden");
      lbList.innerHTML = `<li class="lb-item" style="justify-content:center; color: var(--muted); font-size:0.9rem;">Failed to load.</li>`;
    }
  }

  async function updateUserStats(won, rawGuesses, hints) {
    if (hasSubmittedToLeaderboard) return;
    const userData = getUserData();
    if (!userData.username) {
      console.log("No username in userData");
      return;
    }

    const scaledGuesses = rawGuesses * GUESS_SCALE;
    try {
      const { data: userRecord, error: fetchError } = await supabase.from('leaderboards').select('*').eq('uuid', userData.uuid).maybeSingle();
      if (fetchError) {
        console.error("Error fetching user record:", fetchError);
        return;
      }
      if (!userRecord) {
        console.error("No user record found for uuid:", userData.uuid);
        return;
      }

      const previousGamesPlayed = Number(userRecord.games_played) || 0;
      const newGamesPlayed = previousGamesPlayed + 1;
      const previousBonus = getGamesPlayedBonus(previousGamesPlayed);
      const currentBonus = getGamesPlayedBonus(newGamesPlayed);

      const updates = {
        games_played: newGamesPlayed,
        total_guesses: userRecord.total_guesses + scaledGuesses,
        winstreak: userRecord.winstreak ?? 0,
        max_winstreak: userRecord.max_winstreak ?? 0,
        total_hints: (userRecord.total_hints || 0) + hints,
        last_hint_day_index: hints > 0 ? solutionIndex : userRecord.last_hint_day_index ?? null
      };
      const { error: updateError } = await supabase.from('leaderboards').update(updates).eq('uuid', userData.uuid);
      if (updateError) {
        console.error("Error updating stats in DB:", updateError);
        return;
      }

      console.log("✅ Stats updated successfully - Games: " + newGamesPlayed + ", Total guesses: " + updates.total_guesses);
      console.log("Previous bonus: " + previousBonus.toFixed(2) + ", Current bonus: " + currentBonus.toFixed(2));

      if (currentBonus > previousBonus) {
        const bonusReduction = (currentBonus - previousBonus).toFixed(2);
        const rewardText = `🎉 Milestone! ${newGamesPlayed} games played. Your score now benefits from a -${bonusReduction} bonus.`;
        console.log("Showing milestone message: " + rewardText);
        window.setTimeout(() => showMessage(rewardText), 900);
      } else {
        console.log("No new bonus tier reached");
      }

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
  showEndModal(true, true);
      } else {
        currentRow += 1;
        currentGuess = "";
        if (currentRow >= maxRows) {
          gameOver = true;
          updateUserStats(false, maxRows, hintsUsed);
          saveState(false);
          showMessage(`The word was ${solution}.`);
          showEndModal(false, true);
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

  function showEndModal(won, force = false) {
    if (!force && localStorage.getItem(endModalSeenKey) === "1") return;
    if (won) {
      endTitle.innerHTML = `You got it, the word was <span class="modal-word-highlight">${solution}</span>`;
    } else {
      endTitle.innerHTML = `The word was <span class="modal-word-highlight">${solution}</span>`;
    }
    localStorage.setItem(endModalSeenKey, "1");
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
      if (diff <= 0 || getCurrentSolutionIndex() !== solutionIndex) {
        countdownEl.textContent = "00:00:00";
        triggerDayReset();
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
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && getCurrentSolutionIndex() !== solutionIndex) {
      triggerDayReset();
    }
  });

})();