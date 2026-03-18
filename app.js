// 対象スプレッドシートのCSVエクスポートURL
const CSV_URL = 'https://docs.google.com/spreadsheets/d/1VQaC8n_rvbjyDxQSfMadQkpim43oRw9URb31hLovyhc/export?format=csv&gid=0';

// --- DOM要素の取得 ---
const mainView = document.getElementById('main-view');
const countVal = document.getElementById('countVal');
const avgVal = document.getElementById('avgVal');
const vphVal = document.getElementById('vphVal');
const netTimeVal = document.getElementById('netTimeVal');
const restTimeVal = document.getElementById('restTimeVal');
const loadingMsg = document.getElementById('loadingMsg');

const startBtn = document.getElementById('startBtn');
const calcBtn = document.getElementById('calcBtn');
const restToggleBtn = document.getElementById('restToggleBtn');
const editBtn = document.getElementById('editBtn');

const editView = document.getElementById('edit-view');
const editStartTime = document.getElementById('editStartTime');
const editManualCount = document.getElementById('editManualCount');
const minusCountBtn = document.getElementById('minusCountBtn');
const plusCountBtn = document.getElementById('plusCountBtn');
const restHistoryList = document.getElementById('restHistoryList');
const addRestBtn = document.getElementById('addRestBtn');
const completeEditBtn = document.getElementById('completeEditBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');

// --- 状態管理（State） ---
let appState = {
  startTime: null,          
  manualCountOffset: 0,     // 自動集計値との差分
  rests: [],                
  isResting: false          
};

let lastFetchedCount = 0;
let lastFetchedTotalDuration = 0;

// --- 初期化処理 ---
function init() {
  const savedState = localStorage.getItem('workMonitorState');
  if (savedState) {
    try {
      appState = JSON.parse(savedState);
    } catch (e) {
      console.error("State parse error", e);
    }
  }
  updateMainUI();
}

function saveState() {
  localStorage.setItem('workMonitorState', JSON.stringify(appState));
}

// 日時フォーマット変換
function formatForDateTimeInput(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

// 合計休憩時間の計算
function calculateTotalRestTimeMs(referenceTimeMs) {
  let total = 0;
  const now = referenceTimeMs || Date.now();
  
  appState.rests.forEach(r => {
    const rStart = r.start;
    const rEnd = r.end ? r.end : now;
    if (rStart && rEnd > rStart) {
      total += (rEnd - rStart);
    }
  });
  return total;
}

// メイン画面の表示更新
function updateMainUI() {
  if (!appState.startTime) {
    countVal.innerHTML = `0<span class="unit">台</span>`;
    avgVal.innerHTML = `--<span class="unit">min</span>`;
    vphVal.innerHTML = `--<span class="unit">台/h</span>`;
    netTimeVal.innerHTML = `0<span class="unit">h</span>0<span class="unit">m</span>`;
    restTimeVal.innerHTML = `0<span class="unit">m</span>`;
    restToggleBtn.textContent = "☕️ 休憩開始";
    restToggleBtn.classList.remove('resting');
    return;
  }

  if (appState.isResting) {
    restToggleBtn.textContent = "▶️ 休憩終了(再開)";
    restToggleBtn.classList.add('resting');
  } else {
    restToggleBtn.textContent = "☕️ 休憩開始";
    restToggleBtn.classList.remove('resting');
  }

  const now = Date.now();
  const totalElapsedMs = now - appState.startTime;
  const totalRestMs = calculateTotalRestTimeMs(now);
  const netWorkMs = Math.max(0, totalElapsedMs - totalRestMs);

  const netHours = Math.floor(netWorkMs / (1000 * 60 * 60));
  const netMinutes = Math.floor((netWorkMs % (1000 * 60 * 60)) / (1000 * 60));
  netTimeVal.innerHTML = `${netHours}<span class="unit">h</span>${netMinutes}<span class="unit">m</span>`;

  const restMinutes = Math.floor(totalRestMs / (1000 * 60));
  restTimeVal.innerHTML = `${restMinutes}<span class="unit">m</span>`;

  // 現在のトータル台数算出
  const totalCount = Math.max(0, lastFetchedCount + appState.manualCountOffset);
  countVal.innerHTML = `${totalCount}<span class="unit">台</span>`;

  const avg = totalCount > 0 ? (lastFetchedTotalDuration / totalCount).toFixed(1) : "--";
  avgVal.innerHTML = `${avg}<span class="unit">min</span>`;

  const netWorkHoursDecimal = netWorkMs / (1000 * 60 * 60);
  const vph = netWorkHoursDecimal > 0 ? (totalCount / netWorkHoursDecimal).toFixed(1) : "--";
  vphVal.innerHTML = `${vph}<span class="unit">台/h</span>`;
}

// --- メイン画面のアクション ---
startBtn.addEventListener('click', () => {
  if (window.confirm("時刻をリセットして新しく計測を開始しますか？")) {
    appState = {
      startTime: Date.now(),
      manualCountOffset: 0,
      rests: [],
      isResting: false
    };
    lastFetchedCount = 0;
    lastFetchedTotalDuration = 0;
    saveState();
    updateMainUI();
    alert("作業計測をスタートしました。");
  }
});

restToggleBtn.addEventListener('click', () => {
  if (!appState.startTime) {
    alert("まずは「作業開始」ボタンを押してください。");
    return;
  }

  if (appState.isResting) {
    const activeRest = appState.rests.find(r => r.end === null);
    if (activeRest) activeRest.end = Date.now();
    appState.isResting = false;
  } else {
    appState.rests.push({ start: Date.now(), end: null });
    appState.isResting = true;
  }
  saveState();
  updateMainUI();
});

function parseCSVLine(text) {
  const ret = [];
  let insideQuote = false;
  let value = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (insideQuote && text[i+1] === '"') {
        value += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (c === ',' && !insideQuote) {
      ret.push(value);
      value = '';
    } else {
      value += c;
    }
  }
  ret.push(value);
  return ret;
}

calcBtn.addEventListener('click', async () => {
  if (!appState.startTime) {
    alert("まずは「作業開始」ボタンを押してください。");
    return;
  }

  loadingMsg.style.display = 'block';

  try {
    const res = await fetch(CSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const csvText = await res.text();

    const lines = csvText.split(/\r?\n/);
    let count = 0;
    let totalDuration = 0;

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = parseCSVLine(lines[i]);
      if (cols.length < 25) continue;

      const tsStr = cols[0];  
      const durStr = cols[24]; 

      if (!tsStr || !durStr) continue;

      const rowTime = new Date(tsStr);
      if (isNaN(rowTime.getTime())) continue;

      const duration = parseFloat(durStr);
      if (isNaN(duration)) continue;

      if (rowTime.getTime() >= appState.startTime) {
        count++;
        totalDuration += duration;
      }
    }

    lastFetchedCount = count;
    lastFetchedTotalDuration = totalDuration;
    updateMainUI();

  } catch (err) {
    console.error("Fetch Error: ", err);
    alert("データの取得に失敗しました。");
  } finally {
    loadingMsg.style.display = 'none';
  }
});


// --- 編集画面のロジック ---
function openEditView() {
  mainView.classList.add('hidden');
  editView.classList.remove('hidden');

  editStartTime.value = formatForDateTimeInput(appState.startTime);
  
  // 現在のトータル台数を計算して表示
  const currentTotal = Math.max(0, lastFetchedCount + appState.manualCountOffset);
  editManualCount.value = currentTotal;

  renderRestHistoryEdit();
}

function renderRestHistoryEdit() {
  restHistoryList.innerHTML = '';
  appState.rests.forEach((r, index) => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'rest-item';
    
    const inputsDiv = document.createElement('div');
    inputsDiv.className = 'rest-time-inputs';
    
    const startInput = document.createElement('input');
    startInput.type = 'datetime-local';
    startInput.value = formatForDateTimeInput(r.start);
    startInput.dataset.index = index;
    startInput.dataset.type = 'start';
    startInput.className = 'edit-input rest-edit-field';

    const endInput = document.createElement('input');
    endInput.type = 'datetime-local';
    endInput.value = r.end ? formatForDateTimeInput(r.end) : '';
    endInput.dataset.index = index;
    endInput.dataset.type = 'end';
    endInput.className = 'edit-input rest-edit-field';
    endInput.placeholder = '終了時刻 (空欄で計測中)';

    inputsDiv.appendChild(startInput);
    inputsDiv.appendChild(endInput);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete';
    delBtn.textContent = '🗑️ 削除';
    delBtn.onclick = () => {
      if(window.confirm("この休憩履歴を削除しますか？")) {
        appState.rests.splice(index, 1);
        renderRestHistoryEdit();
      }
    };

    itemDiv.appendChild(inputsDiv);
    itemDiv.appendChild(delBtn);
    restHistoryList.appendChild(itemDiv);
  });
}

