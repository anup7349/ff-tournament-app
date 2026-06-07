const storageKey = "free-fire-tournament-hub";
const organizerPin = "7340";
const coinRewardPerAd = 1;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const cloudConfig = window.BATTLEHUB_SUPABASE || {};
const cloud = window.supabase && cloudConfig.url && cloudConfig.anonKey
  ? window.supabase.createClient(cloudConfig.url, cloudConfig.anonKey)
  : null;

let organizerMode = sessionStorage.getItem("free-fire-organizer-mode") === "true";
let cloudReady = Boolean(cloud);
let state = loadState();
let adWatchInProgress = false;

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function blankTournamentDetails() {
  return {
    title: "",
    date: new Date().toISOString().slice(0, 10),
    time: "19:30",
    map: "Bermuda",
    mode: "Solo Battle Royale",
    entry: "5 coins",
    prize: "Rs 1000",
    rules: "No hacks, no teaming, be in room 10 minutes early, screenshots required for score disputes."
  };
}

function makeTournament(details = {}, squads = [], rooms = []) {
  return { id: uid(), tournament: { ...blankTournamentDetails(), ...details }, squads, rooms };
}

function createDefaults() {
  const first = makeTournament(
    { title: "Weekend Clash", date: "2026-06-01", prize: "Rs 1000" },
    [
      { id: uid(), name: "Phoenix", captain: "Aman", uid: "123456789", contact: "98765 43210", players: "Solo player", kills: 18, placement: 24, status: "Checked in", entryPaid: 0 },
      { id: uid(), name: "Shadow", captain: "Neha", uid: "987654321", contact: "99887 77665", players: "Solo player", kills: 21, placement: 18, status: "Confirmed", entryPaid: 0 }
    ],
    [{ id: uid(), name: "Room A", round: "Qualifiers", roomId: "447812", password: "FF2026", start: "19:30", map: "Bermuda" }]
  );
  return { activeTournamentId: first.id, currentUserId: null, users: [], transactions: [], walletRequests: [], withdrawRequests: [], payoutDetails: [], tournaments: [first] };
}

function migrateState(saved) {
  if (Array.isArray(saved?.tournaments)) {
    saved.users = Array.isArray(saved.users) ? saved.users : [];
    saved.currentUserId = saved.currentUserId || null;
    saved.transactions = Array.isArray(saved.transactions) ? saved.transactions : [];
    saved.walletRequests = Array.isArray(saved.walletRequests) ? saved.walletRequests : [];
    saved.withdrawRequests = Array.isArray(saved.withdrawRequests) ? saved.withdrawRequests : [];
    saved.payoutDetails = Array.isArray(saved.payoutDetails) ? saved.payoutDetails : [];
    return saved;
  }
  return createDefaults();
}

function loadState() {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? migrateState(JSON.parse(saved)) : createDefaults();
  } catch {
    return createDefaults();
  }
}

function saveState() {
  if (!cloudReady) localStorage.setItem(storageKey, JSON.stringify(state));
}

function currentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || null;
}

function activeTournament() {
  return state.tournaments.find((item) => item.id === state.activeTournamentId) || state.tournaments[0];
}

function scoreSquad(squad) {
  return Number(squad.kills || 0) + Number(squad.placement || 0);
}

function sortedSquads() {
  return [...(activeTournament()?.squads || [])].sort((a, b) => scoreSquad(b) - scoreSquad(a));
}

function hasJoinedTournament(tournament = activeTournament(), user = currentUser()) {
  return Boolean(user && tournament?.squads?.some((squad) => squad.userId === user.id));
}

function parseEntryFee(value) {
  if (!value || String(value).toLowerCase().includes("free")) return 0;
  const amount = String(value).match(/\d+(\.\d+)?/);
  return amount ? Number(amount[0]) : 0;
}

