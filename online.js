/* =====================  online.js  =====================
   يُحمَّل بعد script.js ويستبدل: طبقة الاتصال (MQTT بدل PeerJS)، وشاشة اللاعب.
   لا يحتاج لتعديل script.js إطلاقاً. */
(function () {
  "use strict";

  /* ---------- 1) طبقة الاتصال: وسيط MQTT عبر WebSocket (يعمل من أي شبكة) ---------- */
  const BROKERS = [
    "wss://broker.emqx.io:8084/mqtt",
    "wss://broker.hivemq.com:8884/mqtt",
    "wss://test.mosquitto.org:8081"
  ];
  const mid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  function makeNet(code, role, onBroker) {
    const base = "7rof2/" + code;
    const subT = base + (role === "org" ? "/up" : "/down");
    const pubT = base + (role === "org" ? "/down" : "/up");
    const clients = [], seen = new Set();
    let closed = false;
    const ch = {
      onmessage: null,
      get online() { return clients.some(c => c.connected); },
      postMessage(m) {
        if (closed) return;
        const s = JSON.stringify(Object.assign({ mid: mid() }, m));
        clients.forEach(c => { if (c.connected) { try { c.publish(pubT, s, { qos: 0 }); } catch (e) { /* ignore */ } } });
      },
      close() {
        closed = true; ch.onmessage = null;
        setTimeout(() => clients.forEach(c => { try { c.end(); } catch (e) { /* ignore */ } }), 600);
      }
    };
    BROKERS.forEach(url => {
      let c;
      try { c = mqtt.connect(url, { clientId: "7rof_" + mid(), clean: true, reconnectPeriod: 2000, connectTimeout: 8000, keepalive: 30 }); }
      catch (e) { return; }
      clients.push(c);
      c.on("connect", () => { c.subscribe(subT, { qos: 0 }); if (onBroker) onBroker(); });
      c.on("error", () => { /* ignore */ });
      c.on("message", (t, payload) => {
        if (closed) return;
        let m; try { m = JSON.parse(new TextDecoder().decode(payload)); } catch (e) { return; }
        if (m.mid) {
          if (seen.has(m.mid)) return;
          seen.add(m.mid);
          if (seen.size > 500) seen.delete(seen.values().next().value);
        }
        if (ch.onmessage) ch.onmessage({ data: m });
      });
    });
    return ch;
  }

  let joinRetry = null;

  window.makeOrganizerChannel = function (code) {
    if (typeof mqtt === "undefined") { toast("تعذر تحميل مكتبة الاتصال، تحقق من الإنترنت وحدّث الصفحة"); return new BroadcastChannel("7rof_" + code); }
    const ch = makeNet(code, "org");
    setTimeout(() => { if (!ch.online) toast("تعذر الاتصال بخادم الغرفة. تحقق من الإنترنت وأوقف VPN/حاجب الإعلانات"); }, 10000);
    return ch;
  };

  window.makePlayerChannel = function (code) {
    if (typeof mqtt === "undefined") { joinStatus("✗ لم تُحمَّل مكتبة الاتصال. تحقق من الإنترنت وحدّث الصفحة.", true); return new BroadcastChannel("7rof_" + code); }
    P.stage = 0;
    return makeNet(code, "pl", () => { if (P.stage < 1) { P.stage = 1; joinStatus("✓ تم الاتصال بالخادم … جاري البحث عن الغرفة"); } });
  };

  window.enterGame = function (event) {
    event.preventDefault();
    playSound("score");
    const code = $("roomCode").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const name = $("playerName").value.trim();
    if (!code || !name) return;
    P.id = P.id || uid(); P.name = name; P.team = selectedJoinTeam; P.joined = false; P.state = null; P.stage = 0;
    if (P.ch) P.ch.close();
    clearInterval(joinRetry);
    joinStatus("… جاري الاتصال بخادم الغرف");
    P.ch = makePlayerChannel(code);
    P.ch.onmessage = e => onPlayerMessage(e.data);
    joinRetry = setInterval(() => { if (P.joined) clearInterval(joinRetry); else sendJoin(); }, 1500);
    setTimeout(() => {
      if (P.joined) return;
      clearInterval(joinRetry);
      joinStatus(P.stage === 0
        ? "✗ لم يصل الجوال إلى خادم الاتصال. تحقق من الإنترنت وأوقف VPN/حاجب الإعلانات ثم حدّث الصفحة."
        : "✗ الغرفة غير موجودة أو أُغلقت. تأكد من الرمز وأن المنظم لم يحدّث صفحته.", true);
      if (P.ch) { P.ch.close(); P.ch = null; }
    }, 15000);
  };

  /* ---------- 2) المنظم: بث كامل الحالة (الشاشة، الجولة، النتيجة، الخلية، المحدد) ---------- */
  window.broadcastState = function () {
    if (!R.ch) return;
    R.lastBroadcast = Date.now();
    const w = R.players[R.winnerId];
    const gs = $("gameScreen").style.display === "flex";
    const rs = $("roundTransitionScreen").style.display === "flex";
    R.ch.postMessage({
      t: "state", room: R.code, players: Object.values(R.players), kicked: [...R.kicked],
      phase: R.phase, winnerId: R.winnerId, winnerName: w ? w.name : "", firstTeam: R.firstTeam, secondTeam: R.secondTeam,
      total: R.total, remain: Math.max(0, R.deadline - Date.now()),
      screen: gs ? "game" : rs ? "round" : "lobby",
      roundName: "الجولة " + (ROUND_NAMES[G.round] || G.round),
      score: G.score, mode: G.mode,
      grid: G.grid.length ? G.grid.map(row => row.map(c => c.letter + "|" + c.state[0])) : null,
      sel: G.sel
    });
  };

  ["setSelection", "buildHexGrid", "executeClear", "cancelLastMove", "saveAndNextRound", "startActualRound",
    "showRoundTransitionScreen", "backToRoom", "updateScoreUI", "finishMatch"].forEach(n => {
    const f = window[n];
    if (typeof f !== "function") return;
    window[n] = function () { const r = f.apply(this, arguments); try { broadcastState(); } catch (e) { /* ignore */ } return r; };
  });

  const _start = window.startGame;
  window.startGame = function () {
    Object.values(R.players).forEach(p => { p.pts = 0; });
    const r = _start.apply(this, arguments); broadcastState(); return r;
  };

  /* نقاط كل لاعب: تُحتسب عند الضغط على اسمه أثناء تحديد حرف */
  const _color = window.colorSelectedCell;
  window.colorSelectedCell = function (team) {
    const had = !!G.sel, pid = R.pendingPid; R.pendingPid = null;
    const r = _color.apply(this, arguments);
    if (had && pid && R.players[pid]) { R.players[pid].pts = (R.players[pid].pts || 0) + 1; renderPlayersPanel(); }
    broadcastState();
    return r;
  };
  window.onPlayerBubbleClick = function (id) {
    const p = R.players[id];
    if (!p) return;
    if (G.sel) { R.pendingPid = id; colorSelectedCell(p.team); return; }
    R.menuPlayerId = id;
    $("playerMenuName").textContent = p.name;
    show("playerMenuModal");
  };

  window.renderGameQr = function () { const c = $("gameQrCard"); if (c) c.style.display = "none"; };   // الباركود غير مطلوب داخل اللعبة

  window.toggleSound = function () {
    soundEnabled = !soundEnabled;
    document.querySelectorAll("#soundToggleBtn,.snd-btn").forEach(b => { b.textContent = soundEnabled ? "كتم أصوات اللعبة 🔊" : "تشغيل الأصوات 🔇"; });
    playSound("click");
  };

  /* ---------- 3) واجهة اللاعب ---------- */
  const old = $("playerScreen"); if (old) old.remove();
  const oldQr = $("gameQrCard"); if (oldQr) oldQr.remove();

  const css = document.createElement("style");
  css.textContent = `
  .round-screen.player-mode .start-round-btn{display:none}
  .round-wait-note{position:absolute;bottom:56px;left:0;right:0;text-align:center;font-weight:700;font-size:.95rem;color:#fff}
  .pg{display:none;position:fixed;inset:0;background:var(--bg);z-index:200;flex-direction:column;padding:12px 16px;overflow:auto}
  .pg.center{align-items:center;justify-content:center;gap:18px;text-align:center;z-index:250}
  .pg-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
  .pg-main{flex:1;display:flex;direction:ltr;flex-wrap:wrap;gap:16px;justify-content:space-around;align-items:flex-start;padding:12px 0}
  #pBoard{--hw:clamp(30px,min(7.5vw,9vh),46px)}
  #pBoard .hex{cursor:default}
  .pg-others{flex:1;min-width:180px;display:flex;flex-wrap:wrap;gap:14px;justify-content:center;align-content:flex-start;direction:rtl}
  .pg .pb{width:84px;cursor:default}
  .pg .pb-circle{position:relative;width:68px;height:68px;box-shadow:0 0 0 5px #1b1b1b,0 4px 10px rgba(0,0,0,.4)}
  .pg .pb-name{font-size:.85rem;max-width:84px;font-weight:700}
  .pb-badge,.pz-badge{position:absolute;top:-8px;right:-8px;min-width:24px;height:24px;border-radius:12px;background:#fff;color:#2b1245;font-size:.8rem;font-weight:900;display:flex;align-items:center;justify-content:center;padding:0 5px;box-shadow:0 2px 6px rgba(0,0,0,.4)}
  .pg-foot{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:12px;padding-top:8px}
  .pg-foot .score-card{width:min(300px,100%);justify-self:end}
  .pg .score-box{cursor:default}
  .pg-buzz{display:flex;flex-direction:column;align-items:center;gap:10px}
  .pbz{--ring:#2ecc71;--st:#1e88e5;position:relative;width:min(44vw,34vh,270px);height:min(44vw,34vh,270px);border:0;border-radius:50%;padding:9%;background:#1b1b1b;box-shadow:0 12px 0 #000,0 20px 36px rgba(0,0,0,.45);cursor:pointer;transition:transform .08s}
  .pbz:active{transform:translateY(7px)}
  .pbz-core{box-sizing:border-box;width:100%;height:100%;border-radius:50%;border:clamp(8px,2.2vw,14px) solid var(--ring);background:var(--st);display:flex;align-items:center;justify-content:center;font-size:clamp(2rem,9vh,4.5rem);font-weight:900;color:#fff}
  .pbz.s-blue{--st:#1e88e5}.pbz.s-green{--st:#2ecc71}.pbz.s-orange{--st:#ff6b00}.pbz.s-red{--st:#d9534f}.pbz.s-white{--st:#fff}
  .pbz.s-white .pbz-core{color:#111}
  .pbz.t-green{--ring:#2ecc71}.pbz.t-orange{--ring:#f57c00}
  .pbz .pz-badge{top:4%;right:6%;min-width:34px;height:34px;border-radius:17px;font-size:1.1rem}
  .pg-status{font-size:1.1rem;font-weight:900;color:var(--yellow);min-height:1.5em;text-align:center}
  .pg-me{font-size:.85rem;color:#e2d9f3;font-weight:700}
  @media(max-width:700px){.pg-foot{grid-template-columns:1fr}.pg-buzz{order:1}.pg-foot .score-card{order:2;justify-self:center}.pg-foot>div:last-child{display:none}}
  `;
  document.head.appendChild(css);

  const rs = $("roundTransitionScreen");
  const note = document.createElement("div");
  note.id = "roundWaitNote"; note.className = "round-wait-note"; note.style.display = "none";
  note.textContent = "بانتظار المنظم لبدء الجولة";
  rs.appendChild(note);

  const BRAND = '<div class="brand"><span class="b1">حروف</span><span class="b2">مع</span><span class="b3">منديلي</span></div>';
  document.body.insertAdjacentHTML("beforeend", `
  <div id="pLobby" class="pg center">
    <div class="brand big"><span class="b1">حروف</span><span class="b2">مع</span><span class="b3">منديلي</span></div>
    <div class="player-top"><div class="player-name-tag" id="pLobName">—</div><div class="player-team-tag" id="pLobTeam">—</div></div>
    <div class="pg-status">تم انضمامك! بانتظار المنظم لبدء اللعبة</div>
    <button class="btn btn-secondary" onclick="openHowToPlay()">شرح اللعب</button>
    <button class="btn btn-secondary" onclick="playerLeave()">خروج من الغرفة</button>
  </div>
  <div id="pGame" class="pg">
    <div class="pg-top">
      ${BRAND}
      <div class="top-center-btns">
        <button class="top-btn snd-btn" onclick="toggleSound()">كتم أصوات اللعبة 🔊</button>
        <button class="top-btn" onclick="openHowToPlay()">شرح اللعب</button>
        <button class="top-btn" onclick="playerLeave()">خروج</button>
      </div>
    </div>
    <div class="pg-main">
      <div class="game-board-frame" id="pBoard"><div class="hex-grid-wrapper" id="pHexGrid"></div></div>
      <div class="pg-others" id="pOthers"></div>
    </div>
    <div class="pg-foot">
      <div class="score-card">
        <div class="score-header"><span>نتائج الجولات</span><span class="round-badge-text" id="pRoundBadge">الجولة الأولى</span></div>
        <div class="score-teams-row">
          <div class="score-box green-score"><span class="team-name">الأخضر</span><span class="score-num" id="pGreen">0</span></div>
          <div class="score-box orange-score"><span class="team-name">البرتقالي</span><span class="score-num" id="pOrange">0</span></div>
        </div>
      </div>
      <div class="pg-buzz" id="pBuzzWrap">
        <button class="pbz s-blue t-green" id="buzzerBtn" onclick="playerPress()"><span class="pbz-core"><span id="buzzerLabel"></span></span><span class="pz-badge" id="buzzerBadge">0</span></button>
        <div class="pg-status" id="buzzerStatus">جاهز</div>
        <div class="pg-me" id="pMyName"></div>
      </div>
      <div></div>
    </div>
  </div>`);

  let boardSig = "";
  function renderBoard(s) {
    const frame = $("pBoard");
    if (s.mode === "buttons" || !s.grid) { frame.style.display = "none"; return; }
    frame.style.display = "flex";
    const sig = JSON.stringify([s.grid, s.sel]);
    if (sig === boardSig) return;
    boardSig = sig;
    const w = $("pHexGrid"); w.innerHTML = "";
    s.grid.forEach((row, r) => {
      const re = document.createElement("div");
      re.className = "hex-row" + (r % 2 === 1 ? " offset-row" : "");
      row.forEach((cell, c) => {
        const [l, st] = cell.split("|");
        const h = document.createElement("div");
        h.className = "hex" + (st === "g" ? " green" : st === "o" ? " orange" : "") + (s.sel && s.sel.r === r && s.sel.c === c ? " sel" : "");
        h.innerHTML = `<div class="hex-in">${l}</div>`;
        re.appendChild(h);
      });
      w.appendChild(re);
    });
  }

  function renderGame(s, me) {
    renderBoard(s);
    $("pRoundBadge").textContent = s.roundName;
    $("pGreen").textContent = s.score.green; $("pOrange").textContent = s.score.orange;
    const cells = s.mode === "cells";
    $("pBuzzWrap").style.display = cells ? "none" : "flex";
    $("pOthers").style.display = cells ? "none" : "flex";
    if (cells) return;
    const now = Date.now();
    $("pOthers").innerHTML = s.players.filter(p => p.id !== P.id).map(p => {
      const b = buzzStateFor(s, p, now);
      return `<div class="pb team-${p.team}"><div class="pb-circle st-${b.cls}">${b.mic ? MIC_SVG : b.label}<span class="pb-badge">${p.pts || 0}</span></div><span class="pb-name">${escapeHtml(p.name)}</span></div>`;
    }).join("");
    const b = buzzStateFor(s, me, now);
    $("buzzerBtn").className = `pbz s-${b.cls} t-${me.team}`;
    $("buzzerLabel").textContent = b.label;
    $("buzzerBadge").textContent = me.pts || 0;
    $("buzzerStatus").textContent = b.text;
    $("pMyName").textContent = P.name;
  }

  window.renderPlayerScreen = function () {
    const s = P.state; if (!s) return;
    const me = s.players.find(p => p.id === P.id) || { id: P.id, team: P.team, pts: 0 };
    const ph = s.phase, was = P.lastPhase;
    if (ph !== was) {
      if (ph === "answering" || ph === "answering2") playSound("buzz");
      if ((was === "answering" || was === "answering2") && (ph === "expired" || ph === "closed")) playSound("bell");
      if (ph === "second") playSound("second");
      P.lastPhase = ph;
    }
    const screen = s.screen || "lobby";
    const roundEl = $("roundTransitionScreen");
    if (screen === "round") {
      roundEl.classList.add("player-mode");
      $("roundTitleText").textContent = s.roundName;
      $("roundWaitNote").style.display = "block";
      show("roundTransitionScreen"); hide("pGame"); hide("pLobby");
    } else if (screen === "game") {
      hide("roundTransitionScreen"); hide("pLobby"); show("pGame");
      renderGame(s, me);
    } else {
      hide("roundTransitionScreen"); hide("pGame"); show("pLobby");
      $("pLobName").textContent = P.name;
      const tag = $("pLobTeam");
      tag.textContent = me.team === "green" ? "الفريق الأخضر" : "الفريق البرتقالي";
      tag.className = "player-team-tag " + me.team;
    }
  };

  window.onPlayerMessage = function (m) {
    if (!m) return;
    if (m.t === "closed") { toast("تم إغلاق الغرفة"); leaveToMenu(); return; }
    if (m.t !== "state") return;
    if (m.kicked && m.kicked.includes(P.id)) { toast("تم طردك من الغرفة"); leaveToMenu(); return; }
    const me = m.players.find(p => p.id === P.id);
    if (!me) { if (!P.joined) joinStatus("✓ تم الوصول للمنظم … جاري التسجيل"); sendJoin(); return; }
    m.localDeadline = Date.now() + (m.remain || 0);
    P.state = m; P.team = me.team;
    if (!P.joined) {
      P.joined = true; joinStatus(""); clearInterval(joinRetry);
      hide("joinRoomModal"); hide("mainMenuCard");
      clearInterval(P.timer); P.timer = setInterval(renderPlayerScreen, 250);
    }
    renderPlayerScreen();
  };

  const _leave = window.leaveToMenu;
  window.leaveToMenu = function () {
    _leave.apply(this, arguments);
    clearInterval(joinRetry);
    boardSig = "";
    ["pLobby", "pGame", "roundTransitionScreen"].forEach(hide);
    $("roundTransitionScreen").classList.remove("player-mode");
    $("roundWaitNote").style.display = "none";
  };
})();