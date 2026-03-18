// 対象スプレッドシートのCSVエクスポートURL
const CSV_URL = 'https://docs.google.com/spreadsheets/d/1VQaC8n_rvbjyDxQSfMadQkpim43oRw9URb31hLovyhc/export?format=csv&gid=0';

// --- DOM要素の取得 ---
// メイン画面
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

// 編集画面
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
  startTime: null,          // 作業開始時刻 (timestamp)
  manualCountOffset: 0,     // 手動調整台数
  rests: [],                // 休憩履歴 [{start: timestamp, end: timestamp | null}]
  isResting: false          // 現在休憩中かどうか
};

// スプレッドシートから取得した直近の計算結果を保持
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

// 日時フォーマット変換 (timestamp -> YYYY-MM-DDTHH:mm) 編集画面のinput用
function formatForDateTimeInput(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const tzOffset = d.getTimezoneOffset() * 60000;
  const localIso = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  return localIso;
}

// --- 時間・計算ロジック ---

// 合計休憩時間(ミリ秒)を計算
function calculateTotalRestTimeMs(referenceTimeMs) {
  let total = 0;
  const now = referenceTimeMs || Date.now();
  
  appState.rests.forEach(r => {
    const rStart = r.start;
    const rEnd = r.end ? r.end : now; // 終了していない休憩は現在時刻までとして計算
    if (rStart && rEnd > rStart) {
      total += (rEnd - rStart);
    }
  });
  return total;
}

// メイン画面の表示更新（現在時刻ベースで再計算）
function updateMainUI() {
  if (!appState.startTime) {
    countVal.innerHTML = `0<span class="unit">台</span>`;
    avgVal.innerHTML = `--<span class="unit">min</span>`;
    vphVal.innerHTML = `--<span class="unit">台</span>`;
    netTimeVal.innerHTML = `0<span class="unit">h</span>0<span class="unit">m</span>`;
    restTimeVal.innerHTML = `0<span class="unit">m</span>`;
    restToggleBtn.textContent = "☕️ 休憩開始";
    restToggleBtn.classList.remove('resting');
    return;
  }

  // 休憩ボタンの表示状態
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
  const netWorkMs = Math.max(0, totalElapsedMs - totalRestMs); // 実稼働時間

  // 実稼働時間の表示 (時間と分)
  const netHours = Math.floor(netWorkMs / (1000 * 60 * 60));
  const netMinutes = Math.floor((netWorkMs % (1000 * 60 * 60)) / (1000 * 60));
  netTimeVal.innerHTML = `${netHours}<span class="unit">h</span>${netMinutes}<span class="unit">m</span>`;

  // 休憩時間の表示 (合計分)
  const restMinutes = Math.floor(totalRestMs / (1000 * 60));
  restTimeVal.innerHTML = `${restMinutes}<span class="unit">m</span>`;

  // 台数とUPHの計算
  const totalCount = Math.max(0, lastFetchedCount + appState.manualCountOffset);
  countVal.innerHTML = `${totalCount}<span class="unit">台</span>`;

  const avg = totalCount > 0 ? (lastFetchedTotalDuration / totalCount).toFixed(1) : "--";
  avgVal.innerHTML = `${avg}<span class="unit">min</span>`;

  const netWorkHoursDecimal = netWorkMs / (1000 * 60 * 60);
  const vph = netWorkHoursDecimal > 0 ? (totalCount / netWorkHoursDecimal).toFixed(1) : "--";
  vphVal.innerHTML = `${vph}<span class="unit">台/h</span>`;
}

// --- メイン画面のアクション ---

// 作業開始(リセット)
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

// 休憩開始/終了トグル
restToggleBtn.addEventListener('click', () => {
  if (!appState.startTime) {
    alert("まずは「作業開始」ボタンを押してください。");
    return;
  }

  if (appState.isResting) {
    // 休憩を終了する
    const activeRest = appState.rests.find(r => r.end === null);
    if (activeRest) {
      activeRest.end = Date.now();
    }
    appState.isResting = false;
  } else {
    // 休憩を開始する
    appState.rests.push({ start: Date.now(), end: null });
    appState.isResting = true;
  }
  saveState();
  updateMainUI();
});

// CSVパーサー
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

// 計算する (Fetch)
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
  // メインを隠して編集を表示
  mainView.classList.add('hidden');
  editView.classList.remove('hidden');

  // 値をフォームにセット
  editStartTime.value = formatForDateTimeInput(appState.startTime);
  editManualCount.value = appState.manualCountOffset;
  renderRestHistoryEdit();
}

function renderRestHistoryEdit() {
  restHistoryList.innerHTML = '';
  appState.rests.forEach((r, index) => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'rest-item';
    
    // 開始と終了のinputを作成
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

    // 削除ボタン
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

// 編集モードを開く
editBtn.addEventListener('click', () => {
  if (!appState.startTime) {
    alert("データがありません。「作業開始」を先に行ってください。");
    return;
  }
  openEditView();
});

// 手動カウントの増減ボタン
minusCountBtn.addEventListener('click', () => {
  editManualCount.value = parseInt(editManualCount.value || 0) - 1;
});
plusCountBtn.addEventListener('click', () => {
  editManualCount.value = parseInt(editManualCount.value || 0) + 1;
});

// 休憩を手動追加
addRestBtn.addEventListener('click', () => {
  // 現在時刻でダミーの休憩データを追加して再描画
  appState.rests.push({ start: Date.now(), end: Date.now() + (1000 * 60 * 10) }); // デフォルト10分間
  renderRestHistoryEdit();
});

// 編集のキャンセル
cancelEditBtn.addEventListener('click', () => {
  // 変更を破棄して状態をリロード
  const savedState = localStorage.getItem('workMonitorState');
  if (savedState) {
    appState = JSON.parse(savedState);
  }
  editView.classList.add('hidden');
  mainView.classList.remove('hidden');
});

// 編集の完了(保存)
completeEditBtn.addEventListener('click', () => {
  if (!window.confirm("変更内容を保存しますか？")) return;

  // 開始時刻の保存
  if (editStartTime.value) {
    appState.startTime = new Date(editStartTime.value).getTime();
  }

  // 手動台数の保存
  appState.manualCountOffset = parseInt(editManualCount.value || 0);

  // 休憩履歴の保存 (DOMから読み取る)
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
  appState.isResting = isAnyRestActive; // 終了時刻が空のものがあれば休憩中扱いにする

  saveState();
  updateMainUI();
  
  // メイン画面に戻る
  editView.classList.add('hidden');
  mainView.classList.remove('hidden');
});

// 初回起動処理
init();