function formatMoney(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatCoins(value) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })} ${amount === 1 ? "coin" : "coins"}`;
}

function formatDate(value) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function requireLogin() {
  if (currentUser()) return true;
  showToast("Login required.");
  openAuthModal("login");
  return false;
}

function requireOrganizer() {
  if (organizerMode) return true;
  showToast("Organizer PIN required.");
  $("#organizerModal").showModal();
  return false;
}

function dbProfile(row) {
  return {
    id: row.id,
    name: row.name,
    mobile: row.mobile,
    freeFireUid: row.free_fire_uid || "",
    walletBalance: Number(row.wallet_balance || 0),
    winningBalance: Number(row.winning_balance || 0),
    isAdmin: Boolean(row.is_admin)
  };
}

function dbTournament(row, squads, rooms) {
  return {
    id: row.id,
    tournament: {
      title: row.title,
      date: row.match_date,
      time: row.match_time,
      map: row.map,
      mode: row.mode,
      entry: row.entry,
      prize: row.prize,
      rules: row.rules
    },
    squads: squads.filter((item) => item.tournament_id === row.id).map(dbSquad),
    rooms: rooms.filter((item) => item.tournament_id === row.id).map(dbRoom)
  };
}

function dbSquad(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    captain: row.captain,
    uid: row.free_fire_uid,
    contact: row.contact,
    players: row.players,
    kills: Number(row.kills || 0),
    placement: Number(row.placement || 0),
    status: row.status,
    entryPaid: Number(row.entry_paid || 0)
  };
}

function dbRoom(row) {
  return {
    id: row.id,
    name: row.name,
    round: row.round,
    roomId: row.room_id,
    password: row.password,
    start: row.start,
    map: row.map
  };
}

function dbPayout(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    mobile: row.mobile,
    upi: row.upi,
    accountName: row.account_name,
    bankName: row.bank_name,
    accountNumber: row.account_number,
    ifsc: row.ifsc,
    updatedAt: row.updated_at
  };
}

function dbWithdraw(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    mobile: row.mobile,
    upi: row.upi,
    amount: Number(row.amount || 0),
    status: row.status,
    date: row.created_at
  };
}

async function cloudCall(label, action) {
  try {
    const result = await action();
    if (result?.error) throw result.error;
    return result;
  } catch (error) {
    console.error(label, error);
    showToast(`${label} failed.`);
    throw error;
  }
}

async function refreshCloudState() {
  if (!cloud) return false;
  const sessionResult = await cloud.auth.getSession();
  const authUser = sessionResult.data.session?.user || null;
  let users = [];
  let currentProfile = null;

  if (authUser) {
    const own = await cloud.from("profiles").select("*").eq("id", authUser.id).maybeSingle();
    if (own.error) throw own.error;
    if (own.data) {
      currentProfile = dbProfile(own.data);
      users = [currentProfile];
      organizerMode = currentProfile.isAdmin || organizerMode;
      if (currentProfile.isAdmin) {
        const allUsers = await cloud.from("profiles").select("*");
        if (!allUsers.error) users = allUsers.data.map(dbProfile);
      }
    }
  }

  const [tournamentsResult, squadsResult, roomsResult, walletResult, payoutResult, withdrawResult] = await Promise.all([
    cloud.from("tournaments").select("*").order("created_at", { ascending: false }),
    cloud.from("squads").select("*"),
    cloud.from("rooms").select("*"),
    authUser ? cloud.from("wallet_requests").select("*").order("created_at", { ascending: false }) : { data: [], error: null },
    authUser ? cloud.from("payout_details").select("*").order("updated_at", { ascending: false }) : { data: [], error: null },
    authUser ? cloud.from("withdraw_requests").select("*").order("created_at", { ascending: false }) : { data: [], error: null }
  ]);

  if (tournamentsResult.error) throw tournamentsResult.error;
  if (squadsResult.error) throw squadsResult.error;
  if (roomsResult.error) throw roomsResult.error;
  if (walletResult.error) throw walletResult.error;
  if (payoutResult.error) throw payoutResult.error;
  if (withdrawResult.error) throw withdrawResult.error;

  const tournaments = tournamentsResult.data.map((row) => dbTournament(row, squadsResult.data || [], roomsResult.data || []));
  state = {
    activeTournamentId: state.activeTournamentId,
    currentUserId: authUser?.id || null,
    users,
    transactions: [],
    walletRequests: (walletResult.data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      contact: row.contact,
      amount: Number(row.amount || 0),
      utr: row.utr,
      status: row.status,
      date: row.created_at
    })),
    withdrawRequests: (withdrawResult.data || []).map(dbWithdraw),
    payoutDetails: (payoutResult.data || []).map(dbPayout),
    tournaments: tournaments.length ? tournaments : []
  };

  if (!state.tournaments.some((item) => item.id === state.activeTournamentId)) {
    state.activeTournamentId = state.tournaments[0]?.id || null;
  }
  return true;
}

async function syncAndRender() {
  if (cloudReady) {
    try {
      await refreshCloudState();
    } catch {
      cloudReady = false;
      state = loadState();
      showToast("Using local mode.");
    }
  }
  render();
}

function activateView(view) {
  const target = view || "dashboard";
  $$("[data-view]").forEach((section) => section.classList.toggle("is-active", section.dataset.view === target));
  $$("[data-view-link]").forEach((link) => link.classList.toggle("is-active", link.dataset.viewLink === target));
}

function render() {
  renderOrganizerMode();
  renderAuth();
  renderCoins();
  renderWallet();
  renderPayouts();
  renderTournamentSwitcher();
  renderTournament();
  renderTournamentCards();
  renderSquads();
  renderRooms();
  renderLeaderboard();
  saveState();
}

function renderOrganizerMode() {
  document.body.classList.toggle("organizer-mode", organizerMode);
  $("#modeLabel").textContent = organizerMode ? "Organizer panel" : cloudReady ? "Cloud player view" : "Player view";
  $("#organizerToggle").textContent = organizerMode ? "Lock Organizer" : "Organizer";
}

function renderAuth() {
  const user = currentUser();
  $("#authButton").textContent = user ? user.name : "Login";
  $("#authButton").title = user ? "Logout" : "Login or register";
}

function renderCoins() {
  const user = currentUser();
  const balance = user?.walletBalance || 0;
  $("#coinButton").textContent = user ? `Coins: ${balance}` : "Coins";
  $("#coinBalance").textContent = user ? formatCoins(balance) : "Login to earn coins";
  $("#watchRewardedAd").disabled = adWatchInProgress;
  $("#coinStatus").textContent = adWatchInProgress
    ? "Ad is opening. Complete it to receive 1 coin."
    : "Complete the rewarded ad to receive 1 app coin. If the next ad is not ready, wait a few seconds.";
}

function renderWallet() {
  const user = currentUser();
  $("#winningBalance").textContent = user ? formatMoney(user.winningBalance || 0) : "Login to view";
  const visibleRequests = organizerMode
    ? state.withdrawRequests
    : state.withdrawRequests.filter((item) => item.userId === user?.id);
  $("#withdrawalList").innerHTML = visibleRequests.map((item) => `
    <div class="payout-card">
      <strong>${escapeHtml(item.name || "Player")} - ${formatMoney(item.amount)}</strong>
      <span>UPI: ${escapeHtml(item.upi || "-")}</span>
      <span>Mobile: ${escapeHtml(item.mobile || "-")}</span>
      <span>Status: ${escapeHtml(item.status || "Pending")}</span>
      <div class="row-actions organizer-only">
        <button class="small-button" type="button" data-approve-withdraw="${item.id}">Paid</button>
        <button class="secondary-button" type="button" data-reject-withdraw="${item.id}">Reject</button>
      </div>
    </div>
  `).join("") || `<div class="empty">${user ? "No withdraw requests yet." : "Login to request withdrawal."}</div>`;

  $("#winnerBalanceList").innerHTML = state.users.map((item) => `
    <form class="payout-card winner-balance-form" data-user-wallet="${item.id}">
      <strong>${escapeHtml(item.name || "Player")}</strong>
      <span>${escapeHtml(item.mobile || "")}</span>
      <label>Winning amount <input name="winningBalance" type="number" min="0" value="${Number(item.winningBalance || 0)}" /></label>
      <button class="small-button" type="submit">Save Winning Amount</button>
    </form>
  `).join("") || `<div class="empty">No users yet.</div>`;
}

function renderPayouts() {
  const user = currentUser();
  const form = $("#payoutForm");
  const own = state.payoutDetails.find((item) => item.userId === user?.id);
  if (form) {
    form.elements.upi.value = own?.upi || "";
    form.elements.accountName.value = own?.accountName || "";
    form.elements.bankName.value = own?.bankName || "";
    form.elements.accountNumber.value = own?.accountNumber || "";
    form.elements.ifsc.value = own?.ifsc || "";
  }
  const rows = organizerMode ? state.payoutDetails : own ? [own] : [];
  $("#payoutList").innerHTML = rows.map((item) => `
    <div class="payout-card">
      <strong>${escapeHtml(item.name || "Player")}</strong>
      <span>${escapeHtml(item.mobile || "")}</span>
      <span>UPI: ${escapeHtml(item.upi || "-")}</span>
      <span>Bank: ${escapeHtml(item.bankName || "-")}</span>
      <span>Account: ${escapeHtml(item.accountName || "-")} / ${escapeHtml(item.accountNumber || "-")}</span>
      <span>IFSC: ${escapeHtml(item.ifsc || "-")}</span>
    </div>
  `).join("") || `<div class="empty">${user ? "No payout details saved yet." : "Login to save payout details."}</div>`;
}

function renderTournamentSwitcher() {
  $("#tournamentSelect").innerHTML = state.tournaments.map((item) => `<option value="${item.id}">${escapeHtml(item.tournament.title || "Untitled tournament")}</option>`).join("");
  if (activeTournament()) $("#tournamentSelect").value = activeTournament().id;
}

function renderTournament() {
  const current = activeTournament();
  if (!current) {
    $("#tournamentTitle").textContent = "No tournament yet";
    $("#statSquads").textContent = "0";
    $("#statRooms").textContent = "0";
    $("#statPrize").textContent = "Rs 0";
    $("#statEntry").textContent = "Free";
    $("#tournamentInfo").innerHTML = `<div class="empty">Organizer must create the first tournament.</div>`;
    $("#topSquads").innerHTML = `<div class="empty">No players registered yet.</div>`;
    return;
  }
  const t = current.tournament;
  const fee = parseEntryFee(t.entry);
  $("#tournamentTitle").textContent = t.title || "Untitled tournament";
  $("#statSquads").textContent = current.squads.length;
  $("#statRooms").textContent = current.rooms.length;
  $("#statPrize").textContent = t.prize || "Rs 0";
  $("#statEntry").textContent = fee ? formatCoins(fee) : "Free";
  $("#tournamentInfo").innerHTML = [["Date", formatDate(t.date)], ["Time", t.time], ["Map", t.map], ["Mode", t.mode], ["Rules", t.rules]].map(([label, value]) => `<div class="info-item"><span>${label}</span><strong>${escapeHtml(value || "Not set")}</strong></div>`).join("");
  $("#topSquads").innerHTML = sortedSquads().slice(0, 4).map((squad, index) => `<div class="compact-item"><span class="rank">${index + 1}</span><div><strong>${escapeHtml(squad.name)}</strong><div class="compact-meta">${escapeHtml(squad.status)} - ${Number(squad.kills || 0)} kills</div></div><strong>${scoreSquad(squad)}</strong></div>`).join("") || `<div class="empty">No players registered yet.</div>`;
}

function renderTournamentCards() {
  $("#tournamentCards").innerHTML = state.tournaments.map((item) => {
    const t = item.tournament;
    const joined = hasJoinedTournament(item);
    return `<article class="tournament-card${item.id === state.activeTournamentId ? " is-selected" : ""}">
      <div><p class="eyebrow">${escapeHtml(t.mode)}</p><h3>${escapeHtml(t.title || "Untitled tournament")}</h3><p>${formatDate(t.date)} at ${escapeHtml(t.time)} - ${escapeHtml(t.map)}</p></div>
      <div class="tournament-card-stats"><span>${item.squads.length} players</span><span>${item.rooms.length} rooms</span><span>${escapeHtml(t.prize || "Rs 0")}</span></div>
      <div class="row-actions"><button class="secondary-button" type="button" data-select-tournament="${item.id}">Open</button><button class="secondary-button" type="button" data-join-tournament="${item.id}">${joined ? "Room" : "Join"}</button><button class="icon-button organizer-only" type="button" title="Edit tournament" data-edit-tournament="${item.id}"><svg><use href="#icon-edit"></use></svg></button><button class="icon-button organizer-only" type="button" title="Delete tournament" data-delete-tournament="${item.id}"><svg><use href="#icon-trash"></use></svg></button></div>
    </article>`;
  }).join("") || `<div class="empty">No tournaments yet.</div>`;
}

function renderSquads() {
  const rows = activeTournament()?.squads || [];
  $("#squadRows").innerHTML = rows.map((squad) => `<tr><td><strong>${escapeHtml(squad.name)}</strong></td><td>${escapeHtml(squad.captain)}</td><td>${escapeHtml(squad.uid || "-")}</td><td>${escapeHtml(squad.contact)}</td><td>Solo player</td><td>${formatCoins(squad.entryPaid || 0)}</td><td><span class="status ${String(squad.status).toLowerCase().replace(/\s+/g, "-")}">${escapeHtml(squad.status)}</span></td><td><div class="row-actions"><button class="icon-button organizer-only" type="button" title="Edit player" data-edit-squad="${squad.id}"><svg><use href="#icon-edit"></use></svg></button><button class="icon-button organizer-only" type="button" title="Delete player" data-delete-squad="${squad.id}"><svg><use href="#icon-trash"></use></svg></button></div></td></tr>`).join("") || `<tr><td colspan="8">No players registered yet.</td></tr>`;
}

function renderRooms() {
  const tournament = activeTournament();
  const canViewRooms = organizerMode || hasJoinedTournament(tournament);
  const rows = canViewRooms ? tournament?.rooms || [] : [];
  if (!canViewRooms) {
    $("#roomCards").innerHTML = `<div class="empty">Join this tournament to see the custom room ID and password.</div>`;
    return;
  }
  $("#roomCards").innerHTML = rows.map((room) => `<article class="room-card"><h3>${escapeHtml(room.name)}</h3><p>${escapeHtml(room.round)}</p><div class="room-fields"><div class="room-field"><span>Room ID</span><strong>${escapeHtml(room.roomId)}</strong></div><div class="room-field"><span>Password</span><strong>${escapeHtml(room.password)}</strong></div><div class="room-field"><span>Start</span><strong>${escapeHtml(room.start)}</strong></div><div class="room-field"><span>Map</span><strong>${escapeHtml(room.map)}</strong></div></div><div class="row-actions"><button class="icon-button" type="button" title="Copy room details" data-copy-room="${room.id}"><svg><use href="#icon-copy"></use></svg></button><button class="icon-button organizer-only" type="button" title="Edit room" data-edit-room="${room.id}"><svg><use href="#icon-edit"></use></svg></button><button class="icon-button organizer-only" type="button" title="Delete room" data-delete-room="${room.id}"><svg><use href="#icon-trash"></use></svg></button></div></article>`).join("") || `<div class="empty">No rooms added yet.</div>`;
}

function renderLeaderboard() {
  $("#leaderboardRows").innerHTML = sortedSquads().map((squad, index) => `<article class="leader-row"><span class="rank">${index + 1}</span><div><strong>${escapeHtml(squad.name)}</strong><div class="compact-meta">${escapeHtml(squad.captain)} player</div></div><span>Kills ${Number(squad.kills || 0)}</span><span>Place ${Number(squad.placement || 0)}</span><span class="score-pill">${scoreSquad(squad)} pts</span></article>`).join("") || `<div class="empty">No scores available yet.</div>`;
}

function openAuthModal(mode = "login") {
  const form = $("#authForm");
  form.reset();
  form.elements.mode.value = mode;
  $("#authTitle").textContent = mode === "login" ? "Login" : "Create Account";
  $("#authSubmit").textContent = mode === "login" ? "Login" : "Register";
  $("#authModeToggle").textContent = mode === "login" ? "Create new account" : "Already have account";
  form.classList.toggle("is-register", mode === "register");
  form.elements.name.required = mode === "register";
  form.elements.mobile.required = mode === "register";
  $("#authModal").showModal();
}

function openTournamentModal(id) {
  if (!requireOrganizer()) return;
  const form = $("#tournamentForm");
  const item = id ? state.tournaments.find((entry) => entry.id === id) : null;
  form.reset();
  Object.entries(item?.tournament || blankTournamentDetails()).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; });
  const room = item?.rooms?.[0];
  if (form.elements.primaryRoomId) form.elements.primaryRoomId.value = room?.roomId || "";
  if (form.elements.primaryRoomPassword) form.elements.primaryRoomPassword.value = room?.password || "";
  if (form.elements.primaryRoomStart) form.elements.primaryRoomStart.value = room?.start || item?.tournament?.time || "";
  form.elements.id.value = item?.id || "";
  $("#tournamentModalTitle").textContent = item ? "Edit Tournament" : "Create Tournament";
  $("#tournamentForm .primary-button").textContent = item ? "Save Tournament" : "Create Tournament";
  $("#tournamentModal").showModal();
}

function openJoinModal(tournamentId) {
  if (!requireLogin()) return;
  if (tournamentId) state.activeTournamentId = tournamentId;
  if (hasJoinedTournament()) {
    openPlayerRoomModal();
    return;
  }
  const user = currentUser();
  const t = activeTournament()?.tournament;
  if (!t) return showToast("No tournament selected.");
  const fee = parseEntryFee(t.entry);
  const form = $("#joinForm");
  form.reset();
  form.elements.captain.value = user.name;
  form.elements.contact.value = user.mobile;
  form.elements.uid.value = user.freeFireUid || "";
  $("#joinSummary").innerHTML = `<strong>${escapeHtml(t.title || "Untitled tournament")}</strong><span>${formatDate(t.date)} at ${escapeHtml(t.time)} - ${escapeHtml(t.mode)} - Entry ${fee ? formatCoins(fee) : "Free"}</span>`;
  $("#joinWalletCheck").innerHTML = `<span>Coin balance</span><strong>${formatCoins(user.walletBalance)}</strong><span>${fee ? (user.walletBalance >= fee ? "Enough coins to join." : `Need ${formatCoins(fee - user.walletBalance)} more to join.`) : "No coins needed for this tournament."}</span>`;
  $("#joinModal").showModal();
}

function roomDetailText(tournament = activeTournament()) {
  return (tournament?.rooms || []).map((room) => `${room.name} - ${room.round}
