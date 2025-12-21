const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQzRfrIH1vQwDxdZqaoE8t7Q33O5Hxig_18xijgI77yRhfgGUOEUsioJ9zD08hoNuMklZXOxqmmejfq/pub?gid=1600443875&single=true&output=csv";

// State
const state = {
  raw: [],
  data: [], // normalized rows
  filtered: [],
  sort: { key: "start_time", dir: "asc" },
};

// Elements
const el = {
  status: document.getElementById("status"),
  tbody: document.getElementById("tbody"),
  table: document.getElementById("table"),
  areaToggles: document.getElementById("areaToggles"),
  multToggles: document.getElementById("multToggles"),
  titleToggles: document.getElementById("titleToggles"),
  searchInput: null, // Will be initialized in bindEvents
};

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
  return `${m}/${day}(${weekday})`;
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
  // Multiplier: use total prize sum divided by entry fee
  let multiplier = (total_prize != null && entry_fee && entry_fee > 0)
    ? (total_prize / entry_fee)
    : null;
  // Invalidate unrealistic multiplier (>= 100)
  if (multiplier != null && isFinite(multiplier) && multiplier >= 100) {
    multiplier = null;
  }

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

function setStatus(msg) {
  el.status.textContent = msg || "";
}

// area toggles: buttons with .area-btn.active represent enabled filters

