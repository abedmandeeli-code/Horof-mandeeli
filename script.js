/* =====================  أدوات عامة  ===================== */
const $ = id => document.getElementById(id);
const ALPHABET = ["أ","ب","ت","ث","ج","ح","خ","د","ذ","ر","ز","س","ش","ص","ض","ط","ظ","ع","غ","ف","ق","ك","ل","م","ن","هـ","و","ي"];
const ROUND_NAMES = ["","الأولى","الثانية","الثالثة","الرابعة","الخامسة","السادسة","السابعة","الثامنة","التاسعة","العاشرة"];
const TEAM_AR = { green: "الأخضر", orange: "البرتقالي" };
const ANSWER_SECONDS = 10;
const SECOND_SECONDS = 10;
const MAX_PLAYERS = 40;

let soundEnabled = true;
let audioCtx = null;

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    if (type === "click") {
      osc.frequency.setValueAtTime(440, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(); osc.stop(t + 0.1);
    } else if (type === "score") {
      osc.frequency.setValueAtTime(587.33, t);
      osc.frequency.setValueAtTime(880, t + 0.08);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(); osc.stop(t + 0.3);
    } else if (type === "buzz") {
      osc.type = "square";
      osc.frequency.setValueAtTime(220, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(); osc.stop(t + 0.35);
    }
  } catch (e) { /* ignore */ }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  $("soundToggleBtn").textContent = soundEnabled ? "كتم أصوات اللعبة 🔊" : "تشغيل الأصوات 🔇";
  playSound("click");
}

function show(id, display = "flex") { $(id).style.display = display; }
function hide(id) { $(id).style.display = "none"; }
const uid = () => Math.random().toString(36).slice(2, 10);

/* =====================  الحالة  ===================== */
const G = {
  size: 5, mode: "both", target: 2, round: 1,
  score: { green: 0, orange: 0 },
  grid: [], sel: null, history: [], pendingWinner: null
};

const R = {            // حالة المنظم / الغرفة
  code: null, ch: null, tick: null, url: "",
  players: {}, kicked: new Set(),
  phase: "ready", winnerId: null, secondTeam: null, deadline: 0,
  menuPlayerId: null, lastBroadcast: 0
};

const P = {            // حالة اللاعب
  id: null, name: "", team: "green", ch: null, state: null, joined: false, timer: null
};

let selectedJoinTeam = "green";

/* =====================  البداية  ===================== */
document.addEventListener("DOMContentLoaded", () => {
  const bg = $("bgPattern");
  for (let i = 0; i < 90; i++) {
    const s = document.createElement("span");
    s.textContent = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    bg.appendChild(s);
  }
  const room = new URLSearchParams(location.search).get("room");
  if (room) { $("roomCode").value = room; openJoinRoom(); }
  document.addEventListener("click", () => { if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); }, { once: true });
});


/* =====================  الاتصال بين الأجهزة (PeerJS / WebRTC)  =====================
   المنظم = Peer معرّفه 7rof-رمز_الغرفة، واللاعبون يتصلون به مباشرة.
   إن لم تُحمَّل المكتبة يعود للعمل بين تبويبات نفس المتصفح فقط. */
function makeOrganizerChannel(code) {
  if (typeof Peer === "undefined") return new BroadcastChannel("7rof_" + code);
  const conns = new Set();
  const ch = {
    onmessage: null,
    postMessage(m) { conns.forEach(c => { if (c.open) { try { c.send(m); } catch (e) { /* ignore */ } } }); },
    close() { try { peer.destroy(); } catch (e) { /* ignore */ } }
  };
  const peer = new Peer("7rof-" + code);
  peer.on("connection", c => {
    conns.add(c);
    c.on("data", d => { if (ch.onmessage) ch.onmessage({ data: d }); });
    c.on("close", () => conns.delete(c));
  });
  peer.on("error", e => { if (e.type === "unavailable-id") toast("رمز الغرفة مستخدم، أغلق الغرفة وأنشئ غرفة جديدة"); });
  return ch;
}