Room ID: ${room.roomId}
Password: ${room.password}
Start: ${room.start}
Map: ${room.map}`).join("\n\n");
}

function openPlayerRoomModal() {
  const tournament = activeTournament();
  if (!hasJoinedTournament(tournament)) {
    showToast("Join tournament first.");
    return;
  }
  const rooms = tournament?.rooms || [];
  $("#playerRoomSummary").innerHTML = `<strong>${escapeHtml(tournament?.tournament?.title || "Tournament")}</strong><span>Use these Free Fire custom room details for your joined contest.</span>`;
  $("#playerRoomDetails").innerHTML = rooms.map((room) => `
    <article class="room-card">
      <h3>${escapeHtml(room.name)}</h3>
      <p>${escapeHtml(room.round)}</p>
      <div class="room-fields">
        <div class="room-field"><span>Room ID</span><strong>${escapeHtml(room.roomId)}</strong></div>
        <div class="room-field"><span>Password</span><strong>${escapeHtml(room.password)}</strong></div>
        <div class="room-field"><span>Start</span><strong>${escapeHtml(room.start)}</strong></div>
        <div class="room-field"><span>Map</span><strong>${escapeHtml(room.map)}</strong></div>
      </div>
    </article>
  `).join("") || `<div class="empty">Organizer has not added the custom room yet. Check again before match time.</div>`;
  $("#playerRoomModal").showModal();
}

function openSquadModal(id) {
  if (!requireOrganizer()) return;
  const form = $("#squadForm");
  form.reset();
  form.elements.id.value = "";
  $("#squadModalTitle").textContent = id ? "Edit Player" : "Add Player";
  const squad = activeTournament()?.squads.find((item) => item.id === id);
  if (squad) Object.entries(squad).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; });
  $("#squadModal").showModal();
}

function openRoomModal(id) {
  if (!requireOrganizer()) return;
  const form = $("#roomForm");
  form.reset();
  form.elements.id.value = "";
  $("#roomModalTitle").textContent = id ? "Edit Room" : "Add Room";
  const room = activeTournament()?.rooms.find((item) => item.id === id);
  if (room) Object.entries(room).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; });
  $("#roomModal").showModal();
}

async function upsertTournament(data, id) {
  const roomDraft = {
    roomId: String(data.primaryRoomId || "").trim(),
    password: String(data.primaryRoomPassword || "").trim(),
    start: data.primaryRoomStart || data.time,
    map: data.map
  };
  delete data.primaryRoomId;
  delete data.primaryRoomPassword;
  delete data.primaryRoomStart;
  if (!cloudReady) {
    const existing = state.tournaments.find((item) => item.id === id);
    let target = existing;
    if (existing) existing.tournament = data;
    else {
      target = makeTournament(data);
      state.tournaments.unshift(target);
      state.activeTournamentId = target.id;
    }
    if (roomDraft.roomId || roomDraft.password) {
      const room = {
        id: target.rooms[0]?.id || uid(),
        name: "Custom Room",
        round: "Main Match",
        roomId: roomDraft.roomId,
        password: roomDraft.password,
        start: roomDraft.start,
        map: roomDraft.map
      };
      target.rooms = target.rooms.length ? target.rooms.map((item, index) => index === 0 ? room : item) : [room];
    }
    return render();
  }
  const payload = { title: data.title, match_date: data.date, match_time: data.time, map: data.map, mode: data.mode, entry: data.entry, prize: data.prize, rules: data.rules };
  let tournamentId = id;
  if (id) await cloudCall("Save tournament", () => cloud.from("tournaments").update(payload).eq("id", id));
  else {
    const result = await cloudCall("Create tournament", () => cloud.from("tournaments").insert(payload).select("id").single());
    tournamentId = result.data.id;
    state.activeTournamentId = tournamentId;
  }
  if (roomDraft.roomId || roomDraft.password) {
    const current = state.tournaments.find((item) => item.id === tournamentId);
    const existingRoom = current?.rooms?.[0];
    const roomPayload = {
      tournament_id: tournamentId,
      name: "Custom Room",
      round: "Main Match",
      room_id: roomDraft.roomId,
      password: roomDraft.password,
      start: roomDraft.start,
      map: roomDraft.map
    };
    if (existingRoom?.id) await cloudCall("Save room", () => cloud.from("rooms").update(roomPayload).eq("id", existingRoom.id));
    else await cloudCall("Create room", () => cloud.from("rooms").insert(roomPayload));
  }
  await syncAndRender();
}

async function upsertRoom(data) {
  const payload = { tournament_id: activeTournament().id, name: data.name, round: data.round, room_id: data.roomId, password: data.password, start: data.start, map: data.map };
  if (!cloudReady) {
    const room = { ...data, id: data.id || uid() };
    activeTournament().rooms = data.id ? activeTournament().rooms.map((item) => item.id === data.id ? room : item) : [...activeTournament().rooms, room];
    return render();
  }
  if (data.id) await cloudCall("Save room", () => cloud.from("rooms").update(payload).eq("id", data.id));
  else await cloudCall("Create room", () => cloud.from("rooms").insert(payload));
  await syncAndRender();
}

async function upsertSquad(data) {
  const payload = { tournament_id: activeTournament().id, name: data.name, captain: data.captain, free_fire_uid: data.uid, contact: data.contact, players: data.players, kills: Number(data.kills || 0), placement: Number(data.placement || 0), status: data.status, entry_paid: Number(data.entryPaid || 0) };
  if (!cloudReady) {
    const squad = { ...data, id: data.id || uid(), kills: Number(data.kills), placement: Number(data.placement) };
    activeTournament().squads = data.id ? activeTournament().squads.map((item) => item.id === data.id ? squad : item) : [...activeTournament().squads, squad];
    return render();
  }
  if (data.id) await cloudCall("Save squad", () => cloud.from("squads").update(payload).eq("id", data.id));
  else await cloudCall("Create squad", () => cloud.from("squads").insert(payload));
  await syncAndRender();
}

async function creditAdCoin() {
  if (!requireLogin()) return;
  const user = currentUser();
  const nextBalance = Number(user.walletBalance || 0) + coinRewardPerAd;
  if (cloudReady) {
    await cloudCall("Add ad coin", () => cloud.from("profiles").update({ wallet_balance: nextBalance }).eq("id", user.id));
    await cloud.from("transactions").insert({ user_id: user.id, type: "credit", amount: coinRewardPerAd, note: "Rewarded ad coin" });
  } else {
    user.walletBalance = nextBalance;
  }
  await syncAndRender();
  showToast("1 coin added.");
}

document.addEventListener("click", async (event) => {
  const target = event.target;
  const close = target.closest("[data-close-modal]");
  if (close) $(`#${close.dataset.closeModal}`).close();
  const view = target.closest("[data-view-link]");
  if (view) activateView(view.dataset.viewLink);
  if (target.closest("[data-new-tournament]")) openTournamentModal();
  const open = target.closest("[data-open-modal]");
  if (open?.dataset.openModal === "tournamentModal") openTournamentModal(activeTournament()?.id);
  if (open?.dataset.openModal === "joinModal") openJoinModal();
  if (open?.dataset.openModal === "squadModal") openSquadModal();
  if (open?.dataset.openModal === "roomModal") openRoomModal();

  const selectTournament = target.closest("[data-select-tournament]");
  if (selectTournament) { state.activeTournamentId = selectTournament.dataset.selectTournament; activateView("dashboard"); render(); }
  const joinTournament = target.closest("[data-join-tournament]");
  if (joinTournament) openJoinModal(joinTournament.dataset.joinTournament);
  const editTournament = target.closest("[data-edit-tournament]");
  if (editTournament) openTournamentModal(editTournament.dataset.editTournament);
  const editSquad = target.closest("[data-edit-squad]");
  if (editSquad) openSquadModal(editSquad.dataset.editSquad);
  const editRoom = target.closest("[data-edit-room]");
  if (editRoom) openRoomModal(editRoom.dataset.editRoom);

  const deleteTournament = target.closest("[data-delete-tournament]");
  if (deleteTournament && requireOrganizer()) {
    if (cloudReady) await cloudCall("Delete tournament", () => cloud.from("tournaments").delete().eq("id", deleteTournament.dataset.deleteTournament));
    else state.tournaments = state.tournaments.filter((item) => item.id !== deleteTournament.dataset.deleteTournament);
    await syncAndRender();
  }
  const deleteSquad = target.closest("[data-delete-squad]");
  if (deleteSquad && requireOrganizer()) {
    if (cloudReady) await cloudCall("Delete squad", () => cloud.from("squads").delete().eq("id", deleteSquad.dataset.deleteSquad));
    else activeTournament().squads = activeTournament().squads.filter((item) => item.id !== deleteSquad.dataset.deleteSquad);
    await syncAndRender();
  }
  const deleteRoom = target.closest("[data-delete-room]");
  if (deleteRoom && requireOrganizer()) {
    if (cloudReady) await cloudCall("Delete room", () => cloud.from("rooms").delete().eq("id", deleteRoom.dataset.deleteRoom));
    else activeTournament().rooms = activeTournament().rooms.filter((item) => item.id !== deleteRoom.dataset.deleteRoom);
    await syncAndRender();
  }
  const copyRoom = target.closest("[data-copy-room]");
  if (copyRoom) {
    if (!organizerMode && !hasJoinedTournament()) return showToast("Join tournament first.");
    const room = activeTournament().rooms.find((item) => item.id === copyRoom.dataset.copyRoom);
    navigator.clipboard.writeText(`${room.name}\nRoom ID: ${room.roomId}\nPassword: ${room.password}\nStart: ${room.start}\nMap: ${room.map}`);
    showToast("Room details copied.");
  }
  const approve = target.closest("[data-approve-wallet]");
  if (approve && requireOrganizer()) {
    const request = state.walletRequests.find((item) => item.id === approve.dataset.approveWallet);
    const user = state.users.find((item) => item.id === request?.userId);
    if (!request || !user) return;
    if (cloudReady) {
      await cloudCall("Approve wallet", () => cloud.from("wallet_requests").update({ status: "Approved" }).eq("id", request.id));
      await cloudCall("Add wallet balance", () => cloud.from("profiles").update({ wallet_balance: user.walletBalance + Number(request.amount) }).eq("id", user.id));
      await cloud.from("transactions").insert({ user_id: user.id, type: "credit", amount: request.amount, note: `Approved UTR ${request.utr}` });
    } else {
      request.status = "Approved";
      user.walletBalance += Number(request.amount);
    }
    await syncAndRender();
    showToast("Wallet approved.");
  }
  const reject = target.closest("[data-reject-wallet]");
  if (reject && requireOrganizer()) {
    if (cloudReady) await cloudCall("Reject wallet", () => cloud.from("wallet_requests").update({ status: "Rejected" }).eq("id", reject.dataset.rejectWallet));
    else state.walletRequests.find((item) => item.id === reject.dataset.rejectWallet).status = "Rejected";
    await syncAndRender();
  }
  const approveWithdraw = target.closest("[data-approve-withdraw]");
  if (approveWithdraw && requireOrganizer()) {
    const request = state.withdrawRequests.find((item) => item.id === approveWithdraw.dataset.approveWithdraw);
    const user = state.users.find((item) => item.id === request?.userId);
    if (!request || !user) return;
    const nextBalance = Math.max(0, Number(user.winningBalance || 0) - Number(request.amount || 0));
    if (cloudReady) {
      await cloudCall("Mark withdraw paid", () => cloud.from("withdraw_requests").update({ status: "Paid" }).eq("id", request.id));
      await cloudCall("Update winning wallet", () => cloud.from("profiles").update({ winning_balance: nextBalance }).eq("id", user.id));
    } else {
      request.status = "Paid";
      user.winningBalance = nextBalance;
    }
    await syncAndRender();
    showToast("Withdraw marked paid.");
  }
  const rejectWithdraw = target.closest("[data-reject-withdraw]");
  if (rejectWithdraw && requireOrganizer()) {
    if (cloudReady) await cloudCall("Reject withdraw", () => cloud.from("withdraw_requests").update({ status: "Rejected" }).eq("id", rejectWithdraw.dataset.rejectWithdraw));
    else state.withdrawRequests.find((item) => item.id === rejectWithdraw.dataset.rejectWithdraw).status = "Rejected";
    await syncAndRender();
    showToast("Withdraw rejected.");
  }
});

