const fullAlphabet = [
  'أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ',
  'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص',
  'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق',
  'ك', 'ل', 'م', 'ن', 'هـ', 'و', 'ي'
];

let currentLetter = '';
let currentAnswer = '';
let selectedTileElement = null;
let currentRound = 1;
let score1 = 0;
let score2 = 0;
let countdown = null;
let timerSeconds = 0;

let team1Color = '#71bf43';
let team2Color = '#f58220';
let boardState = Array(5).fill(null).map(() => Array(5).fill(0));

let peer = null;
let peerId = '';
let audioCtx = null;

function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

window.addEventListener('click', initAudioContext, { once: true });

window.addEventListener('DOMContentLoaded', () => {
  const qrElem = document.getElementById("gameQRCode");
  if (qrElem && typeof QRCode !== 'undefined') {
    qrElem.innerHTML = "";
    new QRCode(qrElem, {
      text: window.location.href,
      width: 120,
      height: 120,
      colorDark: "#1a0628",
      colorLight: "#ffffff"
    });
  }
});

function goToSettings() {
  initAudioContext();
  document.getElementById('introScreen').classList.add('hidden');
  document.getElementById('settingsScreen').classList.remove('hidden');
}

function openSettings() {
  document.getElementById('mainGame').classList.add('hidden');
  document.getElementById('settingsScreen').classList.remove('hidden');
}

function startGame() {
  initAudioContext();
  const t1Name = document.getElementById('team1NameInput').value || 'الفريق الأول';
  const t2Name = document.getElementById('team2NameInput').value || 'الفريق الثاني';
  team1Color = document.getElementById('team1ColorInput').value;
  team2Color = document.getElementById('team2ColorInput').value;

  document.getElementById('team1Label').innerText = t1Name;
  document.getElementById('team2Label').innerText = t2Name;
  document.getElementById('assignT1Label').innerText = t1Name;
  document.getElementById('assignT2Label').innerText = t2Name;

  document.documentElement.style.setProperty('--team1-color', team1Color);
  document.documentElement.style.setProperty('--team2-color', team2Color);

  document.getElementById('team1Row').style.backgroundColor = team1Color;
  document.getElementById('team2Row').style.backgroundColor = team2Color;

  document.getElementById('settingsScreen').classList.add('hidden');
  document.getElementById('mainGame').classList.remove('hidden');

  initRound();
  initPeerConnection();
}

function initPeerConnection() {
  if (typeof Peer === 'undefined') return;
  
  peerId = 'horof-' + Math.floor(1000 + Math.random() * 9000);
  peer = new Peer(peerId);

  peer.on('open', (id) => {
    document.getElementById('roomCodeDisplay').innerText = `كود ربط الهواتف: ${id}`;
  });

  peer.on('connection', (conn) => {
    conn.on('data', (data) => {
      if (data && data.type === 'press_buzzer') {
        handleBuzzerPress(data.team, data.playerName);
      }
    });
  });
}

function handleBuzzerPress(teamNumber, playerName) {
  const tName = teamNumber == 1 ? document.getElementById('team1NameInput').value : document.getElementById('team2NameInput').value;
  const pName = playerName ? ` [${playerName}]` : '';
  
  playVictorySound();
  alert(`🔔 الضغطة من: ${tName}${pName} - يبدأ مؤقت 3 ثوانٍ!`);
  
  startTimer(3);

  setTimeout(() => {
    if (timerSeconds <= 0) {
      const otherTeam = teamNumber == 1 ? 2 : 1;
      const otherName = otherTeam == 1 ? document.getElementById('team1NameInput').value : document.getElementById('team2NameInput').value;
      alert(`⌛ انتهى الوقت! تحولت الأحقية لـ: (${otherName}) - 10 ثوانٍ!`);
      startTimer(10);
    }
  }, 3200);
}

function shuffle(array) {
  return array.slice().sort(() => Math.random() - 0.5);
}

function initRound() {
  const gridContainer = document.getElementById('hexGrid');
  gridContainer.innerHTML = '';
  boardState = Array(5).fill(null).map(() => Array(5).fill(0));

  const roundLetters = shuffle([...fullAlphabet]).slice(0, 25);

  let index = 0;
  for (let r = 0; r < 5; r++) {
    const row = document.createElement('div');
    row.className = 'hex-row';

    for (let c = 0; c < 5; c++) {
      if (index >= roundLetters.length) break;
      const letter = roundLetters[index];

      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", "0 0 100 115");
      svg.setAttribute("class", "hex-svg");
      svg.dataset.row = r;
      svg.dataset.col = c;

      const polygon = document.createElementNS(svgNS, "polygon");
      polygon.setAttribute("points", "50,5 95,30 95,85 50,110 5,85 5,30");

      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", "50%");
      text.setAttribute("y", "55%");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("class", "hex-text");
      text.textContent = letter;

      svg.appendChild(polygon);
      svg.appendChild(text);

      svg.onclick = () => selectLetter(letter, svg);

      row.appendChild(svg);
      index++;
    }
    gridContainer.appendChild(row);
  }
}

