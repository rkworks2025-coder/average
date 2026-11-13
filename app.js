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

/**
 * 日本時間(JST)の文字列を、ブラウザの解釈に頼らず確実にDateオブジェクトへ変換する
 * @param {string} dateStr "2026/04/21 10:00:00" 形式を想定
 */
function parseJSTDate(dateStr) {
  if (!dateStr) return null;
  // ハイフンをスラッシュに置換してブラウザのUTC誤認（ISO形式判定）を防ぐ
  const normalizedStr = dateStr.replace(/-/g, '/');
  const d = new Date(normalizedStr);
  if (isNaN(d.getTime())) return null;
  return d;
}

// 日時フォーマット変換 (input[type="datetime-local"]用)
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
    vphVal.innerHTML = `--<span class="unit">台</span>`;
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

  // 現在のトータル台数算出 (表示用)
  const totalCount = Math.max(0, lastFetchedCount + appState.manualCountOffset);
  countVal.innerHTML = `${totalCount}<span class="unit">台</span>`;

  // 平均時間の計算：記録（CSV）がある分だけで算出し、不整合を防ぐ
  const avg = lastFetchedCount > 0 ? (lastFetchedTotalDuration / lastFetchedCount).toFixed(1) : "--";
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

// 開始時刻が消えていた場合の自動復元で、
// 「記録と記録の間がこれ以上空いたら別の回の作業」とみなす間隔。
// 夕方〜翌明け方のように日付をまたぐ作業があるため、日付ではなく空き時間で区切る。
const SESSION_GAP_MS = 5 * 60 * 60 * 1000; // 5時間

/**
 * 記録（時刻・作業時間[分]）の配列を、SESSION_GAP_MS 以上の空きで区切って
 * 1回分の作業ごとにまとめる（古い順）。
 * 各回の開始時刻は「最初の記録の時刻 − その車両の作業時間」、終了時刻は最後の記録の時刻。
 */
function splitSessions(records) {
  const sorted = records.slice().sort((a, b) => a.time - b.time);
  const sessions = [];
  let cur = null;
  sorted.forEach(r => {
    if (!cur || r.time - cur.end >= SESSION_GAP_MS) {
      cur = { start: r.time - r.duration * 60 * 1000, end: r.time, count: 0, totalDuration: 0 };
      sessions.push(cur);
    }
    cur.end = r.time;
    cur.count++;
    cur.totalDuration += r.duration;
  });
  return sessions;
}

/**
 * 記録の配列から、直近の作業（今回）の開始時刻を推定する。
 * 最新の記録自体が現在から SESSION_GAP_MS 以上前なら、作業中ではないとして null。
 */
function estimateSessionStart(records, nowMs) {
  const sessions = splitSessions(records);
  if (sessions.length === 0) return null;
  const last = sessions[sessions.length - 1];
  if (nowMs - last.end >= SESSION_GAP_MS) return null;
  return last.start;
}

/**
 * スプレッドシート(CSV)から全記録（時刻・作業時間[分]）を読み込む。
 */