$("#authButton").addEventListener("click", async () => {
  if (currentUser()) {
    if (cloudReady) await cloud.auth.signOut();
    state.currentUserId = null;
    await syncAndRender();
    showToast("Logged out.");
  } else openAuthModal();
});

$("#authModeToggle").addEventListener("click", () => openAuthModal($("#authForm").elements.mode.value === "login" ? "register" : "login"));

$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const email = String(data.email || "").trim().toLowerCase();
  const mobile = String(data.mobile || "").trim();
  if (!cloudReady) {
    const user = state.users.find((item) => item.email === email);
    if (data.mode === "login") {
      if (!user || user.password !== data.password) return showToast("Wrong email or password.");
      state.currentUserId = user.id;
    } else {
      if (user) return showToast("Email already registered.");
      if (!data.name.trim() || !mobile) return showToast("Name and mobile required.");
      const created = { id: uid(), name: data.name.trim(), email, mobile, password: data.password, freeFireUid: "", walletBalance: 0, winningBalance: 0, isAdmin: false };
      state.users.push(created);
      state.currentUserId = created.id;
    }
    $("#authModal").close(); return render();
  }

  if (data.mode === "login") {
    const result = await cloudCall("Login", () => cloud.auth.signInWithPassword({ email, password: data.password }));
    state.currentUserId = result.data.user.id;
  } else {
    const result = await cloudCall("Register", () => cloud.auth.signUp({ email, password: data.password }));
    if (!result.data.session) {
      showToast("Disable email confirmation in Supabase Auth settings, then login.");
      return;
    }
    if (!data.name.trim() || !mobile) return showToast("Name and mobile required.");
    await cloudCall("Create profile", () => cloud.from("profiles").insert({ id: result.data.user.id, name: data.name.trim(), mobile, wallet_balance: 0, winning_balance: 0 }));
    state.currentUserId = result.data.user.id;
  }
  $("#authModal").close();
  await syncAndRender();
});

