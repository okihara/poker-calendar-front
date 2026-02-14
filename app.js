const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQzRfrIH1vQwDxdZqaoE8t7Q33O5Hxig_18xijgI77yRhfgGUOEUsioJ9zD08hoNuMklZXOxqmmejfq/pub?gid=1600443875&single=true&output=csv";

// Debug time override (hidden feature)
// Activate via URL param: ?debug_time=2026-02-14T23:30
// Or console: __setDebugTime('2026-02-14T23:30')
let _debugTime = null;

function getNow() {
  return _debugTime ? new Date(_debugTime.getTime()) : new Date();
}

window.__setDebugTime = function(str) {
  if (!str) {
    _debugTime = null;
    _hideDebugBar();
    updateDateTabs();
    update();
    console.log('[Debug] Time override cleared');
    return;
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) {
    console.error('[Debug] Invalid date:', str);
    return;
  }
  _debugTime = d;
  _showDebugBar();
  updateDateTabs();
  update();
  console.log('[Debug] Time set to:', d.toLocaleString());
};

window.__clearDebugTime = function() {
  window.__setDebugTime(null);
};

function _showDebugBar() {
  let bar = document.getElementById('debugTimeBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'debugTimeBar';
    bar.innerHTML = `
      <span id="debugTimeLabel"></span>
      <input type="datetime-local" id="debugTimeInput" step="60">
      <button id="debugTimeSet">適用</button>
      <button id="debugTimeClear">解除</button>
    `;
    document.body.prepend(bar);
    document.getElementById('debugTimeSet').addEventListener('click', () => {
      const val = document.getElementById('debugTimeInput').value;
      if (val) window.__setDebugTime(val);
    });
    document.getElementById('debugTimeClear').addEventListener('click', () => {
      window.__clearDebugTime();
    });
  }
  bar.style.display = 'flex';
  const label = document.getElementById('debugTimeLabel');
  if (label && _debugTime) {
    label.textContent = `DEBUG: ${_debugTime.toLocaleString('ja-JP')}`;
  }
  const input = document.getElementById('debugTimeInput');
  if (input && _debugTime) {
    const y = _debugTime.getFullYear();
    const mo = String(_debugTime.getMonth() + 1).padStart(2, '0');
    const d = String(_debugTime.getDate()).padStart(2, '0');
    const h = String(_debugTime.getHours()).padStart(2, '0');
    const mi = String(_debugTime.getMinutes()).padStart(2, '0');
    input.value = `${y}-${mo}-${d}T${h}:${mi}`;
  }
}

function _hideDebugBar() {
  const bar = document.getElementById('debugTimeBar');
  if (bar) bar.style.display = 'none';
}

function _initDebugTimeFromURL() {
  const params = new URLSearchParams(window.location.search);
  const dt = params.get('debug_time');
  if (dt) {
    const d = new Date(dt);
    if (!isNaN(d.getTime())) {
      _debugTime = d;
      _showDebugBar();
    }
  }
}

// State
const state = {
  raw: [],
  data: [], // normalized rows
  filtered: [],
  sort: { key: "start_time", dir: "asc" },
};

// Elements (initialized after DOM ready)
const el = {
  status: null,
  count: null,
  tbody: null,
  table: null,
  dateToggles: null,
  areaToggles: null,
  multToggles: null,
  titleToggles: null,
  searchInput: null,
};

function initElements() {
  el.status = document.getElementById("status");
  el.count = document.getElementById("count");
  el.tbody = document.getElementById("tbody");
  el.table = document.getElementById("table");
  el.dateToggles = document.getElementById("dateToggles");
  el.areaToggles = document.getElementById("areaToggles");
  el.multToggles = document.getElementById("multToggles");
  el.titleToggles = document.getElementById("titleToggles");
}

