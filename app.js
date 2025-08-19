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
};

function parseIntSafe(v) {
  if (v == null) return null;
  const s = String(v).replace(/[,\s円]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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

function normalizeRow(row) {
  const entry_fee = parseIntSafe(row.entry_fee);
  const add_on = parseIntSafe(row.add_on);
  const guaranteed_amount = parseIntSafe(row.guaranteed_amount);
  const total_prize = parseIntSafe(row.total_prize);

  const dateOnly = parseDateTimeJP(row.date);
  const startDT = parseDateTimeJP(row.start_time);
  const lateRegDT = parseDateTimeJP(row.late_registration_time);
  const multiplier = (guaranteed_amount != null && entry_fee && entry_fee > 0)
    ? (guaranteed_amount / entry_fee)
    : null;

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
    rows = rows.filter(r => activeAreas.includes((r.area || "").trim()));
  }

  // Multiplier filter
  if (el.multToggles) {
    const multAll = !!el.multToggles.querySelector('.area-btn[data-mult="ALL"].active');
    if (!multAll) {
      const activeMultBtn = el.multToggles.querySelector('.area-btn.active:not([data-mult="ALL"])');
      const sel = activeMultBtn?.dataset.mult;
      if (sel === '10-19') {
        rows = rows.filter(r => r.multiplier != null && isFinite(r.multiplier) && r.multiplier >= 10 && r.multiplier < 20);
      } else if (sel === '20-29') {
        rows = rows.filter(r => r.multiplier != null && isFinite(r.multiplier) && r.multiplier >= 20 && r.multiplier < 30);
      } else if (sel === '30plus') {
        rows = rows.filter(r => r.multiplier != null && isFinite(r.multiplier) && r.multiplier >= 30);
      }
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
  const html = rows.map(r => {
    const dateStr = r.date_only ? fmtDate(r.date_only) : (r.date || "");
    const startStr = r.start_dt ? `${fmtTime(r.start_dt)}` : (r.start_time || "");
    const lateStr = r.late_reg_dt ? `${fmtTime(r.late_reg_dt)}` : (r.late_registration_time || "");
    const feeStr = r.entry_fee != null ? r.entry_fee.toLocaleString() : "";
    const addOnStr = r.add_on != null ? r.add_on.toLocaleString() : "";
    const totalPrizeStr = r.total_prize != null ? r.total_prize.toLocaleString() : "";
    const multStr = (r.multiplier != null && isFinite(r.multiplier)) ? `${(Math.round(r.multiplier * 10) / 10).toFixed(1)}x` : "";
    let rowClass = '';
    if (r.multiplier != null && isFinite(r.multiplier)) {
      if (r.multiplier >= 30) rowClass = 'hl-mult-30plus';
      else if (r.multiplier >= 20) rowClass = 'hl-mult-20plus';
      else if (r.multiplier >= 10) rowClass = 'hl-mult-10to19';
    }

    return `
      <tr class="${rowClass}">
        <td>${dateStr}</td>
        <td>${startStr}</td>
        <td>${lateStr}</td>
        <td>${r.area || ""}</td>
        <td>${r.shop_name || ""}</td>
        <td>${r.title || ""}</td>
        <td class="number">${feeStr}</td>
        <td class="number">${addOnStr}</td>
        <td class="number">${totalPrizeStr}</td>
        <td class="number">${multStr}</td>
        <td>${(r.prize_text || "").toString().replace(/\n+/g, ' / ')}</td>
      </tr>`;
  }).join("");
  el.tbody.innerHTML = html;
}

function update() {
  applyFilters();
  sortRows();
  updateSortIndicator();
  render();
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
}

bindEvents();
fetchAndInit();