$("#payoutForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireLogin()) return;
  const user = currentUser();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const payload = {
    user_id: user.id,
    name: user.name,
    mobile: user.mobile,
    upi: data.upi,
    account_name: data.accountName,
    bank_name: data.bankName,
    account_number: data.accountNumber,
    ifsc: data.ifsc,
    updated_at: new Date().toISOString()
  };

  if (cloudReady) {
    await cloudCall("Save payout details", () => cloud.from("payout_details").upsert(payload, { onConflict: "user_id" }));
  } else {
    const local = {
      id: user.id,
      userId: user.id,
      name: user.name,
      mobile: user.mobile,
      upi: data.upi,
      accountName: data.accountName,
      bankName: data.bankName,
      accountNumber: data.accountNumber,
      ifsc: data.ifsc,
      updatedAt: new Date().toISOString()
    };
    state.payoutDetails = state.payoutDetails.filter((item) => item.userId !== user.id).concat(local);
  }
  await syncAndRender();
  showToast("Payout details saved.");
});

$("#withdrawForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireLogin()) return;
  const user = currentUser();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const amount = Number(data.amount || 0);
  if (!amount || amount < 1) return showToast("Enter withdraw amount.");
  if (amount > Number(user.winningBalance || 0)) return showToast("Amount is more than winning wallet.");
  const request = {
    id: uid(),
    userId: user.id,
    name: user.name,
    mobile: user.mobile,
    upi: String(data.upi || "").trim(),
    amount,
    status: "Pending",
    date: new Date().toISOString()
  };
  if (cloudReady) {
    await cloudCall("Send withdraw request", () => cloud.from("withdraw_requests").insert({
      user_id: user.id,
      name: user.name,
      mobile: user.mobile,
      upi: request.upi,
      amount,
      status: "Pending"
    }));
  } else {
    state.withdrawRequests.unshift(request);
  }
  event.currentTarget.reset();
  await syncAndRender();
  showToast("Withdraw request sent to organizer.");
});

