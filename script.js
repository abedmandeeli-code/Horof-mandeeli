/* =====================  أدوات عامة  ===================== */
const $ = id => document.getElementById(id);
const ALPHABET = ["أ","ب","ت","ث","ج","ح","خ","د","ذ","ر","ز","س","ش","ص","ض","ط","ظ","ع","غ","ف","ق","ك","ل","م","ن","هـ","و","ي"];
const ROUND_NAMES = ["","الأولى","الثانية","الثالثة","الرابعة","الخامسة","السادسة","السابعة","الثامنة","التاسعة","العاشرة"];
const TEAM_AR = { green: "الأخضر", orange: "البرتقالي" };
const ANSWER_SECONDS = 3;   // وقت الفريق الأول
const SECOND_SECONDS = 10;  // وقت لاعب الفريق الثاني بعد ضغطه
const MAX_PLAYERS = 50;

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
    } else if (type === "bell") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(392, t);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
      osc.start(); osc.stop(t + 1.8);
      [[784, 0.16], [1176, 0.1], [1568, 0.08], [2352, 0.05]].forEach(([f, g]) => {
        const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(f, t);
        gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
        o.connect(gn); gn.connect(audioCtx.destination); o.start(t); o.stop(t + 1.5);
      });
    } else if (type === "timeup") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.linearRampToValueAtTime(180, t + 0.6);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      osc.start(); osc.stop(t + 0.65);
    } else if (type === "leave") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.setValueAtTime(390, t + 0.14);
      osc.frequency.setValueAtTime(260, t + 0.28);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.start(); osc.stop(t + 0.5);
    } else if (type === "second") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(660, t);
      osc.frequency.setValueAtTime(990, t + 0.12);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(); osc.stop(t + 0.35);
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
  const label = soundEnabled ? "كتم أصوات اللعبة 🔊" : "تشغيل الأصوات 🔇";
  $("soundToggleBtn").textContent = label;
  if ($("pSoundBtn")) $("pSoundBtn").textContent = label;
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
  phase: "ready", winnerId: null, firstTeam: null, secondTeam: null, deadline: 0, total: 0,
  screen: "lobby", roundText: "", finalTitle: "", finalSub: "",
  menuPlayerId: null, lastBroadcast: 0
};

const P = {            // حالة اللاعب
  id: null, name: "", team: "green", ch: null, state: null, joined: false, timer: null, pingTimer: null, lastPhase: null, stage: 0, room: null, prevOffline: new Set(), boardSig: ""
};

let selectedJoinTeam = "green";
function loadSession() { try { return JSON.parse(sessionStorage.getItem("7rof_player") || "null"); } catch (e) { return null; } }
function saveSession() { try { sessionStorage.setItem("7rof_player", JSON.stringify({ room: P.room, id: P.id, name: P.name, team: P.team })); } catch (e) { /* ignore */ } }
function clearSession() { try { sessionStorage.removeItem("7rof_player"); } catch (e) { /* ignore */ } }

/* =====================  البداية  ===================== */
document.addEventListener("DOMContentLoaded", () => {
  const bg = $("bgPattern");
  for (let i = 0; i < 90; i++) {
    const s = document.createElement("span");
    s.textContent = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    bg.appendChild(s);
  }
  const params = new URLSearchParams(location.search);
  const room = params.get("room");
  if (room) {
    $("roomCode").value = room.toUpperCase();
    const sv = loadSession();
    if (sv && sv.room === room.toUpperCase()) {            // عودة لاعب بنفس الهوية
      $("playerName").value = sv.name; selectedJoinTeam = sv.team;
      openJoinRoom(); enterGame({ preventDefault() {} });
    } else openJoinRoom();
  }
  else if (params.get("qb")) { setTimeout(enterQuestionBankApp, 50); }
  document.addEventListener("click", () => { if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); }, { once: true });
});


/* =====================  الاتصال بين الأجهزة (PeerJS / WebRTC)  =====================
   المنظم = Peer معرّفه 7rof-رمز_الغرفة، واللاعبون يتصلون به مباشرة.
   إن لم تُحمَّل المكتبة يعود للعمل بين تبويبات نفس المتصفح فقط. */
const PEER_OPTS = { config: { iceServers: [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
] } };

