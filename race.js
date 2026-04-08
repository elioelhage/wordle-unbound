(() => {
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
  const statusEl = document.getElementById("race-status");

  const roomKey = "wordle-race-room";

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
      setStatus("Room created. Waiting for your opponent to join.");
    } else {
      roomRoleEl.textContent = "You are Challenger";
      roomHintEl.textContent = "You joined this 1v1 room. Multiplayer sync comes next.";
      setStatus("Joined room. Share this page if needed and get ready.");
    }

    localStorage.setItem(roomKey, JSON.stringify({ code: cleanCode, role, updatedAt: Date.now() }));
    const url = new URL(window.location.href);
    url.searchParams.set("room", cleanCode);
    window.history.replaceState({}, "", url);
  }

  function createRoom() {
    setRoom(randomRoomCode(), "host");
  }

  function joinRoom() {
    const cleanCode = sanitizeRoomCode(roomInput.value);
    roomInput.value = cleanCode;
    if (cleanCode.length !== 6) {
      setStatus("Room code must be 6 letters/numbers.");
      return;
    }
    setRoom(cleanCode, "guest");
  }

  function restoreLastRoom() {
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

  restoreLastRoom();
})();