$("#coinButton").addEventListener("click", () => {
  if (!requireLogin()) return;
  activateView("coins");
});

$("#watchRewardedAd").addEventListener("click", () => {
  if (!requireLogin()) return;
  if (!window.BattleHubAds?.showRewardedAd) {
    showToast("Rewarded ads work inside the Android APK.");
    return;
  }
  if (window.BattleHubAds.isRewardedAdReady && !window.BattleHubAds.isRewardedAdReady()) {
    window.BattleHubAds.preloadRewardedAd?.();
    $("#coinStatus").textContent = "Next ad is loading. Try again in a few seconds.";
    showToast("Ad loading. Try again in a few seconds.");
    return;
  }
  adWatchInProgress = true;
  renderCoins();
  window.BattleHubAds.showRewardedAd();
});

$("#copyPlayerRooms").addEventListener("click", () => {
  navigator.clipboard.writeText(roomDetailText());
  showToast("Room details copied.");
});

window.onRewardedAdResult = async (success, message) => {
  adWatchInProgress = false;
  if (success) await creditAdCoin();
  else {
    renderCoins();
    showToast(message || "Ad was not completed.");
  }
};

window.onRewardedAdLoaded = () => {
  if (!adWatchInProgress) {
    $("#coinStatus").textContent = "Ad is ready. Complete it to receive 1 coin.";
  }
};