async function fetchRecords() {
  const res = await fetch(CSV_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP通信エラー: ${res.status}`);
  const csvText = await res.text();

  const lines = csvText.split(/\r?\n/);
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const cols = parseCSVLine(lines[i]);
    // 列数チェック：SSの仕様(25列)と1ミリでも異なればエラー
    if (cols.length < 25) {
      throw new Error(`CSVの列数が不足しています (行:${i+1}, 取得数:${cols.length})。SSの構成を確認してください。`);
    }

    const tsStr = cols[0];  
    const durStr = cols[24]; 

    if (!tsStr || !durStr) continue;

    // JSTとして厳密にパース
    const rowTime = parseJSTDate(tsStr);
    if (!rowTime) continue;

    const duration = parseFloat(durStr);
    if (isNaN(duration)) continue;

    records.push({ time: rowTime.getTime(), duration: duration });
  }
  return records;
}

calcBtn.addEventListener('click', async () => {
  loadingMsg.style.display = 'block';

  try {
    const records = await fetchRecords();
    let count = 0;
    let totalDuration = 0;

    // 開始時刻が消えている場合は、記録から直近の作業の開始時刻を自動復元する
    if (!appState.startTime) {
      const estimated = estimateSessionStart(records, Date.now());
      if (estimated === null) {
        alert("まずは「作業開始」ボタンを押してください。");
        return;
      }
      appState = {
        startTime: estimated,
        manualCountOffset: 0,
        rests: [],
        isResting: false
      };
      saveState();
    }

    records.forEach(r => {
      // 開始時刻（JSTベース）と比較
      if (r.time >= appState.startTime) {
        count++;
        totalDuration += r.duration;
      }
    });

    lastFetchedCount = count;
    lastFetchedTotalDuration = totalDuration;
    updateMainUI();

  } catch (err) {
    console.error("Critical Analysis Error: ", err);
    alert(`エラーが発生しました: ${err.message}`);
    // 異常検知時は処理を停止し、古いデータを表示させないためにリロードを検討
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

// --- 過去の作業実績画面 ---
const HISTORY_DAYS = 7; // 遡って表示する期間（日）

const historyBtn = document.getElementById('historyBtn');
const historyView = document.getElementById('history-view');
const histPrevBtn = document.getElementById('histPrevBtn');
const histNextBtn = document.getElementById('histNextBtn');
const histTitle = document.getElementById('histTitle');
const histRange = document.getElementById('histRange');
const histCountVal = document.getElementById('histCountVal');
const histAvgVal = document.getElementById('histAvgVal');
const histVphVal = document.getElementById('histVphVal');
const histNetTimeVal = document.getElementById('histNetTimeVal');
const histLoadingMsg = document.getElementById('histLoadingMsg');
const histBackBtn = document.getElementById('histBackBtn');

let historySessions = []; // 新しい順。[0]=前回
let historyIndex = 0;

function formatMonthDayTime(ms) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

function renderHistory() {
  if (historySessions.length === 0) {
    histTitle.textContent = '記録なし';
    histRange.textContent = `直近${HISTORY_DAYS}日に終わった作業がありません`;
    histCountVal.innerHTML = `--<span class="unit">台</span>`;
    histAvgVal.innerHTML = `--<span class="unit">min</span>`;
    histVphVal.innerHTML = `--<span class="unit">台/h</span>`;
    histNetTimeVal.innerHTML = `--<span class="unit">h</span>--<span class="unit">m</span>`;
    histPrevBtn.disabled = true;
    histNextBtn.disabled = true;
    return;
  }

  const ses = historySessions[historyIndex];
  histTitle.textContent = historyIndex === 0 ? '前回' : `${historyIndex + 1}回前`;
  histRange.textContent = `${formatMonthDayTime(ses.start)} 〜 ${formatMonthDayTime(ses.end)}`;

  const netWorkMs = Math.max(0, ses.end - ses.start);
  const netHours = Math.floor(netWorkMs / (1000 * 60 * 60));
  const netMinutes = Math.floor((netWorkMs % (1000 * 60 * 60)) / (1000 * 60));
  const avg = ses.count > 0 ? (ses.totalDuration / ses.count).toFixed(1) : '--';
  const netWorkHoursDecimal = netWorkMs / (1000 * 60 * 60);
  const vph = netWorkHoursDecimal > 0 ? (ses.count / netWorkHoursDecimal).toFixed(1) : '--';

  histCountVal.innerHTML = `${ses.count}<span class="unit">台</span>`;
  histAvgVal.innerHTML = `${avg}<span class="unit">min</span>`;
  histVphVal.innerHTML = `${vph}<span class="unit">台/h</span>`;
  histNetTimeVal.innerHTML = `${netHours}<span class="unit">h</span>${netMinutes}<span class="unit">m</span>`;

  // ◀ = さらに前の回、▶ = 新しい回
  histPrevBtn.disabled = historyIndex >= historySessions.length - 1;
  histNextBtn.disabled = historyIndex <= 0;
}

historyBtn.addEventListener('click', async () => {
  mainView.classList.add('hidden');
  historyView.classList.remove('hidden');
  historySessions = [];
  historyIndex = 0;
  histTitle.textContent = '前回';
  histRange.textContent = '';
  histPrevBtn.disabled = true;
  histNextBtn.disabled = true;
  histLoadingMsg.style.display = 'block';

  try {
    const records = await fetchRecords();
    const now = Date.now();
    const sessions = splitSessions(records);
    // 作業中の今回（最新の記録から SESSION_GAP_MS 未満）は除外し、終わった回だけを対象にする
    if (sessions.length > 0 && now - sessions[sessions.length - 1].end < SESSION_GAP_MS) {
      sessions.pop();
    }
    const since = now - HISTORY_DAYS * 24 * 60 * 60 * 1000;
    historySessions = sessions.filter(ses => ses.end >= since).reverse();
    renderHistory();
  } catch (err) {
    console.error("History Load Error: ", err);
    alert(`エラーが発生しました: ${err.message}`);
  } finally {
    histLoadingMsg.style.display = 'none';
  }
});

histPrevBtn.addEventListener('click', () => {
  if (historyIndex < historySessions.length - 1) {
    historyIndex++;
    renderHistory();
  }
});

histNextBtn.addEventListener('click', () => {
  if (historyIndex > 0) {
    historyIndex--;
    renderHistory();
  }
});

histBackBtn.addEventListener('click', () => {
  historyView.classList.add('hidden');
  mainView.classList.remove('hidden');
});

init();