function makePlayerChannel(code) {
  if (typeof Peer === "undefined") return new BroadcastChannel("7rof_" + code);
  const queue = []; let conn = null;
  const ch = {
    onmessage: null,
    postMessage(m) { if (conn && conn.open) conn.send(m); else queue.push(m); },
    close() { try { peer.destroy(); } catch (e) { /* ignore */ } }
  };
  const peer = new Peer();
  peer.on("open", () => {
    conn = peer.connect("7rof-" + code, { reliable: true });
    conn.on("open", () => queue.splice(0).forEach(m => conn.send(m)));
    conn.on("data", d => { if (ch.onmessage) ch.onmessage({ data: d }); });
  });
  peer.on("error", () => { /* يُعالج بمهلة الانضمام */ });
  return ch;
}

/* =====================  إنشاء الغرفة  ===================== */
function openCreateRoom() {
  playSound("click");
  if (!R.code) createRoom();
  renderRoomModal();
  show("createRoomModal");
}

function createRoom() {
  R.code = String(Math.floor(100000 + Math.random() * 900000));
  R.players = {}; R.kicked = new Set();
  resetBuzzState();
  R.url = location.href.split(/[?#]/)[0] + "?room=" + R.code;
  if (location.protocol === "file:") toast("افتح الموقع من رابط الاستضافة (GitHub Pages) ليعمل الباركود على جوالات اللاعبين");
  R.ch = makeOrganizerChannel(R.code);
  R.ch.onmessage = e => onOrganizerMessage(e.data);
  R.tick = setInterval(organizerTick, 250);
}

function renderRoomModal() {
  $("roomCodeDisplay").textContent = R.code;
  const qrEl = $("qrcode");
  qrEl.innerHTML = "";
  if (typeof QRCode !== "undefined") {
    new QRCode(qrEl, { text: R.url, width: 130, height: 130, colorDark: "#3b195c", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
  }
  renderRoomPlayers();
}

function renderRoomPlayers() {
  const list = Object.values(R.players);
  if ($("roomPlayersCount")) $("roomPlayersCount").textContent = `${list.length}/${MAX_PLAYERS}`;
  $("roomPlayersEmpty").style.display = list.length ? "none" : "block";
  $("roomPlayersList").innerHTML = list.map(p => `<span class="rp-chip ${p.team}">${escapeHtml(p.name)}</span>`).join("");
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function copyRoomLink() {
  playSound("click");
  const done = () => toast("تم نسخ رابط الغرفة بنجاح!");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(R.url).then(done).catch(() => toast("تعذر نسخ الرابط تلقائياً."));
  } else toast("تعذر نسخ الرابط تلقائياً.");
}

function closeCreateRoom() { playSound("click"); hide("createRoomModal"); }

function closeRoom() {
  playSound("click");
  if (R.ch) { R.ch.postMessage({ t: "closed" }); R.ch.close(); R.ch = null; }
  clearInterval(R.tick);
  R.code = null; R.players = {}; R.kicked = new Set();
  hide("createRoomModal");
}

function toggleSection(bodyId, arrowId) {
  playSound("click");
  const body = $(bodyId), arrow = $(arrowId);
  const isHidden = body.style.display === "none";
  body.style.display = isHidden ? "flex" : "none";
  arrow.textContent = isHidden ? "▼" : "▲";
}

function setActive(ids, activeId) {
  ids.forEach(i => $(i).classList.toggle("active", i === activeId));
}
function selectOption(id) {
  playSound("click");
  setActive(["mode1", "mode2", "mode3"], id);
  G.mode = id === "mode1" ? "both" : id === "mode2" ? "buttons" : "cells";
}
function selectGrid(id) {
  playSound("click");
  setActive(["grid3", "grid4", "grid5"], id);
  G.size = id === "grid3" ? 3 : id === "grid4" ? 4 : 5;
}
function selectRound(n) {
  playSound("click");
  G.target = n;
  setActive(["round1", "round2", "round3"], n === 3 ? "round1" : n === 2 ? "round2" : "round3");
}

/* =====================  بدء اللعبة  ===================== */
function startGame() {
  playSound("score");
  if (!R.code) createRoom();
  hide("createRoomModal");
  hide("mainMenuCard");
  G.score = { green: 0, orange: 0 };
  G.round = 1;
  updateScoreUI();
  applyModeLayout();
  resetBuzzState();
  broadcastState();
  showRoundTransitionScreen();
}

function applyModeLayout() {
  $("boardFrame").style.display = G.mode === "buttons" ? "none" : "flex";
  $("playersPanel").style.display = G.mode === "cells" ? "none" : "block";
  $("scoreHint").style.display = G.mode === "buttons" ? "none" : "block";
  $("clearCellBtn").style.display = G.mode === "buttons" ? "none" : "block";
  renderPlayersPanel();
}

function updateScoreUI() {
  $("greenScoreVal").textContent = G.score.green;
  $("orangeScoreVal").textContent = G.score.orange;
}

function showRoundTransitionScreen() {
  $("roundTitleText").textContent = `الجولة ${ROUND_NAMES[G.round] || G.round}`;
  show("roundTransitionScreen");
  hide("gameScreen");
}

function startActualRound() {
  playSound("click");
  hide("roundTransitionScreen");
  show("gameScreen");
  $("currentRoundBadge").textContent = `الجولة ${ROUND_NAMES[G.round] || G.round}`;
  buildHexGrid(G.size);
}

/* =====================  الخلية السداسية  ===================== */
function buildHexGrid(size) {
  const wrapper = $("hexGridWrapper");
  wrapper.innerHTML = "";
  G.sel = null; G.history = []; G.pendingWinner = null;
  document.body.classList.remove("has-selection");

  const letters = [...ALPHABET].sort(() => Math.random() - 0.5).slice(0, size * size);
  G.grid = [];
  let k = 0;
  for (let r = 0; r < size; r++) {
    const row = document.createElement("div");
    row.className = "hex-row" + (r % 2 === 1 ? " offset-row" : "");
    G.grid[r] = [];
    for (let c = 0; c < size; c++) {
      G.grid[r][c] = { letter: letters[k++], state: "normal" };
      const hex = document.createElement("div");
      hex.className = "hex";
      hex.dataset.r = r; hex.dataset.c = c;
      hex.innerHTML = `<div class="hex-in">${G.grid[r][c].letter}</div>`;
      hex.onclick = () => onCellClick(r, c);
      row.appendChild(hex);
    }
    wrapper.appendChild(row);
  }
}

function cellEl(r, c) { return document.querySelector(`#hexGridWrapper .hex[data-r="${r}"][data-c="${c}"]`); }

function refreshCell(r, c) {
  const el = cellEl(r, c);
  if (!el) return;
  const st = G.grid[r][c].state;
  el.classList.remove("green", "orange", "sel");
  if (st === "green") el.classList.add("green");
  if (st === "orange") el.classList.add("orange");
  if (G.sel && G.sel.r === r && G.sel.c === c) el.classList.add("sel");
}

function setSelection(sel) {
  const old = G.sel;
  G.sel = sel;
  if (old) refreshCell(old.r, old.c);
  if (sel) refreshCell(sel.r, sel.c);
  document.body.classList.toggle("has-selection", !!sel);
}

function onCellClick(r, c) {
  playSound("click");
  if (G.sel && G.sel.r === r && G.sel.c === c) setSelection(null);
  else setSelection({ r, c });
}

/* تلوين الخلية المحددة لفريق */
function colorSelectedCell(team) {
  if (!G.sel) { toast("اختر حرفاً من الخلية أولاً بالضغط عليه"); return; }
  playSound("score");
  const { r, c } = G.sel;
  G.history.push({ r, c, prev: G.grid[r][c].state, team });
  G.grid[r][c].state = team;
  setSelection(null);
  refreshCell(r, c);
  const el = cellEl(r, c);
  if (el) el.classList.add("pulse");

  if (checkWin(team)) {
    G.pendingWinner = team;
    setTimeout(() => triggerWinModal(team), 500);
  }
}

/*
  الجوار (الصفوف الفردية مزاحة نصف خلية لليمين، العرض LTR):
  صف زوجي (r%2==0): الصف المجاور يحوي c-1 و c
  صف فردي: الصف المجاور يحوي c و c+1
*/
function neighbors(r, c, n) {
  const out = [[r, c - 1], [r, c + 1]];
  const adj = (r % 2 === 0) ? [c - 1, c] : [c, c + 1];
  adj.forEach(cc => { out.push([r - 1, cc]); out.push([r + 1, cc]); });
  return out.filter(([a, b]) => a >= 0 && a < n && b >= 0 && b < n);
}

/* الأخضر: من أعلى لأسفل — البرتقالي: من اليمين لليسار */
function checkWin(team) {
  const n = G.grid.length;
  const seen = Array.from({ length: n }, () => Array(n).fill(false));
  const queue = [];
  for (let i = 0; i < n; i++) {
    const [r, c] = team === "green" ? [0, i] : [i, 0];
    if (G.grid[r][c].state === team) { seen[r][c] = true; queue.push([r, c]); }
  }
  while (queue.length) {
    const [r, c] = queue.shift();
    if (team === "green" && r === n - 1) return true;
    if (team === "orange" && c === n - 1) return true;
    for (const [a, b] of neighbors(r, c, n)) {
      if (!seen[a][b] && G.grid[a][b].state === team) { seen[a][b] = true; queue.push([a, b]); }
    }
  }
  return false;
}

/* =====================  نافذة الفوز  ===================== */
function triggerWinModal(team) {
  playSound("score");
  const name = team === "green" ? "الأخضر" : "البرتقالي";
  $("winModalTitle").textContent = `الفريق ${name} فاز بالجولة!`;
  $("winModalTitle").style.color = team === "green" ? "#5be37d" : "#ff9a1f";
  $("winModalSub").textContent = `هل تريد حفظ النتيجة والذهاب للجولة ${ROUND_NAMES[G.round + 1] || (G.round + 1)}؟`;

  const clone = $("boardFrame").cloneNode(true);
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach(e => e.removeAttribute("id"));
  clone.querySelectorAll(".hex").forEach(h => { h.onclick = null; h.classList.remove("sel", "pulse"); });
  clone.style.display = "flex";
  $("winMiniGrid").innerHTML = "";
  $("winMiniGrid").appendChild(clone);
  show("winModal");
}

function cancelLastMove() {
  playSound("click");
  hide("winModal");
  const last = G.history.pop();
  if (last) {
    G.grid[last.r][last.c].state = last.prev;
    refreshCell(last.r, last.c);
  }
  G.pendingWinner = null;
}

function saveAndNextRound() {
  playSound("click");
  hide("winModal");
  const team = G.pendingWinner;
  G.pendingWinner = null;
  if (!team) return;
  G.score[team]++;
  updateScoreUI();
  if (G.score[team] >= G.target) {
    $("finalTitle").textContent = `🏆 الفريق ${TEAM_AR[team]} فاز بالمباراة!`;
    $("finalTitle").style.color = team === "green" ? "#5be37d" : "#ff9a1f";
    $("finalSub").textContent = `النتيجة النهائية: الأخضر ${G.score.green} - البرتقالي ${G.score.orange}`;
    show("finalModal");
    return;
  }
  G.round++;
  resetBuzzState();
  broadcastState();
  showRoundTransitionScreen();
}

function finishMatch() {
  playSound("click");
  hide("finalModal");
  backToRoom();
}

/* =====================  مسح الخلية  ===================== */
function openClearOptions() { playSound("click"); show("clearOptionsModal"); }
function closeClearOptions() { playSound("click"); hide("clearOptionsModal"); }

function executeClear(redistribute) {
  playSound("click");
  hide("clearOptionsModal");
  if (redistribute) buildHexGrid(G.size);
  else {
    G.sel = null; G.history = []; G.pendingWinner = null;
    document.body.classList.remove("has-selection");
    G.grid.forEach((row, r) => row.forEach((cell, c) => { cell.state = "normal"; refreshCell(r, c); }));
  }
}

function backToRoom() {
  playSound("click");
  hide("gameScreen"); hide("roundTransitionScreen"); hide("winModal");
  document.body.classList.remove("has-selection");
  G.score = { green: 0, orange: 0 }; G.round = 1; updateScoreUI();
  show("mainMenuCard", "block");
  if (R.code) { renderRoomModal(); show("createRoomModal"); }
}

/* =====================  البازر: حالة المنظم  ===================== */
function resetBuzzState() {
  R.phase = "ready"; R.winnerId = null; R.secondTeam = null; R.deadline = 0;
}

function resetButtons() {
  playSound("click");
  resetBuzzState();
  organizerUpdate();
}

function resetSecondChance() {
  playSound("click");
  const w = R.players[R.winnerId];
  if (!w) { toast("لا يوجد لاعب ضغط الزر بعد"); return; }
  R.secondTeam = w.team === "green" ? "orange" : "green";
  R.phase = "second";
  R.deadline = Date.now() + SECOND_SECONDS * 1000;
  organizerUpdate();
}

function startAnswering(id) {
  R.phase = "answering"; R.winnerId = id; R.secondTeam = null;
  R.deadline = Date.now() + ANSWER_SECONDS * 1000;
  playSound("buzz");
  organizerUpdate();
}

function handlePress(id) {
  const p = R.players[id];
  if (!p) return;
  if (R.phase === "ready") startAnswering(id);
  else if (R.phase === "second" && p.team === R.secondTeam) startAnswering(id);
}

function organizerTick() {
  const now = Date.now();
  let changed = false;
  if (R.phase === "answering" && now > R.deadline) { R.phase = "expired"; changed = true; }
  else if (R.phase === "second" && now > R.deadline) { R.phase = "closed"; changed = true; }
  if (changed) organizerUpdate();
  else if (now - R.lastBroadcast > 1000) broadcastState();
}

function organizerUpdate() {
  renderPlayersPanel();
  renderRoomPlayers();
  broadcastState();
}

function broadcastState() {
  if (!R.ch) return;
  R.lastBroadcast = Date.now();
  R.ch.postMessage({
    t: "state", room: R.code, players: Object.values(R.players), kicked: [...R.kicked],
    phase: R.phase, winnerId: R.winnerId, secondTeam: R.secondTeam, deadline: R.deadline
  });
}

function onOrganizerMessage(m) {
  if (!m) return;
  if (m.t === "join") {
    if (R.kicked.has(m.id)) { broadcastState(); return; }
    if (!R.players[m.id] && Object.keys(R.players).length >= MAX_PLAYERS) return;
    const isNew = !R.players[m.id];
    R.players[m.id] = { id: m.id, name: String(m.name).slice(0, 14), team: m.team === "orange" ? "orange" : "green" };
    if (isNew) playSound("click");
    organizerUpdate();
  } else if (m.t === "press") handlePress(m.id);
  else if (m.t === "leave") { delete R.players[m.id]; organizerUpdate(); }
}

/* حالة زر لاعب بحسب حالة الغرفة (يُستخدم عند المنظم واللاعب) */
function buzzStateFor(state, p, now) {
  const mine = state.winnerId === p.id;
  const secs = Math.max(0, Math.ceil((state.deadline - now) / 1000));
  switch (state.phase) {
    case "ready": return { cls: "blue", label: "", text: "جاهز! اضغط عند معرفة الإجابة", canPress: true };
    case "answering": return mine
      ? { cls: "green", label: String(secs), text: "أنت الأسرع! أجب الآن", canPress: false }
      : { cls: "orange", label: "", text: "مقفل — سبقك لاعب آخر", canPress: false };
    case "expired": return mine
      ? { cls: "red", label: "", text: "انتهى الوقت", canPress: false }
      : { cls: "orange", label: "", text: "مقفل", canPress: false };
    case "second":
      if (p.team === state.secondTeam) return { cls: "white", label: String(secs), text: "فرصة ثانية! اضغط الآن", canPress: true };
      return mine ? { cls: "red", label: "", text: "انتهى الوقت", canPress: false } : { cls: "orange", label: "", text: "مقفل", canPress: false };
    case "closed": return { cls: "red", label: "", text: "انتهى الوقت", canPress: false };
  }
  return { cls: "blue", label: "", text: "", canPress: false };
}

/* لوحة اللاعبين عند المنظم */
function renderPlayersPanel() {
  const list = Object.values(R.players);
  $("playersCountTxt").textContent = list.length;
  const now = Date.now();
  const st = { phase: R.phase, winnerId: R.winnerId, secondTeam: R.secondTeam, deadline: R.deadline };
  $("playerBubbles").innerHTML = "";
  list.forEach(p => {
    const b = buzzStateFor(st, p, now);
    const btn = document.createElement("button");
    btn.className = `pb team-${p.team}`;
    btn.innerHTML = `<div class="pb-circle st-${b.cls}">${b.label}</div><span class="pb-name">${escapeHtml(p.name)}</span>`;
    btn.onclick = () => onPlayerBubbleClick(p.id);
    $("playerBubbles").appendChild(btn);
  });
}

setInterval(() => { if (R.code && (R.phase === "answering" || R.phase === "second")) renderPlayersPanel(); }, 500);

function onPlayerBubbleClick(id) {
  const p = R.players[id];
  if (!p) return;
  if (G.sel) { colorSelectedCell(p.team); return; }   // أثناء تحديد حرف: احتساب النقطة لفريقه
  R.menuPlayerId = id;
  $("playerMenuName").textContent = p.name;
  show("playerMenuModal");
}
function closePlayerMenu() { playSound("click"); hide("playerMenuModal"); }
function changePlayerTeam() {
  const p = R.players[R.menuPlayerId];
  if (p) p.team = p.team === "green" ? "orange" : "green";
  hide("playerMenuModal"); organizerUpdate();
}
function kickPlayer() {
  if (R.menuPlayerId) { R.kicked.add(R.menuPlayerId); delete R.players[R.menuPlayerId]; }
  if (R.winnerId === R.menuPlayerId) R.winnerId = null;
  hide("playerMenuModal"); organizerUpdate();
}

/* =====================  الانضمام كلاعب  ===================== */
function openJoinRoom() { playSound("click"); selectTeam(selectedJoinTeam, true); show("joinRoomModal"); }
function closeJoinRoom() { playSound("click"); hide("joinRoomModal"); }

function selectTeam(team, silent) {
  if (!silent) playSound("click");
  selectedJoinTeam = team;
  $("greenTeamBtn").classList.toggle("active", team === "green");
  $("orangeTeamBtn").classList.toggle("active", team === "orange");
}

function enterGame(event) {
  event.preventDefault();
  playSound("score");
  const code = $("roomCode").value.trim();
  const name = $("playerName").value.trim();
  if (!code || !name) return;

  P.id = P.id || uid(); P.name = name; P.team = selectedJoinTeam; P.joined = false; P.state = null;
  if (P.ch) P.ch.close();
  P.ch = makePlayerChannel(code);
  P.ch.onmessage = e => onPlayerMessage(e.data);
  sendJoin();
  toast("جاري الاتصال بالغرفة...");
  setTimeout(() => {
    if (!P.joined) {
      toast("لم يتم العثور على الغرفة، تأكد من الرمز");
      if (P.ch) { P.ch.close(); P.ch = null; }
    }
  }, 8000);
}

function sendJoin() { if (P.ch) P.ch.postMessage({ t: "join", id: P.id, name: P.name, team: P.team }); }

function onPlayerMessage(m) {
  if (!m) return;
  if (m.t === "closed") { toast("تم إغلاق الغرفة"); leaveToMenu(); return; }
  if (m.t !== "state") return;
  if (m.kicked && m.kicked.includes(P.id)) { toast("تم طردك من الغرفة"); leaveToMenu(); return; }
  const me = m.players.find(p => p.id === P.id);
  if (!me) { if (!P.joined || P.state) sendJoin(); return; }
  P.state = m; P.team = me.team;
  if (!P.joined) {
    P.joined = true;
    hide("joinRoomModal"); hide("mainMenuCard");
    show("playerScreen");
    P.timer = setInterval(renderPlayerScreen, 200);
  }
  renderPlayerScreen();
}

function renderPlayerScreen() {
  if (!P.state) return;
  const me = P.state.players.find(p => p.id === P.id) || { id: P.id, team: P.team };
  $("pScreenName").textContent = P.name;
  const tag = $("pScreenTeam");
  tag.textContent = me.team === "green" ? "الفريق الأخضر" : "الفريق البرتقالي";
  tag.className = "player-team-tag " + me.team;
  const b = buzzStateFor(P.state, me, Date.now());
  $("buzzerBtn").className = "buzzer b-" + b.cls;
  $("buzzerLabel").textContent = b.label;
  $("buzzerStatus").textContent = b.text;
}

function playerPress() {
  if (!P.state || !P.ch) return;
  const me = P.state.players.find(p => p.id === P.id);
  if (!me) return;
  if (!buzzStateFor(P.state, me, Date.now()).canPress) return;
  playSound("buzz");
  if (navigator.vibrate) navigator.vibrate(60);
  P.ch.postMessage({ t: "press", id: P.id });
}

function playerLeave() {
  if (P.ch) P.ch.postMessage({ t: "leave", id: P.id });
  leaveToMenu();
}

function leaveToMenu() {
  clearInterval(P.timer);
  if (P.ch) { P.ch.close(); P.ch = null; }
  P.joined = false; P.state = null;
  hide("playerScreen");
  show("mainMenuCard", "block");
}

/* =====================  شرح طريقة اللعب  ===================== */
function openHowToPlay() { playSound("click"); show("howToPlayModal"); }
function closeHowToPlay() { playSound("click"); hide("howToPlayModal"); }
function switchTab(tab) {
  playSound("click");
  const org = tab === "organizer";
  $("organizerTabBtn").classList.toggle("active", org);
  $("playerTabBtn").classList.toggle("active", !org);
  $("organizerTabContent").classList.toggle("active-content", org);
  $("playerTabContent").classList.toggle("active-content", !org);
}

function contactUs() { playSound("click"); toast("تواصل معنا عبر البريد أو وسائل التواصل الخاصة بالموقع"); }

/* =====================  بنك الأسئلة  ===================== */
const questionsDatabase = (() => {
  const raw = window.QUESTIONS || {};
  const out = {};
  ALPHABET.forEach(l => { out[l] = (raw[l] || []).filter(x => x && x.q && x.q.trim() && x.a && x.a.trim()); });
  return out;
})();

let consumedQuestions = {};
let qbEmail = null, qbName = "";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } };

function loadConsumed() {
  try { consumedQuestions = JSON.parse(lsGet("7rof_consumed_" + qbEmail) || "{}"); } catch (e) { consumedQuestions = {}; }
  ALPHABET.forEach(l => { if (!Array.isArray(consumedQuestions[l])) consumedQuestions[l] = []; });
}
function saveConsumed() { if (qbEmail) lsSet("7rof_consumed_" + qbEmail, JSON.stringify(consumedQuestions)); }
ALPHABET.forEach(l => { consumedQuestions[l] = []; });

let currentSelectedLetter = "أ";
let currentActiveQuestion = null;

const totalQuestions = () => ALPHABET.reduce((s, l) => s + questionsDatabase[l].length, 0);
const consumedCount = () => ALPHABET.reduce((s, l) => s + consumedQuestions[l].filter(q => questionsDatabase[l].some(x => x.q === q)).length, 0);

function openQuestionBank() {
  playSound("click");
  show("questionBankModal");
  const el = $("qbQrCode");
  el.innerHTML = "";
  if (typeof QRCode !== "undefined") {
    new QRCode(el, { text: location.href.split("?")[0], width: 120, height: 120, colorDark: "#1a1a1a", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
  }
}
function closeQuestionBankModal() { playSound("click"); hide("questionBankModal"); }
function enterQuestionBankApp() {
  playSound("click");
  hide("questionBankModal");
  show("questionBankAppModal");
  const saved = lsGet("7rof_email");
  if (saved && EMAIL_RE.test(saved)) {
    qbEmail = saved; qbName = lsGet("7rof_name") || saved.split("@")[0];
    loadConsumed();
    hideAllQbViews(); show("qbSplashView", "block");
    setTimeout(showQbMain, 900);
  } else { showQbLogin(); }
}

function showQbLogin() { hideAllQbViews(); $("qbLoginError").textContent = ""; show("qbLoginView", "block"); }

function qbLogin(e) {
  e.preventDefault();
  const email = $("qbEmailInput").value.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) { $("qbLoginError").textContent = "الرجاء إدخال بريد إلكتروني صحيح"; return; }
  playSound("score");
  qbEmail = email;
  qbName = $("qbNameInput").value.trim() || email.split("@")[0];
  lsSet("7rof_email", qbEmail); lsSet("7rof_name", qbName);
  loadConsumed();
  hideAllQbViews(); show("qbSplashView", "block");
  setTimeout(showQbMain, 700);
}

function qbLogout() {
  playSound("click");
  lsDel("7rof_email"); lsDel("7rof_name");
  qbEmail = null; qbName = "";
  ALPHABET.forEach(l => { consumedQuestions[l] = []; });
  $("qbEmailInput").value = "";
  showQbLogin();
}
function closeQbApp() { playSound("click"); hide("questionBankAppModal"); }

function hideAllQbViews() { ["qbSplashView", "qbLoginView", "qbMainView", "qbProfileView", "qbGridView", "qbQuestionView"].forEach(hide); }
function showQbMain() { hideAllQbViews(); $("qbUserName").textContent = qbName; show("qbMainView", "block"); }
function showQbProfile() { hideAllQbViews(); $("qbProfileEmail").textContent = qbEmail || "—"; $("qbConsumedTotal").textContent = consumedCount(); show("qbProfileView", "block"); }
function showQbGrid() { hideAllQbViews(); show("qbGridView", "block"); updateStatsDisplay(); renderQbLettersGrid(); }

function clearQbData() {
  playSound("click");
  ALPHABET.forEach(l => consumedQuestions[l] = []);
  saveConsumed();
  $("qbConsumedTotal").textContent = 0;
  toast("تم مسح البيانات");
}

function updateStatsDisplay() {
  const total = totalQuestions(), used = consumedCount();
  $("totalQuestionsCount").textContent = total;
  $("consumedPercentageVal").textContent = (total ? Math.round(used / total * 100) : 0) + "%";
}

function letterPercent(l) {
  const total = questionsDatabase[l].length;
  if (!total) return 0;
  const used = consumedQuestions[l].filter(q => questionsDatabase[l].some(x => x.q === q)).length;
  return Math.round(used / total * 100);
}

function renderQbLettersGrid() {
  const box = $("qbLettersContainer");
  box.innerHTML = "";
  ALPHABET.forEach(l => {
    const btn = document.createElement("button");
    btn.className = "qb-letter-btn";
    btn.innerHTML = `<span>${l}</span><span class="qb-sub-perc">${letterPercent(l)}%</span>`;
    btn.onclick = () => selectQbLetter(l);
    box.appendChild(btn);
  });
}

function toggleNoRepeatMode() { playSound("click"); }

function selectQbLetter(letter) {
  playSound("click");
  currentSelectedLetter = letter;
  hideAllQbViews();
  show("qbQuestionView", "block");
  $("currentQbLetter").textContent = letter;
  loadQbQuestion();
}

function loadQbQuestion() {
  const l = currentSelectedLetter;
  const all = questionsDatabase[l];
  const noRepeat = $("noRepeatToggle").checked;
  $("qbAnswerBox").style.display = "none";
  $("toggleAnswerBtn").textContent = "عرض الإجابة";
  $("letterConsumedPerc").textContent = letterPercent(l) + "%";

  if (!all.length) {
    $("qbQuestionText").textContent = totalQuestions() === 0
      ? "لم يتم تحميل ملف الأسئلة. تأكد أن الملف اسمه questions.js (بحرف s) وفي نفس مجلد index.html ثم حدّث الصفحة بـ Ctrl+F5."
      : `لا توجد أسئلة مسجلة حالياً لحرف (${l}).`;
    $("qbAnswerText").textContent = "غير متوفر"; $("qbCategory").textContent = "عام";
    currentActiveQuestion = null; return;
  }
  let pool = noRepeat ? all.filter(q => !consumedQuestions[l].includes(q.q)) : all;
  if (!pool.length) {
    $("qbQuestionText").textContent = `لقد استهلكت جميع أسئلة حرف (${l}). عطّل "عدم تكرار الأسئلة" أو امسح البيانات لتكرارها.`;
    $("qbAnswerText").textContent = "انتهت الأسئلة"; $("qbCategory").textContent = "تنبيه";
    currentActiveQuestion = null; return;
  }
  currentActiveQuestion = pool[Math.floor(Math.random() * pool.length)];
  if (!consumedQuestions[l].includes(currentActiveQuestion.q)) { consumedQuestions[l].push(currentActiveQuestion.q); saveConsumed(); }
  $("qbQuestionText").textContent = currentActiveQuestion.q;
  $("qbAnswerText").textContent = currentActiveQuestion.a;
  $("qbCategory").textContent = currentActiveQuestion.cat || "عام";
  $("letterConsumedPerc").textContent = letterPercent(l) + "%";
}

function toggleQbAnswer() {
  playSound("click");
  const box = $("qbAnswerBox");
  const open = box.style.display === "none";
  box.style.display = open ? "block" : "none";
  $("toggleAnswerBtn").textContent = open ? "إخفاء الإجابة" : "عرض الإجابة";
}
function nextQbQuestion() { playSound("click"); loadQbQuestion(); }
function reportQuestion() {
  playSound("click");
  if (!currentActiveQuestion) return;
  toast("تم تسجيل البلاغ، شكراً لك");
}