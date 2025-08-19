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

  return {
    ...row,
    entry_fee,
    add_on,
    guaranteed_amount,
    total_prize,
    date_only: dateOnly,
    start_dt: startDT,
    start_time_ts: startDT ? startDT.getTime() : -Infinity,
    late_reg_dt: lateRegDT,
  };
}

function setStatus(msg) {
  el.status.textContent = msg || "";
}

// area toggles: buttons with .area-btn.active represent enabled filters

function applyFilters() {
  const allActive = !!document.querySelector('.area-btn[data-area="ALL"].active');
  const activeAreas = Array.from(document.querySelectorAll('.area-btn.active'))
    .map(b => b.dataset.area)
    .filter(a => a !== 'ALL');
  let rows = state.data.slice();

  if (!allActive && activeAreas.length > 0) {
    rows = rows.filter(r => activeAreas.includes((r.area || "").trim()));
  }

  state.filtered = rows;
}

function sortRows() {
  const { key, dir } = state.sort;
  const mul = dir === "desc" ? -1 : 1;

  const numKeys = new Set(["entry_fee", "add_on", "guaranteed_amount", "total_prize", "start_time", "start_time_ts"]);
  const dateKey = key === "start_time" ? "start_time_ts" : key;

  state.filtered.sort((a, b) => {
    const ka = dateKey in a ? a[dateKey] : a[key];
    const kb = dateKey in b ? b[dateKey] : b[key];

    const an = numKeys.has(key) || dateKey === "start_time_ts";

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
    el.tbody.innerHTML = `<tr><td colspan="8" style="color:#a8b2d1;padding:16px;">該当データがありません</td></tr>`;
    return;
  }
  const html = rows.map(r => {
    const startStr = r.start_dt ? `${fmtDate(r.start_dt)} ${fmtTime(r.start_dt)}` : (r.start_time || "");
    const feeStr = r.entry_fee != null ? r.entry_fee.toLocaleString() : "";
    const addOnStr = r.add_on != null ? r.add_on.toLocaleString() : "";
    const gtdStr = r.guaranteed_amount != null ? r.guaranteed_amount.toLocaleString() : "";

    const link = r.link || "";
    const linkHtml = link ? `<span class="badge-link"><a href="${link}" target="_blank" rel="noreferrer noopener">リンク↗</a></span>` : "";

    return `
      <tr>
        <td>${startStr}</td>
        <td>${r.shop_name || ""}</td>
        <td>${r.area || ""}</td>
        <td>${r.title || ""}</td>
        <td class="number">${feeStr}</td>
        <td class="number">${addOnStr}</td>
        <td class="number">${gtdStr}</td>
        <td>${linkHtml}</td>
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
        // Toggle specific area
        btn.classList.toggle('active');
        const anySpecificActive = el.areaToggles.querySelector('.area-btn.active:not([data-area="ALL"])');
        if (anySpecificActive) {
          // If any specific area active, ALL off
          allBtn.classList.remove('active');
        } else {
          // If none active, turn ALL back on
          allBtn.classList.add('active');
        }
      }
      update();
    });
  }
}

bindEvents();
fetchAndInit();