function applyFilters() {
  // Area filter
  const allActive = !!el.areaToggles?.querySelector('.area-btn[data-area="ALL"].active');
  const activeAreas = Array.from(el.areaToggles?.querySelectorAll('.area-btn.active') || [])
    .map(b => b.dataset.area)
    .filter(a => !!a && a !== 'ALL');
  let rows = state.data.slice();

  if (!allActive && activeAreas.length > 0) {
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
    const multAll = !!el.multToggles.querySelector('.area-btn[data-mult="ALL"].active');
    if (!multAll) {
      const activeMultBtn = el.multToggles.querySelector('.area-btn.active:not([data-mult="ALL"])');
      const sel = activeMultBtn?.dataset.mult;
      if (sel === '20-29') {
        rows = rows.filter(r => r.multiplier != null && isFinite(r.multiplier) && r.multiplier >= 20 && r.multiplier < 30);
      } else if (sel === '30-39') {
        rows = rows.filter(r => r.multiplier != null && isFinite(r.multiplier) && r.multiplier >= 30 && r.multiplier < 40);
      } else if (sel === '40-49') {
        rows = rows.filter(r => r.multiplier != null && isFinite(r.multiplier) && r.multiplier >= 40 && r.multiplier < 50);
      } else if (sel === '50plus') {
        rows = rows.filter(r => r.multiplier != null && isFinite(r.multiplier) && r.multiplier >= 50);
      }
    }
  }

  // Title filter
  if (el.titleToggles) {
    const titleAll = !!el.titleToggles.querySelector('.area-btn[data-title="ALL"].active');
    if (!titleAll) {
      const activeTitleBtns = Array.from(el.titleToggles.querySelectorAll('.area-btn.active:not([data-title="ALL"])') || []);
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
  const now = new Date();
  const html = rows.map(r => {
    const dateStr = r.date_only ? fmtDate(r.date_only) : (r.date || "");
    const startStr = r.start_dt ? `${fmtTime(r.start_dt)}` : (r.start_time || "");
    const lateStr = r.late_reg_dt ? `${fmtTime(r.late_reg_dt)}` : (r.late_registration_time || "");
    const feeStr = r.entry_fee != null ? r.entry_fee.toLocaleString() : "";
    const addOnStr = r.add_on != null ? r.add_on.toLocaleString() : "";
    const totalPrizeStr = r.total_prize != null ? r.total_prize.toLocaleString() : "";
    const multStr = (r.multiplier != null && isFinite(r.multiplier)) ? `${(Math.round(r.multiplier * 10) / 10).toFixed(1)}x` : "";
    
    // Check if late registration time has passed
    console.log(r, now);
    const isLateRegistrationPassed = r.late_reg_dt && r.late_reg_dt < now;
    
    let rowClass = '';
    if (isLateRegistrationPassed) {
      rowClass = 'late-reg-expired';
    } else if (r.multiplier != null && isFinite(r.multiplier)) {
      if (r.multiplier >= 50) rowClass = 'hl-mult-50plus';
      else if (r.multiplier >= 30) rowClass = 'hl-mult-30plus';
      else if (r.multiplier >= 20) rowClass = 'hl-mult-20plus';
      else if (r.multiplier >= 10) rowClass = 'hl-mult-10to19';
    }

    const titleContent = r.link ? 
      `<a href="${r.link}" class="title-link">${r.title || ""}</a>` : 
      (r.title || "");

    return `
      <tr class="${rowClass}">
        <td data-label="開催日">${dateStr}</td>
        <td data-label="開始">${startStr}</td>
        <td data-label="レイト">${lateStr}</td>
        <td data-label="エリア">${r.area || ""}</td>
        <td data-label="店名">${r.shop_name || ""}</td>
        <td data-label="タイトル">${titleContent}</td>
        <td class="number" data-label="参加費">${feeStr}</td>
        <td class="number" data-label="アドオン">${addOnStr}</td>
        <td class="number" data-label="プライズ総額">${totalPrizeStr}</td>
        <td class="number" data-label="倍率">${multStr}</td>
        <td class="prize-text" data-label="プライズ概要">${(r.prize_text || "").toString().replace(/\n+/g, ' / ')}</td>
      </tr>`;
  }).join("");
  el.tbody.innerHTML = html;
}

function update() {
  applyFilters();
  sortRows();
  updateSortIndicator();
  render();
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

async function fetchAndInit() {
  // Update page title with current date
  const today = new Date();
  const todayStr = fmtDateJapanese(today);
  document.querySelector('.app-header h1').textContent = `🃏今日のポーカートーナメント ${todayStr}`;
  
  setStatus("読み込み中...");
  try {
    await new Promise((resolve, reject) => {
      Papa.parse(CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          state.raw = results.data || [];
          state.data = state.raw.map(normalizeRow);

          // 初期ソート: start_time 昇順
          state.sort = { key: "start_time", dir: "asc" };

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

  // エリア
  const area = params.get('area');
  if (area && el.areaToggles) {
    const allBtn = el.areaToggles.querySelector('.area-btn[data-area="ALL"]');
    const targetBtn = el.areaToggles.querySelector(`.area-btn[data-area="${area}"]`);
    if (targetBtn && area !== 'ALL') {
      allBtn?.classList.remove('active');
      el.areaToggles.querySelectorAll('.area-btn:not([data-area="ALL"])').forEach(b => b.classList.remove('active'));
      targetBtn.classList.add('active');
    }
  }

  // 倍率
  const mult = params.get('mult');
  if (mult && el.multToggles) {
    const allBtn = el.multToggles.querySelector('.area-btn[data-mult="ALL"]');
    const targetBtn = el.multToggles.querySelector(`.area-btn[data-mult="${mult}"]`);
    if (targetBtn && mult !== 'ALL') {
      allBtn?.classList.remove('active');
      el.multToggles.querySelectorAll('.area-btn:not([data-mult="ALL"])').forEach(b => b.classList.remove('active'));
      targetBtn.classList.add('active');
    }
  }

  // タイトル
  const title = params.get('title');
  if (title && el.titleToggles) {
    const allBtn = el.titleToggles.querySelector('.area-btn[data-title="ALL"]');
    const targetBtn = el.titleToggles.querySelector(`.area-btn[data-title="${title}"]`);
    if (targetBtn && title !== 'ALL') {
      allBtn?.classList.remove('active');
      el.titleToggles.querySelectorAll('.area-btn:not([data-title="ALL"])').forEach(b => b.classList.remove('active'));
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
  const table = document.getElementById('table');
  if (showLate === '1' && showLateExpiredCheckbox && table) {
    showLateExpiredCheckbox.checked = true;
    table.classList.remove('hide-late-expired');
  }
}

// 現在のフィルター状態をURLクエリパラメータに反映する
function updateURLFromFilters() {
  const params = new URLSearchParams();

  // エリア
  if (el.areaToggles) {
    const activeAreaBtn = el.areaToggles.querySelector('.area-btn.active:not([data-area="ALL"])');
    if (activeAreaBtn) {
      params.set('area', activeAreaBtn.dataset.area);
    }
  }

  // 倍率
  if (el.multToggles) {
    const activeMultBtn = el.multToggles.querySelector('.area-btn.active:not([data-mult="ALL"])');
    if (activeMultBtn) {
      params.set('mult', activeMultBtn.dataset.mult);
    }
  }

  // タイトル
  if (el.titleToggles) {
    const activeTitleBtn = el.titleToggles.querySelector('.area-btn.active:not([data-title="ALL"])');
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

  // URLを更新（履歴に追加せずに置き換え）
  const newURL = params.toString()
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;
  window.history.replaceState({}, '', newURL);
}

function bindEvents() {
  el.table.addEventListener("click", onHeaderClick);
  if (el.areaToggles) {
    el.areaToggles.addEventListener('click', (e) => {
      const btn = e.target.closest('.area-btn');
      if (!btn) return;
      const area = btn.dataset.area;
      const allBtn = el.areaToggles.querySelector('.area-btn[data-area="ALL"]');

      if (area === 'ALL') {
        // Activate ALL and deactivate others
        allBtn.classList.add('active');
        el.areaToggles.querySelectorAll('.area-btn').forEach(b => {
          if (b !== allBtn) b.classList.remove('active');
        });
      } else {
        // Mutually exclusive: only one specific area at a time
        const isActive = btn.classList.contains('active');
        if (isActive) {
          // If clicking the already active area, revert to ALL
          btn.classList.remove('active');
          allBtn.classList.add('active');
        } else {
          // Activate this area, deactivate other specific areas and ALL
          el.areaToggles.querySelectorAll('.area-btn:not([data-area="ALL"])').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          allBtn.classList.remove('active');
        }
      }
      update();
    });
  }

  if (el.multToggles) {
    el.multToggles.addEventListener('click', (e) => {
      const btn = e.target.closest('.area-btn');
      if (!btn) return;
      const mult = btn.dataset.mult;
      const allBtn = el.multToggles.querySelector('.area-btn[data-mult="ALL"]');

      if (mult === 'ALL') {
        allBtn.classList.add('active');
        el.multToggles.querySelectorAll('.area-btn').forEach(b => {
          if (b !== allBtn) b.classList.remove('active');
        });
      } else {
        const isActive = btn.classList.contains('active');
        if (isActive) {
          btn.classList.remove('active');
          allBtn.classList.add('active');
        } else {
          el.multToggles.querySelectorAll('.area-btn:not([data-mult="ALL"])').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          allBtn.classList.remove('active');
        }
      }
      update();
    });
  }

  // Bind title toggles
  if (el.titleToggles) {
    el.titleToggles.addEventListener('click', (e) => {
      const btn = e.target.closest('.area-btn');
      if (!btn) return;
      const title = btn.dataset.title;
      const allBtn = el.titleToggles.querySelector('.area-btn[data-title="ALL"]');

      if (title === 'ALL') {
        // Activate ALL and deactivate others
        allBtn.classList.add('active');
        el.titleToggles.querySelectorAll('.area-btn').forEach(b => {
          if (b !== allBtn) b.classList.remove('active');
        });
      } else {
        const isActive = btn.classList.contains('active');
        if (isActive) {
          btn.classList.remove('active');
          allBtn.classList.add('active');
        } else {
          el.titleToggles.querySelectorAll('.area-btn:not([data-title="ALL"])').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          allBtn.classList.remove('active');
        }
      }
      update();
    });
  }

  // Bind late registration expired toggle
  const showLateExpiredCheckbox = document.getElementById('showLateExpired');
  const table = document.getElementById('table');
  if (showLateExpiredCheckbox && table) {
    // Set initial state to hide late expired (default unchecked = hide)
    table.classList.add('hide-late-expired');

    showLateExpiredCheckbox.addEventListener('change', () => {
      if (showLateExpiredCheckbox.checked) {
        table.classList.remove('hide-late-expired');
      } else {
        table.classList.add('hide-late-expired');
      }
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

  // URLクエリパラメータからフィルター状態を読み込む
  loadFiltersFromURL();
}

bindEvents();
fetchAndInit();