editBtn.addEventListener('click', () => {
  if (!appState.startTime) {
    alert("データがありません。「作業開始」を先に行ってください。");
    return;
  }
  openEditView();
});

// 手動台数の増減 (画面上はトータル台数を直接操作)
minusCountBtn.addEventListener('click', () => {
  const currentVal = parseInt(editManualCount.value || 0);
  if (currentVal > 0) editManualCount.value = currentVal - 1;
});
plusCountBtn.addEventListener('click', () => {
  editManualCount.value = parseInt(editManualCount.value || 0) + 1;
});

addRestBtn.addEventListener('click', () => {
  appState.rests.push({ start: Date.now(), end: Date.now() + (1000 * 60 * 10) }); 
  renderRestHistoryEdit();
});

cancelEditBtn.addEventListener('click', () => {
  const savedState = localStorage.getItem('workMonitorState');
  if (savedState) {
    appState = JSON.parse(savedState);
  }
  editView.classList.add('hidden');
  mainView.classList.remove('hidden');
});

completeEditBtn.addEventListener('click', () => {
  if (!window.confirm("変更内容を保存しますか？")) return;

  if (editStartTime.value) {
    appState.startTime = new Date(editStartTime.value).getTime();
  }

  // 入力されたトータル台数から自動集計分を引き、差分(オフセット)として保存
  const targetTotal = parseInt(editManualCount.value || 0);
  appState.manualCountOffset = targetTotal - lastFetchedCount;

  const restFields = document.querySelectorAll('.rest-edit-field');
  const newRests = [];
  let isAnyRestActive = false;

  appState.rests.forEach((_, idx) => {
    const sInput = document.querySelector(`input[data-index="${idx}"][data-type="start"]`);
    const eInput = document.querySelector(`input[data-index="${idx}"][data-type="end"]`);
    
    if (sInput && sInput.value) {
      const sTime = new Date(sInput.value).getTime();
      const eTime = eInput && eInput.value ? new Date(eInput.value).getTime() : null;
      
      newRests.push({ start: sTime, end: eTime });
      if (eTime === null) isAnyRestActive = true;
    }
  });

  appState.rests = newRests;
  appState.isResting = isAnyRestActive; 

  saveState();
  updateMainUI();
  
  editView.classList.add('hidden');
  mainView.classList.remove('hidden');
});

init();