function selectLetter(letter, element) {
  document.querySelectorAll('.hex-svg.selected').forEach(el => el.classList.remove('selected'));

  currentLetter = letter;
  selectedTileElement = element;
  document.getElementById('currentLetterBadge').innerText = letter;

  if (!element.classList.contains('team1') && !element.classList.contains('team2')) {
    element.classList.add('selected');
  }

  document.getElementById('teamAssignButtons').style.display = 'flex';
  loadQuestion(letter);
}

function assignTileToTeam(teamNumber) {
  if (!selectedTileElement) return;

  const r = parseInt(selectedTileElement.dataset.row);
  const c = parseInt(selectedTileElement.dataset.col);

  selectedTileElement.classList.remove('selected', 'team1', 'team2');

  if (teamNumber === 1) {
    selectedTileElement.classList.add('team1');
    boardState[r][c] = 1;
  } else if (teamNumber === 2) {
    selectedTileElement.classList.add('team2');
    boardState[r][c] = 2;
  }

  playVictorySound();
  triggerConfetti();
  checkWinningPath(teamNumber);
}

/* خوارزميات فحص الفوز والربط الرأسي والأفقي المحدثة بالكامل */
function checkWinningPath(team) {
  let winningPath = [];

  if (team === 1) {
    winningPath = findVerticalWinningPath(team);
  } else if (team === 2) {
    winningPath = findHorizontalWinningPath(team);
  }

  if (winningPath.length > 0) {
    const tName = team === 1 ? document.getElementById('team1NameInput').value : document.getElementById('team2NameInput').value;
    
    // إبراز خلايا مسار الفوز الموصل بتأثير التوهج
    winningPath.forEach(([r, c]) => {
      const hexSvg = document.querySelector(`.hex-svg[data-row="${r}"][data-col="${c}"]`);
      if (hexSvg) {
        hexSvg.classList.add('winning-path');
      }
    });

    addScore(team);
    playPathVictorySound();
    
    setTimeout(() => {
      showWinnerModal(tName);
    }, 600);
  }
}

// تحديد الخلايا المجاورة للشبكة السداسية مع مراعاة إزاحة الصفوف الزوجية
function getHexNeighbors(r, c) {
  const isEven = (r % 2 === 0);
  if (isEven) {
    return [
      [r - 1, c - 1], [r - 1, c],
      [r, c - 1],     [r, c + 1],
      [r + 1, c - 1], [r + 1, c]
    ];
  } else {
    return [
      [r - 1, c],     [r - 1, c + 1],
      [r, c - 1],     [r, c + 1],
      [r + 1, c],     [r + 1, c + 1]
    ];
  }
}

// مسار الفوز الرأسي للفريق الأول (من الصف 0 حتى الصف 4)
function findVerticalWinningPath(team) {
  for (let startCol = 0; startCol < 5; startCol++) {
    if (boardState[0][startCol] === team) {
      let visited = Array(5).fill(null).map(() => Array(5).fill(false));
      let parentMap = {};
      let queue = [[0, startCol]];
      visited[0][startCol] = true;

      while (queue.length > 0) {
        let [r, c] = queue.shift();

        if (r === 4) {
          let path = [];
          let curr = `${r},${c}`;
          while (curr) {
            let [pr, pc] = curr.split(',').map(Number);
            path.push([pr, pc]);
            curr = parentMap[curr];
          }
          return path;
        }

        for (let [nr, nc] of getHexNeighbors(r, c)) {
          if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5 && !visited[nr][nc] && boardState[nr][nc] === team) {
            visited[nr][nc] = true;
            parentMap[`${nr},${nc}`] = `${r},${c}`;
            queue.push([nr, nc]);
          }
        }
      }
    }
  }
  return [];
}

// مسار الفوز الأفقي للفريق الثاني (من العمود 0 حتى العمود 4)
function findHorizontalWinningPath(team) {
  for (let startRow = 0; startRow < 5; startRow++) {
    if (boardState[startRow][0] === team) {
      let visited = Array(5).fill(null).map(() => Array(5).fill(false));
      let parentMap = {};
      let queue = [[startRow, 0]];
      visited[startRow][0] = true;

      while (queue.length > 0) {
        let [r, c] = queue.shift();

        if (c === 4) {
          let path = [];
          let curr = `${r},${c}`;
          while (curr) {
            let [pr, pc] = curr.split(',').map(Number);
            path.push([pr, pc]);
            curr = parentMap[curr];
          }
          return path;
        }

        for (let [nr, nc] of getHexNeighbors(r, c)) {
          if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5 && !visited[nr][nc] && boardState[nr][nc] === team) {
            visited[nr][nc] = true;
            parentMap[`${nr},${nc}`] = `${r},${c}`;
            queue.push([nr, nc]);
          }
        }
      }
    }
  }
  return [];
}