function makeOrganizerChannel(code) {
  if (typeof Peer === "undefined") return new BroadcastChannel("7rof_" + code);
  const conns = new Set(), latest = {};
  const ch = {
    onmessage: null, onleave: null,
    postMessage(m) { conns.forEach(c => { if (c.open) { try { c.send(m); } catch (e) { /* ignore */ } } }); },
    close() { try { peer.destroy(); } catch (e) { /* ignore */ } }
  };
  const peer = new Peer("7rof-" + code, PEER_OPTS);
  peer.on("connection", c => {
    conns.add(c);
    c.on("data", d => {
      if (d && d.id) { c.playerId = d.id; latest[d.id] = c; }
      if (ch.onmessage) ch.onmessage({ data: d });
    });
    c.on("close", () => {
      conns.delete(c);
      if (c.playerId && latest[c.playerId] === c && ch.onleave) ch.onleave(c.playerId);
    });
  });
  peer.on("disconnected", () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
  peer.on("error", e => {
    if (e.type === "unavailable-id") toast("رمز الغرفة مستخدم، أغلق الغرفة وأنشئ غرفة جديدة");
    else toast("مشكلة اتصال بخادم الغرفة: " + e.type);
  });
  return ch;
}

function joinStatus(msg, bad) {
  const el = $("joinStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = bad ? "#ff8a95" : "#bdf5c8";
}

function peerErrorText(e) {
  switch (e.type) {
    case "peer-unavailable": return "✗ الغرفة غير موجودة أو أُغلقت — تأكد من الرمز (أحرف كبيرة وأرقام) وأن المنظم لم يحدّث صفحته.";
    case "network": case "server-error": case "socket-error": case "socket-closed":
      return "✗ تعذّر الوصول لخادم الاتصال (" + e.type + "). تحقق من الإنترنت، وأوقف VPN أو حاجب الإعلانات أو وضع توفير البيانات.";
    case "browser-incompatible": return "✗ هذا المتصفح لا يدعم الاتصال المباشر. جرّب Chrome أو Safari.";
    default: return "✗ خطأ اتصال: " + e.type;
  }
}

function makePlayerChannel(code) {
  if (typeof Peer === "undefined") { joinStatus("✗ لم تُحمَّل مكتبة الاتصال. تحقق من الإنترنت وحدّث الصفحة.", true); return new BroadcastChannel("7rof_" + code); }
  const queue = []; let conn = null;
  P.stage = 0;
  const ch = {
    onmessage: null,
    postMessage(m) { if (conn && conn.open) conn.send(m); else queue.push(m); },
    close() { try { peer.destroy(); } catch (e) { /* ignore */ } }
  };
  joinStatus("… جاري الاتصال بخادم الغرف");
  const peer = new Peer(undefined, PEER_OPTS);
  peer.on("open", () => {
    P.stage = 1;
    joinStatus("✓ تم الاتصال بالخادم … جاري الاتصال بالمنظم");
    conn = peer.connect("7rof-" + code, { reliable: true });
    conn.on("open", () => {
      P.stage = 2;
      joinStatus("✓ تم الاتصال بالمنظم … جاري التسجيل");
      queue.splice(0).forEach(m => conn.send(m));
    });
    conn.on("data", d => { if (ch.onmessage) ch.onmessage({ data: d }); });
    conn.on("error", e => joinStatus(peerErrorText(e), true));
    setTimeout(() => {
      const pc = conn && conn.peerConnection;
      if (pc) pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") joinStatus("✗ فشل الاتصال المباشر بالمنظم بسبب الشبكة. جرّب نفس شبكة الواي فاي التي عليها المنظم، وأوقف VPN.", true);
      };
    }, 300);
  });
  peer.on("disconnected", () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
  peer.on("error", e => joinStatus(peerErrorText(e), true));
  return ch;
}

/* =====================  إنشاء الغرفة  ===================== */
function openCreateRoom() {
  playSound("click");
  if (!R.code) createRoom();
  renderRoomModal();
  show("createRoomModal");
}

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // بدون أحرف متشابهة (O/0 و I/1/L)
function genCode() {
  const a = new Uint32Array(6);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.from(a, x => CODE_CHARS[x % CODE_CHARS.length]).join("");
}

function createRoom() {
  R.code = genCode();
  R.players = {}; R.kicked = new Set();
  resetBuzzState();
  R.url = location.href.split(/[?#]/)[0] + "?room=" + R.code;
  if (location.protocol === "file:") toast("افتح الموقع من رابط الاستضافة (GitHub Pages) ليعمل الباركود على جوالات اللاعبين");
  R.ch = makeOrganizerChannel(R.code);
  R.ch.onmessage = e => onOrganizerMessage(e.data);
  R.ch.onleave = id => markOffline(id);
  R.screen = "lobby";
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
  broadcastState();
}
function selectGrid(id) {
  playSound("click");
  setActive(["grid3", "grid4", "grid5"], id);
  G.size = id === "grid3" ? 3 : id === "grid4" ? 4 : 5;
  broadcastState();
}
function selectRound(n) {
  playSound("click");
  G.target = n;
  broadcastState();
  setActive(["round1", "round2", "round3", "round5"], n === 5 ? "round5" : n === 3 ? "round1" : n === 2 ? "round2" : "round3");
}

/* =====================  بدء اللعبة  ===================== */
function startGame() {
  playSound("score");
  if (!R.code) createRoom();
  hide("createRoomModal");
  hide("mainMenuCard");
  G.score = { green: 0, orange: 0 };
  G.round = 1;
  Object.values(R.players).forEach(p => { p.points = 0; });
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
  broadcastState();
}

function showRoundTransitionScreen() {
  $("roundTitleText").textContent = `الجولة ${ROUND_NAMES[G.round] || G.round}`;
  show("roundTransitionScreen");
  hide("gameScreen");
  R.screen = "round"; R.roundText = $("roundTitleText").textContent;
  broadcastState();
}

function startActualRound() {
  playSound("click");
  hide("roundTransitionScreen");
  show("gameScreen");
  $("currentRoundBadge").textContent = `الجولة ${ROUND_NAMES[G.round] || G.round}`;
  buildHexGrid(G.size);
  R.screen = "game";
  broadcastState();
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
  broadcastState();
}

function onCellClick(r, c) {
  playSound("click");
  if (G.sel && G.sel.r === r && G.sel.c === c) setSelection(null);
  else setSelection({ r, c });
}

/* تلوين الخلية المحددة لفريق */
function colorSelectedCell(team, pid) {
  if (!G.sel) { toast("اختر حرفاً من الخلية أولاً بالضغط عليه"); return; }
  playSound("score");
  const { r, c } = G.sel;
  // النقطة للاعب: الذي اخترته، أو الذي ضغط الزر أولاً إن كان من نفس الفريق
  let credit = pid || null;
  if (!credit && R.phase !== "ready" && R.players[R.winnerId] && R.players[R.winnerId].team === team) credit = R.winnerId;
  if (credit && R.players[credit]) R.players[credit].points = (R.players[credit].points || 0) + 1; else credit = null;
  G.history.push({ r, c, prev: G.grid[r][c].state, team, pid: credit });
  G.grid[r][c].state = team;
  setSelection(null);
  refreshCell(r, c);
  const el = cellEl(r, c);
  if (el) el.classList.add("pulse");
  renderPlayersPanel();
  broadcastState();

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
    if (last.pid && R.players[last.pid]) R.players[last.pid].points = Math.max(0, (R.players[last.pid].points || 0) - 1);
    renderPlayersPanel();
  }
  G.pendingWinner = null;
  broadcastState();
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
    R.screen = "final"; R.finalTitle = $("finalTitle").textContent; R.finalSub = $("finalSub").textContent;
    broadcastState();
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
    broadcastState();
  }
}

function backToRoom() {
  playSound("click");
  hide("gameScreen"); hide("roundTransitionScreen"); hide("winModal");
  document.body.classList.remove("has-selection");
  R.screen = "lobby"; resetBuzzState();
  G.score = { green: 0, orange: 0 }; G.round = 1; updateScoreUI();
  show("mainMenuCard", "block");
  if (R.code) { renderRoomModal(); show("createRoomModal"); }
  broadcastState();
}

/* =====================  البازر: حالة المنظم  =====================
   ready      : الكل أزرق جاهز
   answering  : أول ضاغط (فريق ١) معه 3 ثوانٍ فقط
   expired    : انتهت الثواني — فريقه مقفل حتى يعيد المنظم الضبط
   second     : المنظم فتح +10ث: أزرار الفريق الآخر بيضاء (10) بانتظار الضغط
   answering2 : لاعب من الفريق الثاني ضغط — عدّاد 10 ثوانٍ
   closed     : انتهت الـ 10 — الكل مقفل حتى إعادة الضبط */
const MIC_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" fill="#fff"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>';

function resetBuzzState() {
  R.phase = "ready"; R.winnerId = null; R.firstTeam = null; R.secondTeam = null; R.deadline = 0; R.total = 0;
}

function resetButtons() {
  playSound("click");
  resetBuzzState();
  organizerUpdate();
}

/* إعادة ضبط +10ث: يبدأ عدّاد 10 ثوانٍ تلقائياً للفريق الآخر فقط، ولأي لاعب منهم أن يضغط ويجيب */
function resetSecondChance() {
  playSound("click");
  if ((R.phase !== "answering" && R.phase !== "expired") || !R.firstTeam) {
    toast("تُستخدم بعد أن يضغط لاعب من الفريق الأول");
    return;
  }
  R.secondTeam = R.firstTeam === "green" ? "orange" : "green";
  R.phase = "second"; R.total = SECOND_SECONDS * 1000; R.deadline = Date.now() + R.total;
  playSound("second");
  organizerUpdate();
}

function startAnswering(id) {          // الفريق الأول: 3 ثوانٍ
  const p = R.players[id];
  R.winnerId = id; R.phase = "answering"; R.firstTeam = p.team; R.secondTeam = null;
  R.total = ANSWER_SECONDS * 1000; R.deadline = Date.now() + R.total;
  playSound("buzz");
  organizerUpdate();
}

function handlePress(id) {
  const p = R.players[id];
  if (!p || p.offlineAt) return;
  if (R.phase === "ready") startAnswering(id);
  else if (R.phase === "second" && p.team === R.secondTeam) {
    // عدّاد الـ10 ثوانٍ يستمر دون إعادة تشغيل؛ هذا اللاعب هو من يجيب
    R.winnerId = id; R.phase = "answering2";
    playSound("buzz");
    organizerUpdate();
  }
}

/* ===== الحضور: انقطاع لاعب => رمادي 10 ثوانٍ ثم يُطرد ===== */
const RETURN_GRACE_MS = 10000, HEARTBEAT_TIMEOUT_MS = 6000;

function markOffline(id) {
  const p = R.players[id];
  if (!p || p.offlineAt) return;
  p.offlineAt = Date.now(); p.lastSeen = 0;
  playSound("leave");
  toast("⚠ " + p.name + " غادر — لديه 10 ثوانٍ للعودة");
  organizerUpdate();
}

function touchPlayer(id) {
  const p = R.players[id];
  if (!p) return;
  p.lastSeen = Date.now();
  if (p.offlineAt) { p.offlineAt = null; playSound("click"); toast("✓ عاد " + p.name); organizerUpdate(); }
}

function organizerTick() {
  const now = Date.now();
  let changed = false;
  Object.values(R.players).forEach(p => {
    if (!p.offlineAt && p.lastSeen && now - p.lastSeen > HEARTBEAT_TIMEOUT_MS) { markOffline(p.id); }
    else if (p.offlineAt && now - p.offlineAt > RETURN_GRACE_MS) {
      R.kicked.add(p.id); delete R.players[p.id];
      if (R.winnerId === p.id) R.winnerId = null;
      playSound("leave"); toast("🚪 تم طرد " + p.name + " لعدم العودة");
      changed = true;
    }
  });
  if (R.phase === "answering" && now > R.deadline) { playSound("bell"); R.phase = "expired"; changed = true; }
  else if ((R.phase === "second" || R.phase === "answering2") && now > R.deadline) { playSound("bell"); R.phase = "closed"; changed = true; }
  if (changed) organizerUpdate();
  else if (now - R.lastBroadcast > 1000) broadcastState();
}

function organizerUpdate() {
  renderPlayersPanel();
  renderRoomPlayers();
  broadcastState();
}

function gameSnapshot() {
  return {
    screen: R.screen, roundText: R.roundText, finalTitle: R.finalTitle, finalSub: R.finalSub,
    round: G.round, score: G.score, mode: G.mode, size: G.size, target: G.target,
    organizer: ($("organizerName") && $("organizerName").value.trim()) || "المنظم",
    grid: G.grid.map(r => r.map(c => c.letter + "|" + c.state[0])), sel: G.sel
  };
}

function broadcastState() {
  if (!R.ch) return;
  R.lastBroadcast = Date.now();
  const w = R.players[R.winnerId], now = Date.now();
  R.ch.postMessage({
    t: "state", room: R.code,
    players: Object.values(R.players).map(p => ({ id: p.id, name: p.name, team: p.team, points: p.points || 0, offline: !!p.offlineAt })),
    kicked: [...R.kicked],
    phase: R.phase, winnerId: R.winnerId, winnerName: w ? w.name : "", firstTeam: R.firstTeam, secondTeam: R.secondTeam,
    total: R.total, remain: Math.max(0, R.deadline - now),
    game: gameSnapshot()
  });
}

function onOrganizerMessage(m) {
  if (!m) return;
  if (m.t === "join") {
    if (R.kicked.has(m.id)) { broadcastState(); return; }
    const existing = R.players[m.id];
    if (!existing && Object.keys(R.players).length >= MAX_PLAYERS) return;
    R.players[m.id] = { id: m.id, name: String(m.name).slice(0, 14), team: m.team === "orange" ? "orange" : "green",
                        points: existing ? existing.points || 0 : 0, lastSeen: Date.now(), offlineAt: null };
    if (!existing) playSound("click");
    else if (existing.offlineAt) { playSound("click"); toast("✓ عاد " + existing.name); }
    organizerUpdate();
  } else if (m.t === "ping") touchPlayer(m.id);
  else if (m.t === "press") { touchPlayer(m.id); handlePress(m.id); }
  else if (m.t === "leave") markOffline(m.id);
}

/* حالة زر لاعب بحسب حالة الغرفة (تُستخدم عند المنظم واللاعب) */
function stateDeadline(state) { return state.localDeadline !== undefined ? state.localDeadline : state.deadline; }

function buzzStateFor(state, p, now) {
  if (p.offline || p.offlineAt) return { cls: "gray", label: "", text: "غير متصل", canPress: false };
  const mine = state.winnerId === p.id;
  const secs = Math.max(0, Math.ceil((stateDeadline(state) - now) / 1000));
  switch (state.phase) {
    case "ready": return { cls: "blue", label: "", text: "جاهز! اضغط عند معرفة الإجابة", canPress: true };
    case "answering":
    case "answering2": return mine
      ? { cls: "green", label: String(secs), mic: true, text: "أنت الأسرع! أجب الآن", canPress: false }
      : { cls: "orange", label: "", text: "مقفل — سبقك لاعب آخر", canPress: false };
    case "expired": return mine
      ? { cls: "red", label: "", text: "انتهى وقتك — مقفل حتى يسمح المنظم", canPress: false }
      : { cls: "orange", label: "", text: "مقفل — بانتظار المنظم", canPress: false };
    case "second":
      if (p.team === state.secondTeam) return { cls: "white", label: String(secs), text: "فرصة ثانية! اضغط للإجابة قبل انتهاء العدّاد", canPress: true };
      return mine ? { cls: "red", label: "", text: "مقفل", canPress: false } : { cls: "orange", label: "", text: "مقفل", canPress: false };
    case "closed": return { cls: "red", label: "", text: "انتهى الوقت", canPress: false };
  }
  return { cls: "blue", label: "", text: "", canPress: false };
}

/* لوحة اللاعبين عند المنظم: الدائرة الزرقاء؛ من ضغط أولاً يظهر فيها مايك واسمه */
function renderPlayersPanel() {
  const list = Object.values(R.players);
  $("playersCountTxt").textContent = `${list.length}/${MAX_PLAYERS}`;
  const now = Date.now();
  const st = { phase: R.phase, winnerId: R.winnerId, firstTeam: R.firstTeam, secondTeam: R.secondTeam, deadline: R.deadline };
  $("playerBubbles").innerHTML = "";
  list.forEach(p => {
    const b = buzzStateFor(st, p, now);
    const btn = document.createElement("button");
    btn.className = `pb team-${p.team}` + (b.mic ? " is-first" : "");
    const offSecs = p.offlineAt ? Math.max(0, Math.ceil((RETURN_GRACE_MS - (now - p.offlineAt)) / 1000)) : 0;
    btn.innerHTML = `<div class="pb-circle st-${b.cls}">${b.mic ? MIC_SVG : (p.offlineAt ? offSecs : b.label)}</div>` +
      (p.points ? `<span class="pb-pts">${p.points}</span>` : "") + `<span class="pb-name">${escapeHtml(p.name)}</span>`;
    btn.onclick = () => onPlayerBubbleClick(p.id);
    $("playerBubbles").appendChild(btn);
  });
}

setInterval(() => { if (R.code && (R.phase === "answering" || R.phase === "second" || R.phase === "answering2" || Object.values(R.players).some(p => p.offlineAt))) renderPlayersPanel(); }, 300);

/* =====================  العدّاد الظاهر للجميع  =====================
   الثلاث ثوانٍ: حلقة متدرجة (فيديو 1) — العشر ثوانٍ: ساعة إيقاف (فيديو 2) */
function ringSvg(frac, secs) {
  const r = 50, C = 2 * Math.PI * r;
  return `<svg class="cd-svg" viewBox="0 0 120 120" width="120" height="120">
    <defs><linearGradient id="cdGrad" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#ffeb3b"/><stop offset=".3" stop-color="#ef4444"/>
      <stop offset=".55" stop-color="#e91e8c"/><stop offset=".8" stop-color="#5b2ea6"/><stop offset="1" stop-color="#0ea5e9"/>
    </linearGradient></defs>
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="#262626" stroke-width="7"/>
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="url(#cdGrad)" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)"/>
    <text x="60" y="71" text-anchor="middle" font-size="32" font-weight="900" fill="#fff" font-family="Tajawal,sans-serif">0:${String(secs).padStart(2, "0")}</text>
  </svg>`;
}

function watchSvg(frac, secs) {
  const a = 2 * Math.PI * (1 - frac), x = 60 + 44 * Math.sin(a), y = 78 - 44 * Math.cos(a);
  const pie = (1 - frac) < 0.002 ? "" :
    (1 - frac) > 0.998 ? `<circle cx="60" cy="78" r="44" fill="#2b1245"/>` :
    `<path d="M60 78 L60 34 A44 44 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z" fill="#2b1245"/>`;
  return `<svg class="cd-svg" viewBox="0 0 120 140" width="120" height="140">
    <rect x="48" y="2" width="24" height="9" rx="3" fill="#ffeb3b"/><rect x="56" y="10" width="8" height="12" fill="#ffeb3b"/>
    <circle cx="60" cy="78" r="54" fill="none" stroke="#ffeb3b" stroke-width="8"/>
    <circle cx="60" cy="78" r="44" fill="#fff"/>${pie}
    <text x="60" y="94" text-anchor="middle" font-size="46" font-weight="900" fill="#fff" stroke="#2b1245" stroke-width="7" paint-order="stroke" font-family="Tajawal,sans-serif">${secs}</text>
  </svg>`;
}

function renderCountdown() {
  const box = $("countdownBox");
  let st = null;
  if (P.joined && P.state) {
    st = { phase: P.state.phase, deadline: P.state.localDeadline, total: P.state.total, name: P.state.winnerName };
  } else if (R.code && $("gameScreen").style.display === "flex") {
    st = { phase: R.phase, deadline: R.deadline, total: R.total, name: (R.players[R.winnerId] || {}).name };
  }
  if (!st || (st.phase !== "answering" && st.phase !== "second" && st.phase !== "answering2")) { box.style.display = "none"; return; }
  const remain = Math.max(0, st.deadline - Date.now());
  const frac = Math.min(1, remain / (st.total || 1));
  const secs = Math.ceil(remain / 1000);
  box.style.display = "flex";
  const name = (st.name && st.phase !== "second") ? `<div class="cd-name">${MIC_SVG}<span>${escapeHtml(st.name)}</span></div>` : "";
  box.innerHTML = (st.phase === "answering" ? ringSvg(frac, secs) : watchSvg(frac, secs)) + name;
}
setInterval(renderCountdown, 100);

function onPlayerBubbleClick(id) {
  const p = R.players[id];
  if (!p) return;
  if (G.sel) { colorSelectedCell(p.team, id); return; }   // أثناء تحديد حرف: احتساب النقطة لفريقه
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
  const code = $("roomCode").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const name = $("playerName").value.trim();
  if (!code || !name) return;

  const sv = loadSession();
  P.id = (sv && sv.room === code && sv.id) ? sv.id : uid();
  P.room = code; P.name = name; P.team = selectedJoinTeam; P.joined = false; P.state = null;
  if (P.ch) P.ch.close();
  P.ch = makePlayerChannel(code);
  P.ch.onmessage = e => onPlayerMessage(e.data);
  sendJoin();
  setTimeout(() => {
    if (!P.joined) {
      if (P.stage === 0) joinStatus("✗ لم يصل الجوال إلى خادم الاتصال خلال 12 ثانية. تحقق من الإنترنت وأوقف VPN/حاجب الإعلانات، ثم حدّث الصفحة وجرّب مرة أخرى.", true);
      else if (P.stage === 1) joinStatus("✗ وصل الجوال للخادم لكن لم يتصل بالمنظم. غالباً بسبب الشبكة: جرّب نفس واي فاي المنظم (لا بيانات الجوال)، أو تأكد من الرمز.", true);
      else joinStatus("✗ اتصل بالمنظم لكن لم يُسجَّل. اضغط دخول مرة أخرى.", true);
      if (P.ch) { P.ch.close(); P.ch = null; }
    }
  }, 12000);
}

function sendJoin() { if (P.ch) P.ch.postMessage({ t: "join", id: P.id, name: P.name, team: P.team }); }

function onPlayerMessage(m) {
  if (!m) return;
  if (m.t === "closed") { toast("تم إغلاق الغرفة"); leaveToMenu(); return; }
  if (m.t !== "state") return;
  if (m.kicked && m.kicked.includes(P.id)) { toast("تم إخراجك من الغرفة (طرد أو انتهاء مهلة العودة)"); clearSession(); leaveToMenu(); return; }
  const me = m.players.find(p => p.id === P.id);
  if (!me) { if (!P.joined || P.state) sendJoin(); return; }
  m.localDeadline = Date.now() + (m.remain || 0);
  m.players.forEach(pl => {                      // تنبيه عند انقطاع أي لاعب
    if (pl.offline && !P.prevOffline.has(pl.id) && pl.id !== P.id) { playSound("leave"); toast("⚠ " + pl.name + " غادر — لديه 10 ثوانٍ للعودة"); }
  });
  P.prevOffline = new Set(m.players.filter(pl => pl.offline).map(pl => pl.id));
  P.state = m; P.team = me.team;
  if (!P.joined) {
    P.joined = true;
    joinStatus("");
    hide("joinRoomModal"); hide("mainMenuCard");
    show("playerScreen");
    saveSession();
    P.timer = setInterval(renderPlayerScreen, 200);
    P.pingTimer = setInterval(() => { if (P.ch && P.joined) P.ch.postMessage({ t: "ping", id: P.id }); }, 2000);
  }
  renderPlayerScreen();
}

const SETTINGS_MODES = [["both", "خلية الحروف + أزرار"], ["buttons", "أزرار فقط"], ["cells", "خلية حروف فقط"]];

function renderPlayerLobby(st, g) {
  $("pLobbyCount").textContent = `${st.players.length}/${MAX_PLAYERS}`;
  $("pLobbyPlayers").innerHTML = st.players.map(p => `<span class="rp-chip ${p.offline ? "gray" : p.team}">${escapeHtml(p.name)}</span>`).join("");
  const on = (c) => c ? " active" : "";
  $("pSettings").innerHTML =
    `<div class="setting-group"><label class="setting-label">نمط اللعب:</label><div class="options-row">` +
      SETTINGS_MODES.map(([k, l]) => `<button class="opt-btn${on(g.mode === k)}">${l}</button>`).join("") + `</div></div>` +
    `<div class="setting-group"><label class="setting-label">اسم المنظم:</label><div class="form-input">${escapeHtml(g.organizer || "المنظم")}</div></div>` +
    `<div class="setting-group"><label class="setting-label">حجم الخلية:</label><div class="grid-size-row">` +
      [3, 4, 5].map(n => `<button class="grid-opt-btn${on(g.size === n)}"><span class="grid-title">${n}x${n}</span></button>`).join("") + `</div></div>` +
    `<div class="setting-group"><label class="setting-label">عدد الجولات للفوز:</label><div class="rounds-row">` +
      [[1, "جولة"], [2, "جولتين"], [3, "ثلاث"], [5, "5 جولات"]].map(([n, l]) => `<button class="round-btn${on(g.target === n)}">${l}</button>`).join("") + `</div></div>`;
}

function renderMiniBoard(g) {
  const sig = JSON.stringify([g.grid, g.sel, g.size]);
  if (sig === P.boardSig) return;
  P.boardSig = sig;
  const rows = g.grid.map((row, r) =>
    `<div class="hex-row${r % 2 ? " offset-row" : ""}">` + row.map((cell, c) => {
      const [l, st] = cell.split("|");
      const cls = st === "g" ? " green" : st === "o" ? " orange" : "";
      const sel = g.sel && g.sel.r === r && g.sel.c === c ? " sel" : "";
      return `<div class="hex${cls}${sel}"><div class="hex-in">${l}</div></div>`;
    }).join("") + `</div>`).join("");
  $("pBoard").innerHTML = `<div class="game-board-frame"><div class="hex-grid-wrapper">${rows}</div></div>`;
}

function renderPlayerGame(st, g, me) {
  const now = Date.now();
  const b = buzzStateFor(st, me, now);
  $("buzzerBtn").className = `buzzer t-${me.team} b-${b.cls}`;
  $("buzzerLabel").innerHTML = b.mic ? MIC_SVG.replace('width="24" height="24"', 'width="90" height="90"') : b.label;
  $("buzzerStatus").textContent = b.text;
  $("buzzerPts").textContent = me.points || 0;
  $("pMyName").textContent = P.name;
  $("pGreenScore").textContent = g.score.green; $("pOrangeScore").textContent = g.score.orange;
  $("pRoundBadge").textContent = `الجولة ${ROUND_NAMES[g.round] || g.round}`;
  $("pBoard").style.display = g.mode === "buttons" ? "none" : "block";
  $("buzzerHolder").style.display = g.mode === "cells" ? "none" : "block";
  $("buzzerStatus").style.display = g.mode === "cells" ? "none" : "block";
  if (g.mode !== "buttons") renderMiniBoard(g);
  $("pOthers").style.display = g.mode === "cells" ? "none" : "flex";
  $("pOthers").innerHTML = st.players.filter(p => p.id !== P.id).map(p => {
    const bs = buzzStateFor(st, p, now);
    return `<div class="op team-${p.team}${p.offline ? " gray" : ""}"><div class="op-circle st-${bs.cls}">${bs.mic ? MIC_SVG.replace('width="24" height="24"', 'width="26" height="26"') : bs.label}</div>` +
      `<span class="op-pts">${p.points || 0}</span><span class="op-name">${escapeHtml(p.name)}</span></div>`;
  }).join("");
}

function renderPlayerScreen() {
  if (!P.state) return;
  const st = P.state, g = st.game || { screen: "lobby", mode: "both", size: 5, target: 2, organizer: "المنظم", grid: [], score: { green: 0, orange: 0 } };
  const me = st.players.find(p => p.id === P.id) || { id: P.id, team: P.team, points: 0 };
  ["pLobby", "pRound", "pGame", "pFinal"].forEach(id => { $(id).style.display = "none"; });
  if (g.screen === "round") { $("pRound").style.display = "flex"; $("pRoundTitle").textContent = g.roundText; }
  else if (g.screen === "game") { $("pGame").style.display = "flex"; renderPlayerGame(st, g, me); }
  else if (g.screen === "final") { $("pFinal").style.display = "flex"; $("pFinalTitle").textContent = g.finalTitle; $("pFinalSub").textContent = g.finalSub; }
  else { $("pLobby").style.display = "flex"; renderPlayerLobby(st, g); }

  const ph = st.phase, was = P.lastPhase;
  if (ph !== was) {
    if (ph === "answering") playSound("buzz");
    if (ph === "answering2" && was === "second") playSound("buzz");
    if ((was === "answering" || was === "answering2") && (ph === "expired" || ph === "closed")) playSound("bell");
    if (was === "second" && ph === "closed") playSound("bell");
    if (ph === "second") playSound("second");
    P.lastPhase = ph;
  }
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

window.addEventListener("pagehide", () => { if (P.joined && P.ch) P.ch.postMessage({ t: "leave", id: P.id }); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && P.joined && P.ch) { sendJoin(); P.ch.postMessage({ t: "ping", id: P.id }); } });

function leaveToMenu() {
  clearInterval(P.timer); clearInterval(P.pingTimer);
  if (P.ch) { P.ch.close(); P.ch = null; }
  P.joined = false; P.state = null; P.lastPhase = null; P.boardSig = ""; P.prevOffline = new Set();
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
    new QRCode(el, { text: location.href.split(/[?#]/)[0] + "?qb=1", width: 120, height: 120, colorDark: "#1a1a1a", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
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