function parseIntSafe(v) {
  if (v == null) return null;
  const s = String(v).replace(/[,\s円]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Parse prize_list text and sum numeric amounts.
// Supported examples:
//  - "50000/30000/20000"
//  - "5k, 3k, 2k"
//  - "5,000円 ×2 / 2,500"
//  - "1万/5千"（万=10000, 千=1000）
//  - "50,000 + Ticket"（非数値は無視）
function parsePrizeListSum(text) {
  if (!text) return null;
  const s = String(text).replace(/［|］|【|】/g, "");
  let sum = 0;
  let found = false;
  // Match number with optional unit and optional multiplier like x2 or ×2
  const re = /(\d{1,3}(?:[,\d]{0,3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(万|千|k|K|m|M|円)?\s*(?:[x×]\s*(\d+))?/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    let numStr = m[1];
    const unit = m[2] || "";
    const timesStr = m[3];
    // Normalize number string
    numStr = numStr.replace(/,/g, "");
    let base = Number(numStr);
    if (!Number.isFinite(base)) continue;
    // Apply unit
    switch (unit) {
      case '万': base *= 10000; break;
      case '千': base *= 1000; break;
      case 'k':
      case 'K': base *= 1000; break;
      case 'm':
      case 'M': base *= 1000000; break;
      // '円' or no unit: treat as JPY
    }
    // Multiplier like x2
    const times = timesStr ? Number(timesStr) : 1;
    if (Number.isFinite(times) && times > 0) base *= times;
    sum += base;
    found = true;
  }
  return found ? Math.round(sum) : null;
}

function parseDateTimeJP(s) {
  // expects like "2025/08/19 13:00" or "2025/08/19"
  if (!s) return null;
  const m = String(s).trim();
  // Normalize delimiter
  const [datePart, timePart] = m.split(/\s+/);
  if (!datePart) return null;
  const [yy, mm, dd] = datePart.split(/[\/-]/).map(x => Number(x));
  if (!yy || !mm || !dd) return null;
  if (timePart) {
    const [HH, MM = 0] = timePart.split(":").map(x => Number(x));
    const d = new Date(yy, (mm - 1), dd, HH || 0, MM || 0);
    return d;
  }
  return new Date(yy, (mm - 1), dd);
}

function fmtTime(d) {
  if (!(d instanceof Date)) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (_debugTime) {
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${m}/${day} ${hh}:${mm}`;
  }
  return `${hh}:${mm}`;
}

function fmtDate(d) {
  if (!(d instanceof Date)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`; // for input[type=date] and display
}

function fmtDateJapanese(d) {
  if (!(d instanceof Date)) return "";
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const weekday = weekdays[d.getDay()];
  return `${m}月${day}日(${weekday})`;
}

function normalizeRow(row) {
  const entry_fee = parseIntSafe(row.entry_fee);
  const add_on = parseIntSafe(row.add_on);
  const guaranteed_amount = parseIntSafe(row.guaranteed_amount);
  // Prefer prize_list aggregation if available; fallback to total_prize field
  const total_from_list = parsePrizeListSum(row.prize_list || row.prize_text);
  const total_prize_field = parseIntSafe(row.total_prize);
  const total_prize = total_from_list != null ? total_from_list : total_prize_field;

  const dateOnly = parseDateTimeJP(row.date);
  const startDT = parseDateTimeJP(row.start_time);
  const lateRegDT = parseDateTimeJP(row.late_registration_time);
  // Multiplier: use total prize sum divided by (entry fee + add_on)
  // Skip calculation for satellite tournaments (title contains "サテ")
  const isSatellite = row.title && row.title.includes('サテ');
  const totalCost = (entry_fee || 0) + (add_on || 0);
  let multiplier = (!isSatellite && total_prize != null && totalCost > 0)
    ? (total_prize / totalCost)
    : null;
  // 倍率500以上は異常値とみなし、倍率なしとして扱う
  if (multiplier != null && multiplier >= 500) multiplier = null;
  return {
    ...row,
    entry_fee,
    add_on,
    guaranteed_amount,
    total_prize,
    date_only: dateOnly,
    date_only_ts: dateOnly ? new Date(dateOnly.getFullYear(), dateOnly.getMonth(), dateOnly.getDate()).getTime() : -Infinity,
    start_dt: startDT,
    start_time_ts: startDT ? startDT.getTime() : -Infinity,
    late_reg_dt: lateRegDT,
    late_reg_ts: lateRegDT ? lateRegDT.getTime() : -Infinity,
    multiplier,
  };
}

function setStatus(msg, showSpinner = false) {
  if (showSpinner) {
    el.status.innerHTML = `<div class="spinner"></div><span>${msg}</span>`;
  } else {
    el.status.textContent = msg || "";
  }
}

// area toggles: buttons with .area-btn.active represent enabled filters

function applyFilters() {
  let rows = state.data.slice();

  // Date filter (today / tomorrow)
  if (el.dateToggles) {
    const activeDateBtn = el.dateToggles.querySelector('.date-tab.active');
    const selectedDate = activeDateBtn?.dataset.date || 'today';
    const now = getNow();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // 1日の定義: 当日00:00 〜 翌日06:00 にlate_reg_dtが含まれるもの
    const selectedStart = selectedDate === 'tomorrow' ? tomorrowStart : todayStart;
    const selectedEnd = new Date(selectedStart.getTime() + 30 * 60 * 60 * 1000); // +30h = 翌日06:00
    rows = rows.filter(r => {
      if (!r.late_reg_dt) return false;
      return r.late_reg_dt >= selectedStart && r.late_reg_dt < selectedEnd;
    });
  }

  // Area filter
  const activeAreas = Array.from(el.areaToggles?.querySelectorAll('.area-btn.active') || [])
    .map(b => b.dataset.area)
    .filter(a => !!a);

  if (activeAreas.length > 0) {
    rows = rows.filter(r => {
      // 全カラムのどこかにエリア名が含まれていれば真
      return activeAreas.some(area => {
        return Object.values(r).some(value => {
          if (value == null) return false;
          return String(value).toLowerCase().includes(area.toLowerCase());
        });
      });
    });
  }

  // Multiplier filter
  if (el.multToggles) {
    const activeMultBtn = el.multToggles.querySelector('.area-btn.active');
    const sel = activeMultBtn?.dataset.mult;
    if (sel === '10-19') {
      rows = rows.filter(r => r.multiplier != null && isFinite(r.multiplier) && r.multiplier >= 10 && r.multiplier < 20);
    } else if (sel === '20-29') {
      rows = rows.filter(r => r.multiplier != null && isFinite(r.multiplier) && r.multiplier >= 20 && r.multiplier < 30);
    } else if (sel === '30-39') {
      rows = rows.filter(r => r.multiplier != null && isFinite(r.multiplier) && r.multiplier >= 30 && r.multiplier < 40);
    } else if (sel === '40-49') {
      rows = rows.filter(r => r.multiplier != null && isFinite(r.multiplier) && r.multiplier >= 40 && r.multiplier < 50);
    } else if (sel === '50plus') {
      rows = rows.filter(r => r.multiplier != null && isFinite(r.multiplier) && r.multiplier >= 50);
    }
  }

  // Title filter
  if (el.titleToggles) {
    const activeTitleBtns = Array.from(el.titleToggles.querySelectorAll('.area-btn.active') || []);
    const activeTitles = activeTitleBtns.map(b => b.dataset.title).filter(t => !!t);

    if (activeTitles.length > 0) {
      rows = rows.filter(r => {
        // 全カラムのどこかにタイトルキーワードが含まれていれば真
        return activeTitles.some(activeTitle => {
          return Object.values(r).some(value => {
            if (value == null) return false;
            return String(value).toLowerCase().includes(activeTitle.toLowerCase());
          });
        });
      });
    }
  }

  // Search filter (全カラム対象)
  if (el.searchInput) {
    const searchTerm = el.searchInput.value.trim().toLowerCase();
    if (searchTerm) {
      rows = rows.filter(r => {
        // 全てのカラムの値を検索対象にする
        return Object.values(r).some(value => {
          if (value == null) return false;
          return String(value).toLowerCase().includes(searchTerm);
        });
      });
    }
  }

  // Late registration expired filter
  const showLateExpiredCheckbox = document.getElementById('showLateExpired');
  if (!showLateExpiredCheckbox || !showLateExpiredCheckbox.checked) {
    const now = getNow();
    rows = rows.filter(r => {
      if (!r.late_reg_dt) return true;
      return r.late_reg_dt >= now;
    });
  }

  state.filtered = rows;
}

function sortRows() {
  const { key, dir } = state.sort;
  const mul = dir === "desc" ? -1 : 1;

  const numKeys = new Set(["entry_fee", "add_on", "guaranteed_amount", "total_prize", "start_time", "start_time_ts", "date_only_ts", "late_reg_ts", "multiplier"]);
  let effectiveKey = key;
  if (key === "start_time") effectiveKey = "start_time_ts";
  if (key === "date_only") effectiveKey = "date_only_ts";
  if (key === "late_registration_time") effectiveKey = "late_reg_ts";

  state.filtered.sort((a, b) => {
    const ka = effectiveKey in a ? a[effectiveKey] : a[key];
    const kb = effectiveKey in b ? b[effectiveKey] : b[key];

    const an = numKeys.has(effectiveKey);

    const va = an ? Number(ka ?? -Infinity) : String(ka ?? "").toLowerCase();
    const vb = an ? Number(kb ?? -Infinity) : String(kb ?? "").toLowerCase();

    if (va < vb) return -1 * mul;
    if (va > vb) return 1 * mul;
    return 0;
  });
}

function clearSortIndicators() {
  document.querySelectorAll("th.sortable").forEach(th => {
    th.classList.remove("asc", "desc");
  });
}

function updateSortIndicator() {
  clearSortIndicators();
  const th = document.querySelector(`th.sortable[data-key="${state.sort.key}"]`);
  if (th) th.classList.add(state.sort.dir);
}

function render() {
  const rows = state.filtered;
  if (!rows.length) {
    el.tbody.innerHTML = `<tr><td colspan="11" style=\"color:#a8b2d1;padding:16px;\">該当データがありません</td></tr>`;
    return;
  }
  const now = getNow();
  const html = rows.map(r => {
    const dateStr = r.date_only ? fmtDate(r.date_only) : (r.date || "");
    const startStr = r.start_dt ? `${fmtTime(r.start_dt)}` : (r.start_time || "");
    const lateStr = r.late_reg_dt ? `${fmtTime(r.late_reg_dt)}` : (r.late_registration_time || "");
    const feeStr = r.entry_fee != null ? r.entry_fee.toLocaleString() : "";
    const addOnStr = r.add_on != null ? r.add_on.toLocaleString() : "";
    const totalPrizeStr = r.total_prize != null && r.total_prize > 0 ? r.total_prize.toLocaleString() : "不明";
    const multStr = (r.multiplier != null && isFinite(r.multiplier) && r.multiplier > 0) ? `x${(Math.round(r.multiplier * 10) / 10).toFixed(1)}` : "";

    // Check if late registration time has passed
    const isLateRegistrationPassed = r.late_reg_dt && r.late_reg_dt < now;

    let rowClass = '';
    if (isLateRegistrationPassed) {
      rowClass = 'late-reg-expired';
    } else if (r.multiplier != null && isFinite(r.multiplier)) {
      if (r.multiplier >= 50) rowClass = 'hl-mult-50plus';
      else if (r.multiplier >= 40) rowClass = 'hl-mult-40plus';
      else if (r.multiplier >= 30) rowClass = 'hl-mult-30plus';
      else if (r.multiplier >= 20) rowClass = 'hl-mult-20plus';
      else if (r.multiplier >= 10) rowClass = 'hl-mult-10to19';
    }

    const titleContent = r.link ?
      `<a href="${r.link}" class="title-link">${r.title || ""}</a>` :
      (r.title || "");

    // 日付表示（スマホ用）MM/DD(曜日)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const mobileDateStr = r.date_only
      ? `${String(r.date_only.getMonth() + 1).padStart(2, '0')}/${String(r.date_only.getDate()).padStart(2, '0')}(${weekdays[r.date_only.getDay()]})`
      : "";
    const mobileStartTime = r.start_dt
      ? `${String(r.start_dt.getHours()).padStart(2, '0')}:${String(r.start_dt.getMinutes()).padStart(2, '0')}`
      : "";

    // 倍率バッジ（スマホ用）
    const multBadgeText = (r.multiplier != null && isFinite(r.multiplier) && r.multiplier > 0) ? `倍率: ${(Math.round(r.multiplier * 10) / 10).toFixed(1)}x` : '';
    const multBadgeClass = r.multiplier >= 50 ? 'mult-50plus' :
      r.multiplier >= 40 ? 'mult-40plus' :
      r.multiplier >= 30 ? 'mult-30plus' :
      r.multiplier >= 20 ? 'mult-20plus' :
      r.multiplier >= 10 ? 'mult-10plus' : 'mult-under10';

    // レイト締切表示（スマホ用）
    const mobileLateStr = r.late_reg_dt
      ? `締切 ${String(r.late_reg_dt.getHours()).padStart(2, '0')}:${String(r.late_reg_dt.getMinutes()).padStart(2, '0')}`
      : "";

    return `
      <tr class="${rowClass}">
        <!-- PC用テーブル列 -->
        <td class="pc-only" data-label="開催日">${dateStr}</td>
        <td class="pc-only" data-label="開始">${startStr}</td>
        <td class="pc-only" data-label="レイト">${lateStr}</td>
        <td class="pc-only" data-label="エリア">${r.area || ""}</td>
        <td class="pc-only" data-label="店名"><span class="shop-name-link" data-shop="${r.shop_name || ""}">${r.shop_name || ""}</span></td>
        <td class="pc-only" data-label="タイトル">${titleContent}</td>
        <td class="pc-only number" data-label="参加費">${feeStr}</td>
        <td class="pc-only number" data-label="アドオン">${addOnStr}</td>
        <td class="pc-only number" data-label="プライズ総額">${totalPrizeStr}</td>
        <td class="pc-only number" data-label="倍率">${multStr}</td>
        <td class="pc-only prize-text" data-label="プライズ概要">${(r.prize_text || "").toString().replace(/\n+/g, ' / ')}</td>

        <!-- スマホ用カード -->
        <td class="mobile-card-cell">
          <div class="mobile-card">
            <div class="mobile-card-left">
              <span class="mobile-card-date">${mobileDateStr}</span>
              <span class="mobile-card-start-time">${mobileStartTime}</span>
              ${mobileLateStr ? `<span class="mobile-card-late">${mobileLateStr}</span>` : ''}
            </div>
            <div class="mobile-card-right">
              <h3 class="mobile-card-title">${r.title || "タイトルなし"}</h3>
              <p class="mobile-card-shop"><span class="shop-name-link" data-shop="${r.shop_name || ""}">${r.shop_name || ""}</span></p>
              <div class="mobile-card-details">
                ${feeStr ? `<span>参加費: ¥${feeStr}</span>` : ''}
                ${totalPrizeStr !== "不明" ? `<span>賞金: ${totalPrizeStr}</span>` : ''}
              </div>
              <div class="mobile-card-badges">
                ${multBadgeText ? `<span class="mobile-badge mobile-badge-mult ${multBadgeClass}">${multBadgeText}</span>` : ''}
              </div>
            </div>
            ${r.link ? `<a href="${r.link}" class="mobile-card-arrow">›</a>` : ''}
          </div>
        </td>
      </tr>`;
  }).join("");
  el.tbody.innerHTML = html;
}

function updateCount() {
  const total = state.data.length;
  const filtered = state.filtered.length;
  if (el.count) {
    el.count.textContent = ` ${filtered} / ${total}`;
  }
}

function update() {
  applyFilters();
  sortRows();
  updateSortIndicator();
  render();
  updateCount();
  updateURLFromFilters();
}

function onHeaderClick(e) {
  const th = e.target.closest("th.sortable");
  if (!th) return;
  const key = th.getAttribute("data-key");
  if (!key) return;
  if (state.sort.key === key) {
    state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
  } else {
    state.sort.key = key;
    state.sort.dir = key === "start_time" ? "asc" : "asc"; // default asc
  }
  update();
}


function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function updateDateTabs() {
  if (!el.dateToggles) return;
  const today = getNow();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const todayTab = el.dateToggles.querySelector('.date-tab[data-date="today"]');
  const tomorrowTab = el.dateToggles.querySelector('.date-tab[data-date="tomorrow"]');
  if (todayTab) todayTab.textContent = `${fmtDateJapanese(today)}`;
  if (tomorrowTab) tomorrowTab.textContent = `${fmtDateJapanese(tomorrow)}`;
}

async function fetchAndInit() {
  // Update date tabs with actual dates
  updateDateTabs();
  
  setStatus("読み込み中...", true);
  try {
    await new Promise((resolve, reject) => {
      Papa.parse(CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          state.raw = results.data || [];
          state.data = state.raw.map(normalizeRow);

          // 初期ソート: start_time 昇順（URLパラメータで指定がない場合のみ）
          if (!state.sort.key) {
            state.sort = { key: "start_time", dir: "asc" };
          }

          update();
          setStatus("");
          resolve();
        },
        error: (err) => reject(err),
      });
    });
  } catch (e) {
    console.error(e);
    setStatus("読み込みに失敗しました。ネットワークやCSVの公開設定を確認してください。");
  }
}

// URLクエリパラメータからフィルター状態を読み込む
function loadFiltersFromURL() {
  const params = new URLSearchParams(window.location.search);

  // 日付 (today / tomorrow)
  const date = params.get('date');
  if (date && el.dateToggles) {
    const targetTab = el.dateToggles.querySelector(`.date-tab[data-date="${date}"]`);
    if (targetTab) {
      el.dateToggles.querySelectorAll('.date-tab').forEach(b => b.classList.remove('active'));
      targetTab.classList.add('active');
    }
  }

  // エリア
  const area = params.get('area');
  if (area && el.areaToggles) {
    const targetBtn = el.areaToggles.querySelector(`.area-btn[data-area="${area}"]`);
    if (targetBtn) {
      targetBtn.classList.add('active');
    }
  }

  // 倍率
  const mult = params.get('mult');
  if (mult && el.multToggles) {
    const targetBtn = el.multToggles.querySelector(`.area-btn[data-mult="${mult}"]`);
    if (targetBtn) {
      targetBtn.classList.add('active');
    }
  }

  // タイトル
  const title = params.get('title');
  if (title && el.titleToggles) {
    const targetBtn = el.titleToggles.querySelector(`.area-btn[data-title="${title}"]`);
    if (targetBtn) {
      targetBtn.classList.add('active');
    }
  }

  // 検索
  const search = params.get('search');
  if (search && el.searchInput) {
    el.searchInput.value = search;
    const clearSearchBtn = document.getElementById('clearSearch');
    if (clearSearchBtn) {
      clearSearchBtn.style.display = 'flex';
    }
  }

  // レイト過ぎ表示
  const showLate = params.get('showLate');
  const showLateExpiredCheckbox = document.getElementById('showLateExpired');
  if (showLate === '1' && showLateExpiredCheckbox) {
    showLateExpiredCheckbox.checked = true;
  }

  // 倍率ソート
  const sortMult = params.get('sortMult');
  const sortByMultiplierCheckbox = document.getElementById('sortByMultiplier');
  if (sortMult === '1' && sortByMultiplierCheckbox) {
    sortByMultiplierCheckbox.checked = true;
    state.sort = { key: 'multiplier', dir: 'desc' };
  }
}

// 現在のフィルター状態をURLクエリパラメータに反映する
function updateURLFromFilters() {
  const params = new URLSearchParams();

  // 日付 (today / tomorrow) - デフォルト(today)以外の場合のみ設定
  if (el.dateToggles) {
    const activeDateTab = el.dateToggles.querySelector('.date-tab.active');
    if (activeDateTab && activeDateTab.dataset.date === 'tomorrow') {
      params.set('date', 'tomorrow');
    }
  }

  // エリア
  if (el.areaToggles) {
    const activeAreaBtn = el.areaToggles.querySelector('.area-btn.active');
    if (activeAreaBtn) {
      params.set('area', activeAreaBtn.dataset.area);
    }
  }

  // 倍率
  if (el.multToggles) {
    const activeMultBtn = el.multToggles.querySelector('.area-btn.active');
    if (activeMultBtn) {
      params.set('mult', activeMultBtn.dataset.mult);
    }
  }

  // タイトル
  if (el.titleToggles) {
    const activeTitleBtn = el.titleToggles.querySelector('.area-btn.active');
    if (activeTitleBtn) {
      params.set('title', activeTitleBtn.dataset.title);
    }
  }

  // 検索
  if (el.searchInput && el.searchInput.value.trim()) {
    params.set('search', el.searchInput.value.trim());
  }

  // レイト過ぎ表示
  const showLateExpiredCheckbox = document.getElementById('showLateExpired');
  if (showLateExpiredCheckbox && showLateExpiredCheckbox.checked) {
    params.set('showLate', '1');
  }

  // 倍率ソート
  const sortByMultiplierCheckbox = document.getElementById('sortByMultiplier');
  if (sortByMultiplierCheckbox && sortByMultiplierCheckbox.checked) {
    params.set('sortMult', '1');
  }

  // URLを更新（履歴に追加せずに置き換え）
  const newURL = params.toString()
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;
  window.history.replaceState({}, '', newURL);
}

function bindEvents() {
  el.table.addEventListener("click", onHeaderClick);

  // Bind date tabs (today / tomorrow)
  if (el.dateToggles) {
    el.dateToggles.addEventListener('click', (e) => {
      const btn = e.target.closest('.date-tab');
      if (!btn) return;
      // Toggle between today and tomorrow (mutually exclusive)
      el.dateToggles.querySelectorAll('.date-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      update();
    });
  }

  if (el.areaToggles) {
    el.areaToggles.addEventListener('click', (e) => {
      const btn = e.target.closest('.area-btn');
      if (!btn) return;
      // Toggle: クリックでactive切り替え（排他的に1つだけ）
      const isActive = btn.classList.contains('active');
      el.areaToggles.querySelectorAll('.area-btn').forEach(b => b.classList.remove('active'));
      if (!isActive) {
        btn.classList.add('active');
      }
      update();
    });
  }

  if (el.multToggles) {
    el.multToggles.addEventListener('click', (e) => {
      const btn = e.target.closest('.area-btn');
      if (!btn) return;
      // Toggle: クリックでactive切り替え（排他的に1つだけ）
      const isActive = btn.classList.contains('active');
      el.multToggles.querySelectorAll('.area-btn').forEach(b => b.classList.remove('active'));
      if (!isActive) {
        btn.classList.add('active');
      }
      update();
    });
  }

  // Bind title toggles
  if (el.titleToggles) {
    el.titleToggles.addEventListener('click', (e) => {
      const btn = e.target.closest('.area-btn');
      if (!btn) return;
      // Toggle: クリックでactive切り替え（排他的に1つだけ）
      const isActive = btn.classList.contains('active');
      el.titleToggles.querySelectorAll('.area-btn').forEach(b => b.classList.remove('active'));
      if (!isActive) {
        btn.classList.add('active');
      }
      update();
    });
  }

  // Bind late registration expired toggle
  const showLateExpiredCheckbox = document.getElementById('showLateExpired');
  if (showLateExpiredCheckbox) {
    showLateExpiredCheckbox.addEventListener('change', () => {
      update();
    });
  }

  // Bind sort by multiplier toggle
  const sortByMultiplierCheckbox = document.getElementById('sortByMultiplier');
  if (sortByMultiplierCheckbox) {
    sortByMultiplierCheckbox.addEventListener('change', () => {
      if (sortByMultiplierCheckbox.checked) {
        state.sort = { key: 'multiplier', dir: 'desc' };
      } else {
        state.sort = { key: 'start_time', dir: 'asc' };
      }
      update();
    });
  }

  // Bind search input
  el.searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearch');

  if (el.searchInput) {
    el.searchInput.addEventListener('input', () => {
      update(); // デバウンスなし、キー入力ごとに即座に更新
      // Show/hide clear button based on input
      if (clearSearchBtn) {
        clearSearchBtn.style.display = el.searchInput.value ? 'flex' : 'none';
      }
    });
  }

  // Bind clear search button
  if (clearSearchBtn && el.searchInput) {
    clearSearchBtn.addEventListener('click', () => {
      el.searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      update();
      el.searchInput.focus();
    });
  }

  // 店名クリックで検索
  el.tbody.addEventListener('click', (e) => {
    const shopLink = e.target.closest('.shop-name-link');
    if (!shopLink) return;
    const shopName = shopLink.dataset.shop;
    if (shopName && el.searchInput) {
      if (el.searchInput.value === shopName) {
        el.searchInput.value = '';
        if (clearSearchBtn) clearSearchBtn.style.display = 'none';
      } else {
        el.searchInput.value = shopName;
        if (clearSearchBtn) clearSearchBtn.style.display = 'flex';
      }
      update();
    }
  });

  // URLクエリパラメータからフィルター状態を読み込む
  loadFiltersFromURL();
}

// Initialize
initElements();
_initDebugTimeFromURL();
bindEvents();
fetchAndInit();