function showWinnerModal(teamName) {
  document.getElementById('winnerTeamName').innerText = `🏆 مبروك للفريق الفائز (${teamName}) 🏆`;
  document.getElementById('winnerModal').classList.remove('hidden');
}

function closeWinnerModal() {
  document.getElementById('winnerModal').classList.add('hidden');
}

function loadQuestion(letter) {
  const answerText = document.getElementById('answerText');
  const showAnswerBtn = document.getElementById('showAnswerBtn');
  const newQuestionBtn = document.getElementById('newQuestionBtn');

  answerText.classList.add('hidden');
  showAnswerBtn.innerText = 'عرض الإجابة';

  const bank = typeof questionBank !== 'undefined' ? questionBank : null;
  const list = bank ? bank[letter] : null;

  if (list && list.length > 0) {
    const randomIndex = Math.floor(Math.random() * list.length);
    const selectedItem = list[randomIndex];

    const match = selectedItem.match(/(.*?)\s*\((.*?)\)/);
    if (match) {
      document.getElementById('questionText').innerText = match[1];
      currentAnswer = match[2];
      showAnswerBtn.style.display = 'block';
      newQuestionBtn.style.display = 'block';
      answerText.innerText = `الإجابة: ${currentAnswer}`;
    } else {
      document.getElementById('questionText').innerText = selectedItem;
      showAnswerBtn.style.display = 'none';
      newQuestionBtn.style.display = 'block';
    }
  } else {
    document.getElementById('questionText').innerText = 'لا يوجد سؤال متاح لهذا الحرف حالياً.';
    showAnswerBtn.style.display = 'none';
    newQuestionBtn.style.display = 'none';
  }
}

function changeQuestion() {
  if (currentLetter) loadQuestion(currentLetter);
}

function toggleAnswer() {
  const answerText = document.getElementById('answerText');
  const showAnswerBtn = document.getElementById('showAnswerBtn');

  if (answerText.classList.contains('hidden')) {
    answerText.classList.remove('hidden');
    showAnswerBtn.innerText = 'إخفاء الإجابة';
  } else {
    answerText.classList.add('hidden');
    showAnswerBtn.innerText = 'عرض الإجابة';
  }
}

function startTimer(seconds) {
  clearInterval(countdown);
  timerSeconds = seconds;
  updateTimerDisplay();

  countdown = setInterval(() => {
    timerSeconds--;
    updateTimerDisplay();
    if (timerSeconds <= 0) clearInterval(countdown);
  }, 1000);
}

function updateTimerDisplay() {
  document.getElementById('timerDisplay').innerText = timerSeconds < 10 ? `0${timerSeconds}` : timerSeconds;
}

function addScore(team) {
  if (team === 1) {
    score1++;
    document.getElementById('scoreTeam1').innerText = score1;
  } else {
    score2++;
    document.getElementById('scoreTeam2').innerText = score2;
  }
}

function nextRound() {
  currentRound++;
  document.getElementById('roundTitle').innerText = `الجولة ${currentRound}`;
  document.getElementById('questionText').innerText = 'اختر حرفاً من الخلية لبدء السؤال';
  document.getElementById('currentLetterBadge').innerText = '؟';
  document.getElementById('showAnswerBtn').style.display = 'none';
  document.getElementById('newQuestionBtn').style.display = 'none';
  document.getElementById('teamAssignButtons').style.display = 'none';
  document.getElementById('answerText').classList.add('hidden');
  selectedTileElement = null;
  initRound();
}

function playVictorySound() {
  try {
    initAudioContext();
    [523.25, 659.25, 783.99].forEach((freq, index) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime + index * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + index * 0.1 + 0.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + index * 0.1);
      osc.stop(audioCtx.currentTime + index * 0.1 + 0.2);
    });
  } catch (e) {}
}

function playPathVictorySound() {
  try {
    initAudioContext();
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
    notes.forEach((freq, index) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime + index * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + index * 0.1 + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + index * 0.1);
      osc.stop(audioCtx.currentTime + index * 0.1 + 0.4);
    });
  } catch (e) {}
}

function triggerConfetti() {
  const container = document.getElementById('confettiContainer');
  container.innerHTML = '';
  const colors = ['#ffde00', '#00bcd4', '#71bf43', '#f58220', '#e91e63'];

  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = (Math.random() * 8 + 6) + 'px';
    piece.style.height = (Math.random() * 12 + 6) + 'px';
    container.appendChild(piece);
  }
  setTimeout(() => container.innerHTML = '', 3000);
}