$("#organizerToggle").addEventListener("click", () => {
  if (organizerMode) { organizerMode = false; sessionStorage.removeItem("free-fire-organizer-mode"); return render(); }
  $("#organizerModal").showModal();
});

$("#organizerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (new FormData(event.currentTarget).get("pin") !== organizerPin) return showToast("Wrong organizer PIN.");
  organizerMode = true;
  sessionStorage.setItem("free-fire-organizer-mode", "true");
  if (cloudReady && currentUser()) await cloud.from("profiles").update({ is_admin: true }).eq("id", currentUser().id);
  $("#organizerModal").close();
  await syncAndRender();
});

$("#tournamentSelect").addEventListener("change", (event) => { state.activeTournamentId = event.currentTarget.value; render(); });
$("#tournamentForm").addEventListener("submit", async (event) => { event.preventDefault(); if (!requireOrganizer()) return; const data = Object.fromEntries(new FormData(event.currentTarget)); const id = data.id; delete data.id; $("#tournamentModal").close(); await upsertTournament(data, id); });
$("#squadForm").addEventListener("submit", async (event) => { event.preventDefault(); if (!requireOrganizer()) return; const data = Object.fromEntries(new FormData(event.currentTarget)); $("#squadModal").close(); await upsertSquad(data); });
document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-user-wallet]");
  if (!form) return;
  event.preventDefault();
  if (!requireOrganizer()) return;
  const userId = form.dataset.userWallet;
  const amount = Number(new FormData(form).get("winningBalance") || 0);
  if (cloudReady) await cloudCall("Save winning amount", () => cloud.from("profiles").update({ winning_balance: amount }).eq("id", userId));
  else {
    const user = state.users.find((item) => item.id === userId);
    if (user) user.winningBalance = amount;
  }
  await syncAndRender();
  showToast("Winning amount saved.");
});
$("#joinForm").addEventListener("submit", async (event) => {
  event.preventDefault(); if (!requireLogin()) return; const user = currentUser(); const data = Object.fromEntries(new FormData(event.currentTarget)); const fee = parseEntryFee(activeTournament().tournament.entry);
  if (user.walletBalance < fee) { $("#joinModal").close(); showToast("Not enough coins."); activateView("coins"); render(); return; }
  if (cloudReady) {
    await cloudCall("Deduct coins", () => cloud.from("profiles").update({ wallet_balance: user.walletBalance - fee, free_fire_uid: data.uid, name: data.captain, mobile: data.contact }).eq("id", user.id));
    await cloudCall("Join tournament", () => cloud.from("squads").insert({ tournament_id: activeTournament().id, user_id: user.id, name: data.name, captain: data.captain, free_fire_uid: data.uid, contact: data.contact, players: "Solo player", status: "Pending", entry_paid: fee }));
  } else {
    user.walletBalance -= fee; user.freeFireUid = data.uid; activeTournament().squads.push({ ...data, players: "Solo player", id: uid(), userId: user.id, kills: 0, placement: 0, status: "Pending", entryPaid: fee });
  }
  $("#joinModal").close(); await syncAndRender(); showToast("Joined tournament."); openPlayerRoomModal();
});
$("#roomForm").addEventListener("submit", async (event) => { event.preventDefault(); if (!requireOrganizer()) return; const data = Object.fromEntries(new FormData(event.currentTarget)); $("#roomModal").close(); await upsertRoom(data); });
$("#copyInvite").addEventListener("click", () => navigator.clipboard.writeText(activeTournament()?.tournament.title || ""));
$("#downloadData").addEventListener("click", () => { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([JSON.stringify(activeTournament(), null, 2)], { type: "application/json" })); link.download = "tournament-data.json"; link.click(); });
$("#clearScores").addEventListener("click", async () => {
  if (!requireOrganizer()) return;
  if (cloudReady) await Promise.all((activeTournament()?.squads || []).map((squad) => cloud.from("squads").update({ kills: 0, placement: 0 }).eq("id", squad.id)));
  else activeTournament().squads = activeTournament().squads.map((squad) => ({ ...squad, kills: 0, placement: 0 }));
  await syncAndRender();
});
$("#resetDemo").addEventListener("click", () => { if (!requireOrganizer()) return; state = createDefaults(); render(); });
window.addEventListener("hashchange", () => activateView(location.hash.slice(1)));

activateView(location.hash.slice(1) || "dashboard");
syncAndRender();
