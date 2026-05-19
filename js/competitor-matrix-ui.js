// competitor-matrix-ui.js
// Drop this file into your project (e.g. /js/competitor-matrix-ui.js)
// Then add <script src="/js/competitor-matrix-ui.js"></script> BEFORE closing </body>
// in your main HTML — it self-initialises when the Analytics tab is active.
//
// It replaces the static "Competitor Matrix (SERP API)" section entirely.

(function () {
  "use strict";

  // ── Config ──────────────────────────────────────────────────────────────
  const FUNCTION_URL        = "/.netlify/functions/competitor-matrix";
  const BACKGROUND_URL      = "/.netlify/functions/competitor-matrix-background";
  const KEYWORD_CONFIG_URL  = "/.netlify/functions/keyword-config";
  const POLL_INTERVAL_MS    = 30000;  // check every 30s after refresh
  const POLL_MAX_ATTEMPTS   = 20;     // up to 10 minutes total

  // Brand colours matching your existing palette
  const BRAND_COLORS = {
    pickl: { primary: "#f59e0b", label: "Pickl" },
    bonbird: { primary: "#ef4444", label: "Bonbird" },
  };

  const COMPETITOR_COLORS = {
    Salt: "#6366f1",
    "High Joint": "#10b981",
    "Shake Shack": "#f97316",
    "Five Guys": "#dc2626",
  };

  // ── State ────────────────────────────────────────────────────────────────
  let currentBrandFilter = "all";
  let matrixData   = null; // { pickl: {...}, bonbird: {...} }
  let keywordData  = null; // { pickl: { keywords: [] }, bonbird: { keywords: [] } }
  let isLoading    = false;
  let currentView  = "matrix"; // "matrix" | "keywords"
  let pollTimer    = null;

  // ── Inject CSS ───────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("cm-styles")) return;
    const style = document.createElement("style");
    style.id = "cm-styles";
    style.textContent = `
      #competitor-matrix-live {
        margin-top: 24px;
      }
      .cm-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        flex-wrap: wrap;
        gap: 12px;
      }
      .cm-title {
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--text-primary, #1e293b);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .cm-badge {
        font-size: 0.65rem;
        font-weight: 600;
        background: #10b981;
        color: #fff;
        padding: 2px 7px;
        border-radius: 99px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .cm-controls {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }
      .cm-filter-btn {
        padding: 5px 14px;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.05);
        color: var(--text-secondary, #475569);
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.15s;
      }
      .cm-filter-btn.active {
        background: rgba(245,158,11,0.15);
        border-color: #f59e0b;
        color: #f59e0b;
        font-weight: 600;
      }
      .cm-refresh-btn {
        padding: 5px 14px;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.05);
        color: var(--text-secondary, #475569);
        font-size: 0.8rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s;
      }
      .cm-refresh-btn:hover { border-color: #60a5fa; color: #60a5fa; }
      .cm-refresh-btn.spinning svg { animation: cm-spin 1s linear infinite; }
      @keyframes cm-spin { to { transform: rotate(360deg); } }

      .cm-meta {
        font-size: 0.75rem;
        color: var(--text-muted, #64748b);
        margin-bottom: 12px;
      }

      .cm-table-wrap {
        overflow-x: auto;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.07);
      }
      .cm-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.82rem;
        min-width: 640px;
      }
      .cm-table th {
        background: rgba(255,255,255,0.04);
        color: var(--text-muted, #64748b);
        font-weight: 600;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 10px 14px;
        text-align: left;
        white-space: nowrap;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .cm-table td {
        padding: 10px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        color: var(--text-primary, #1e293b);
        vertical-align: middle;
      }
      .cm-table tr:last-child td { border-bottom: none; }
      .cm-table tr:hover td { background: rgba(255,255,255,0.02); }

      .cm-keyword { font-weight: 500; }
      .cm-brand-dot {
        display: inline-block;
        width: 8px; height: 8px;
        border-radius: 50%;
        margin-right: 6px;
      }

      .cm-rank {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 32px;
        height: 24px;
        border-radius: 5px;
        font-weight: 700;
        font-size: 0.78rem;
        padding: 0 6px;
      }
      .cm-rank-our {
        background: rgba(245,158,11,0.15);
        color: #f59e0b;
        border: 1px solid rgba(245,158,11,0.3);
      }
      .cm-rank-our.bonbird-rank {
        background: rgba(239,68,68,0.15);
        color: #ef4444;
        border-color: rgba(239,68,68,0.3);
      }
      .cm-rank-comp {
        background: rgba(255,255,255,0.05);
        color: var(--text-secondary, #475569);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .cm-rank-none {
        color: var(--text-muted, #475569);
        font-size: 0.7rem;
        font-style: italic;
      }
      .cm-rank-top3 {
        background: rgba(16,185,129,0.15) !important;
        color: #10b981 !important;
        border-color: rgba(16,185,129,0.3) !important;
      }
      .cm-rank-top10 {
        background: rgba(245,158,11,0.1) !important;
        color: #d97706 !important;
        border-color: rgba(245,158,11,0.2) !important;
      }
      .cm-rank-low {
        background: rgba(239,68,68,0.08) !important;
        color: #f87171 !important;
        border-color: rgba(239,68,68,0.15) !important;
      }

      .cm-movement {
        font-size: 0.78rem;
        font-weight: 600;
        white-space: nowrap;
      }
      .cm-movement.up   { color: #10b981; }
      .cm-movement.down { color: #ef4444; }
      .cm-movement.stable { color: #64748b; }
      .cm-movement.new, .cm-movement.entered { color: #60a5fa; }
      .cm-movement.dropped_out { color: #f87171; }
      .cm-movement.not_ranking { color: #475569; }

      .cm-empty {
        text-align: center;
        padding: 40px 20px;
        color: var(--text-muted, #64748b);
        font-size: 0.85rem;
      }
      .cm-error {
        background: rgba(239,68,68,0.08);
        border: 1px solid rgba(239,68,68,0.2);
        border-radius: 8px;
        padding: 14px 18px;
        color: #f87171;
        font-size: 0.85rem;
      }
      .cm-loading {
        text-align: center;
        padding: 40px 20px;
        color: var(--text-muted, #64748b);
        font-size: 0.85rem;
      }
      .cm-loading-spinner {
        display: inline-block;
        width: 20px; height: 20px;
        border: 2px solid rgba(245,158,11,0.2);
        border-top-color: #f59e0b;
        border-radius: 50%;
        animation: cm-spin 0.8s linear infinite;
        margin-bottom: 10px;
      }

      .cm-legend {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        margin-top: 12px;
        font-size: 0.72rem;
        color: var(--text-muted, #64748b);
      }
      .cm-legend-item { display: flex; align-items: center; gap: 5px; }
      .cm-legend-dot {
        width: 8px; height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .cm-summary-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-bottom: 20px;
      }
      .cm-summary-card {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 10px;
        padding: 14px 16px;
      }
      .cm-summary-card-label {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted, #64748b);
        margin-bottom: 6px;
      }
      .cm-summary-card-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-primary, #1e293b);
      }
      .cm-summary-card-sub {
        font-size: 0.72rem;
        color: var(--text-muted, #64748b);
        margin-top: 2px;
      }

      /* ── View toggle ── */
      .cm-view-toggle { display: flex; gap: 6px; }
      .cm-view-btn {
        padding: 5px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 500;
        border: 1px solid rgba(0,0,0,0.15); background: transparent;
        color: var(--text-secondary, #475569); cursor: pointer; transition: all 0.15s;
      }
      .cm-view-btn.active {
        background: #1e293b; color: #fff; border-color: #1e293b;
      }

      /* ── Keyword management ── */
      .cm-kw-section { margin-bottom: 24px; }
      .cm-kw-section-title {
        font-size: 0.8rem; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.05em; color: var(--text-muted, #64748b);
        margin-bottom: 10px; display: flex; align-items: center; gap: 8px;
      }
      .cm-kw-count {
        background: rgba(0,0,0,0.07); border-radius: 10px;
        padding: 1px 7px; font-size: 0.72rem; font-weight: 600;
      }
      .cm-kw-grid {
        display: flex; flex-wrap: wrap; gap: 6px;
      }
      .cm-kw-tag {
        display: inline-flex; align-items: center; gap: 5px;
        background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.1);
        border-radius: 20px; padding: 4px 10px 4px 12px;
        font-size: 0.78rem; color: var(--text-primary, #1e293b);
      }
      .cm-kw-tag-delete {
        background: none; border: none; cursor: pointer; padding: 0;
        color: #94a3b8; font-size: 1rem; line-height: 1;
        display: flex; align-items: center; transition: color 0.15s;
      }
      .cm-kw-tag-delete:hover { color: #ef4444; }
      .cm-kw-add-row {
        display: flex; gap: 8px; margin-top: 14px;
      }
      .cm-kw-add-input {
        flex: 1; padding: 7px 12px; border-radius: 7px; font-size: 0.82rem;
        border: 1px solid rgba(0,0,0,0.15); outline: none;
        color: var(--text-primary, #1e293b); background: #fff;
      }
      .cm-kw-add-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
      .cm-kw-add-btn {
        padding: 7px 16px; border-radius: 7px; font-size: 0.82rem; font-weight: 600;
        background: #1e293b; color: #fff; border: none; cursor: pointer; transition: background 0.15s;
      }
      .cm-kw-add-btn:hover { background: #0f172a; }
      .cm-kw-add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .cm-kw-save-bar {
        margin-top: 16px; padding: 12px 16px; background: #fffbeb;
        border: 1px solid #fcd34d; border-radius: 8px;
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        font-size: 0.82rem; color: #92400e;
      }
      .cm-kw-save-btn {
        padding: 6px 16px; border-radius: 6px; font-size: 0.82rem; font-weight: 600;
        background: #f59e0b; color: #fff; border: none; cursor: pointer;
      }
      .cm-kw-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      /* ── Confirmation modal ── */
      .cm-modal-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.45);
        display: flex; align-items: center; justify-content: center;
        z-index: 9999; animation: cm-fade-in 0.15s ease;
      }
      @keyframes cm-fade-in { from { opacity: 0; } to { opacity: 1; } }
      .cm-modal {
        background: #fff; border-radius: 12px; padding: 24px 28px;
        max-width: 400px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        animation: cm-slide-up 0.15s ease;
      }
      @keyframes cm-slide-up { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      .cm-modal-title { font-size: 1rem; font-weight: 700; color: #1e293b; margin-bottom: 8px; }
      .cm-modal-body { font-size: 0.85rem; color: #475569; margin-bottom: 20px; line-height: 1.5; }
      .cm-modal-keyword {
        display: inline-block; background: #f1f5f9; border-radius: 5px;
        padding: 2px 8px; font-weight: 600; color: #1e293b; font-size: 0.82rem;
      }
      .cm-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
      .cm-modal-cancel {
        padding: 8px 16px; border-radius: 7px; font-size: 0.82rem; font-weight: 500;
        border: 1px solid rgba(0,0,0,0.15); background: #fff; color: #475569; cursor: pointer;
      }
      .cm-modal-confirm {
        padding: 8px 16px; border-radius: 7px; font-size: 0.82rem; font-weight: 600;
        border: none; background: #ef4444; color: #fff; cursor: pointer;
      }
      .cm-modal-confirm:hover { background: #dc2626; }

      /* ── Polling status ── */
      .cm-poll-status {
        font-size: 0.75rem; color: #3b82f6; margin-top: 4px; text-align: center;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Render helpers ───────────────────────────────────────────────────────
  function rankBadge(rank, brandClass = "") {
    if (rank === null || rank === undefined) {
      return '<span class="cm-rank-none">—</span>';
    }
    let cls = "cm-rank";
    if (brandClass) cls += " " + brandClass;
    else {
      if (rank <= 3) cls += " cm-rank-top3";
      else if (rank <= 10) cls += " cm-rank-top10";
      else if (rank > 20) cls += " cm-rank-low";
      else cls += " cm-rank-comp";
    }
    return `<span class="${cls}">#${rank}</span>`;
  }

  function movementBadge(row) {
    if (!row.movement || row.movement === "new") return "";
    const map = {
      up: `▲ +${row.movementDelta}`,
      down: `▼ ${row.movementDelta}`,
      stable: "→ Stable",
      entered: "● Entered top 30",
      dropped_out: "✕ Left top 30",
      not_ranking: "",
    };
    const text = map[row.movement] || "";
    if (!text) return "";
    return `<span class="cm-movement ${row.movement}">${text}</span>`;
  }

  function formatDate(iso) {
    if (!iso) return "never";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // ── Flatten rows from both brands ────────────────────────────────────────
  function getFilteredRows() {
    if (!matrixData) return [];
    const brands =
      currentBrandFilter === "all"
        ? ["pickl", "bonbird"]
        : [currentBrandFilter];
    const rows = [];
    for (const brand of brands) {
      if (matrixData[brand]?.rows) {
        rows.push(...matrixData[brand].rows.map((r) => ({ ...r, brand })));
      }
    }
    return rows;
  }

  function getCompetitorNames() {
    const names = new Set();
    if (matrixData?.pickl?.competitors)
      matrixData.pickl.competitors.forEach((n) => names.add(n));
    if (matrixData?.bonbird?.competitors)
      matrixData.bonbird.competitors.forEach((n) => names.add(n));
    return [...names];
  }

  // ── Summary stats ────────────────────────────────────────────────────────
  function computeSummary(rows) {
    const top10 = rows.filter((r) => r.ourRank !== null && r.ourRank <= 10).length;
    const top3 = rows.filter((r) => r.ourRank !== null && r.ourRank <= 3).length;
    const improved = rows.filter((r) => r.movement === "up").length;
    const declined = rows.filter((r) => r.movement === "down").length;
    return { top10, top3, improved, declined, total: rows.length };
  }

  // ── Main render ──────────────────────────────────────────────────────────
  function render(container) {
    injectStyles();

    const rows = getFilteredRows();
    const competitors = getCompetitorNames();
    const summary = computeSummary(rows);
    const lastFetched =
      matrixData?.pickl?.fetchedAt || matrixData?.bonbird?.fetchedAt;

    let html = `
      <div class="cm-header">
        <div class="cm-title">
          Competitor Matrix
          <span class="cm-badge">Live SERP</span>
        </div>
        <div class="cm-controls">
          <div class="cm-view-toggle">
            <button class="cm-view-btn ${currentView === "matrix" ? "active" : ""}" data-view="matrix">Rankings</button>
            <button class="cm-view-btn ${currentView === "keywords" ? "active" : ""}" data-view="keywords">Manage Keywords</button>
          </div>
          ${currentView === "matrix" ? `
          <button class="cm-filter-btn ${currentBrandFilter === "all" ? "active" : ""}" data-filter="all">All Brands</button>
          <button class="cm-filter-btn ${currentBrandFilter === "pickl" ? "active" : ""}" data-filter="pickl">Pickl</button>
          <button class="cm-filter-btn ${currentBrandFilter === "bonbird" ? "active" : ""}" data-filter="bonbird">Bonbird</button>
          <button class="cm-refresh-btn ${isLoading ? "spinning" : ""}" id="cm-refresh-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            ${isLoading ? "Fetching…" : "Refresh Now"}
          </button>` : ""}
        </div>
      </div>`;

    if (lastFetched) {
      html += `<div class="cm-meta">Last updated: ${formatDate(lastFetched)} · Data via DataForSEO · UAE (EN) · Desktop</div>`;
    }

    // Summary cards
    if (rows.length > 0) {
      html += `
        <div class="cm-summary-cards">
          <div class="cm-summary-card">
            <div class="cm-summary-card-label">Top 10 Rankings</div>
            <div class="cm-summary-card-value">${summary.top10}</div>
            <div class="cm-summary-card-sub">of ${summary.total} tracked keywords</div>
          </div>
          <div class="cm-summary-card">
            <div class="cm-summary-card-label">Top 3 Rankings</div>
            <div class="cm-summary-card-value">${summary.top3}</div>
            <div class="cm-summary-card-sub">page 1, position 1–3</div>
          </div>
          <div class="cm-summary-card">
            <div class="cm-summary-card-label">Improved</div>
            <div class="cm-summary-card-value" style="color:#10b981">↑ ${summary.improved}</div>
            <div class="cm-summary-card-sub">vs last snapshot</div>
          </div>
          <div class="cm-summary-card">
            <div class="cm-summary-card-label">Declined</div>
            <div class="cm-summary-card-value" style="color:#ef4444">↓ ${summary.declined}</div>
            <div class="cm-summary-card-sub">vs last snapshot</div>
          </div>
        </div>`;
    }

    // Table
    html += `<div class="cm-table-wrap"><table class="cm-table">
      <thead><tr>
        <th>Keyword</th>
        <th>Brand</th>
        <th>Our Rank</th>
        ${competitors.map((c) => `<th>${c}</th>`).join("")}
        <th>Movement</th>
      </tr></thead>
      <tbody>`;

    if (rows.length === 0) {
      const colspan = 4 + competitors.length;
      html += `<tr><td colspan="${colspan}" class="cm-empty">
        No data yet. Click <strong>Refresh Now</strong> to fetch live rankings from DataForSEO.
      </td></tr>`;
    } else {
      for (const row of rows) {
        const brandColor = BRAND_COLORS[row.brand]?.primary || "#f59e0b";
        const ourRankClass =
          row.brand === "bonbird" ? "cm-rank bonbird-rank" : "cm-rank cm-rank-our";
        const ourRankHtml =
          row.ourRank !== null
            ? `<span class="${ourRankClass}">#${row.ourRank}</span>`
            : '<span class="cm-rank-none">—</span>';

        html += `<tr>
          <td class="cm-keyword">${row.keyword}</td>
          <td><span class="cm-brand-dot" style="background:${brandColor}"></span>${BRAND_COLORS[row.brand]?.label || row.brand}</td>
          <td>${ourRankHtml}</td>
          ${competitors
            .map((c) => `<td>${rankBadge(row.competitorRanks?.[c])}</td>`)
            .join("")}
          <td>${movementBadge(row)}</td>
        </tr>`;
      }
    }

    html += `</tbody></table></div>`;

    // Legend
    html += `<div class="cm-legend">
      <span class="cm-legend-item"><span class="cm-legend-dot" style="background:#10b981"></span>#1–3</span>
      <span class="cm-legend-item"><span class="cm-legend-dot" style="background:#d97706"></span>#4–10</span>
      <span class="cm-legend-item"><span class="cm-legend-dot" style="background:#64748b"></span>#11–100</span>
      <span class="cm-legend-item"><span class="cm-legend-dot" style="background:#f87171"></span>#100+</span>
      <span style="margin-left:auto">UAE · English · Desktop · Source: DataForSEO</span>
    </div>`;

    container.innerHTML = html;
    bindMatrixEvents(container);
  }

  function renderKeywords(container) {
    injectStyles();

    const brands = ["pickl", "bonbird"];
    const pendingChanges = {}; // track unsaved changes per brand

    let html = `
      <div class="cm-header">
        <div class="cm-title">
          Competitor Matrix
          <span class="cm-badge">Live SERP</span>
        </div>
        <div class="cm-controls">
          <div class="cm-view-toggle">
            <button class="cm-view-btn" data-view="matrix">Rankings</button>
            <button class="cm-view-btn active" data-view="keywords">Manage Keywords</button>
          </div>
        </div>
      </div>
      <div style="padding: 20px 0">`;

    for (const brand of brands) {
      const keywords = keywordData?.[brand]?.keywords || [];
      const color    = BRAND_COLORS[brand].primary;
      const label    = BRAND_COLORS[brand].label;

      html += `
        <div class="cm-kw-section" data-brand="${brand}">
          <div class="cm-kw-section-title">
            <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block"></span>
            ${label}
            <span class="cm-kw-count" id="cm-kw-count-${brand}">${keywords.length}</span>
          </div>
          <div class="cm-kw-grid" id="cm-kw-grid-${brand}">
            ${keywords.map((kw) => `
              <span class="cm-kw-tag" data-kw="${kw.replace(/"/g, '&quot;')}" data-brand="${brand}">
                ${kw}
                <button class="cm-kw-tag-delete" data-kw="${kw.replace(/"/g, '&quot;')}" data-brand="${brand}" title="Remove keyword">×</button>
              </span>`).join("")}
          </div>
          <div class="cm-kw-add-row">
            <input class="cm-kw-add-input" id="cm-kw-input-${brand}" type="text" placeholder="Add keyword e.g. crispy chicken abu dhabi" />
            <button class="cm-kw-add-btn" id="cm-kw-add-${brand}" data-brand="${brand}">Add</button>
          </div>
          <div id="cm-kw-savebar-${brand}" style="display:none" class="cm-kw-save-bar">
            <span>⚠ Unsaved changes — click Save to update keyword tracking</span>
            <button class="cm-kw-save-btn" id="cm-kw-save-${brand}" data-brand="${brand}">Save Changes</button>
          </div>
        </div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
    bindKeywordEvents(container);
  }

  function bindMatrixEvents(container) {
    container.querySelectorAll(".cm-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentBrandFilter = btn.dataset.filter;
        render(container);
      });
    });

    container.querySelectorAll(".cm-view-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentView = btn.dataset.view;
        currentView === "keywords" ? renderKeywords(container) : render(container);
      });
    });

    const refreshBtn = container.querySelector("#cm-refresh-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => loadData(container, true));
    }
  }

  function bindKeywordEvents(container) {
    // View toggle
    container.querySelectorAll(".cm-view-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentView = btn.dataset.view;
        currentView === "keywords" ? renderKeywords(container) : render(container);
      });
    });

    // Per-brand keyword state (local copy for editing)
    const localKeywords = {
      pickl:   [...(keywordData?.pickl?.keywords   || [])],
      bonbird: [...(keywordData?.bonbird?.keywords || [])],
    };

    function markUnsaved(brand) {
      const bar = container.querySelector(`#cm-kw-savebar-${brand}`);
      if (bar) bar.style.display = "flex";
    }

    function updateGrid(brand) {
      const grid = container.querySelector(`#cm-kw-grid-${brand}`);
      const count = container.querySelector(`#cm-kw-count-${brand}`);
      if (!grid) return;
      grid.innerHTML = localKeywords[brand].map((kw) => `
        <span class="cm-kw-tag" data-kw="${kw.replace(/"/g, '&quot;')}" data-brand="${brand}">
          ${kw}
          <button class="cm-kw-tag-delete" data-kw="${kw.replace(/"/g, '&quot;')}" data-brand="${brand}" title="Remove keyword">×</button>
        </span>`).join("");
      if (count) count.textContent = localKeywords[brand].length;
      // Re-bind delete buttons
      grid.querySelectorAll(".cm-kw-tag-delete").forEach((btn) => {
        btn.addEventListener("click", () => handleDelete(btn.dataset.brand, btn.dataset.kw));
      });
    }

    function handleDelete(brand, kw) {
      showDeleteModal(kw, () => {
        localKeywords[brand] = localKeywords[brand].filter((k) => k !== kw);
        updateGrid(brand);
        markUnsaved(brand);
      });
    }

    // Delete buttons
    container.querySelectorAll(".cm-kw-tag-delete").forEach((btn) => {
      btn.addEventListener("click", () => handleDelete(btn.dataset.brand, btn.dataset.kw));
    });

    // Add buttons
    ["pickl", "bonbird"].forEach((brand) => {
      const input  = container.querySelector(`#cm-kw-input-${brand}`);
      const addBtn = container.querySelector(`#cm-kw-add-${brand}`);
      const saveBtn = container.querySelector(`#cm-kw-save-${brand}`);

      if (addBtn && input) {
        const doAdd = () => {
          const val = input.value.trim().toLowerCase();
          if (!val) return;
          if (localKeywords[brand].includes(val)) {
            input.style.borderColor = "#ef4444";
            setTimeout(() => (input.style.borderColor = ""), 1500);
            return;
          }
          localKeywords[brand].push(val);
          input.value = "";
          updateGrid(brand);
          markUnsaved(brand);
        };
        addBtn.addEventListener("click", doAdd);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });
      }

      if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
          saveBtn.disabled = true;
          saveBtn.textContent = "Saving…";
          try {
            const res = await fetch(KEYWORD_CONFIG_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ brand, keywords: localKeywords[brand] }),
            });
            if (!res.ok) throw new Error("Save failed");
            // Update local keywordData
            if (!keywordData) keywordData = {};
            keywordData[brand] = { keywords: localKeywords[brand] };
            const bar = container.querySelector(`#cm-kw-savebar-${brand}`);
            if (bar) {
              bar.style.background = "#f0fdf4";
              bar.style.borderColor = "#86efac";
              bar.querySelector("span").style.color = "#166534";
              bar.querySelector("span").textContent = "✓ Saved! Refresh rankings to apply.";
              saveBtn.style.background = "#22c55e";
              saveBtn.textContent = "Saved ✓";
            }
          } catch {
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Changes";
            alert("Failed to save. Please try again.");
          }
        });
      }
    });
  }

  function showDeleteModal(keyword, onConfirm) {
    const overlay = document.createElement("div");
    overlay.className = "cm-modal-overlay";
    overlay.innerHTML = `
      <div class="cm-modal">
        <div class="cm-modal-title">Remove keyword?</div>
        <div class="cm-modal-body">
          You're about to stop tracking <span class="cm-modal-keyword">${keyword}</span>.<br><br>
          This will remove it from the next refresh. Historical data already fetched won't be affected.
        </div>
        <div class="cm-modal-actions">
          <button class="cm-modal-cancel">Cancel</button>
          <button class="cm-modal-confirm">Yes, remove it</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector(".cm-modal-cancel").addEventListener("click", () => overlay.remove());
    overlay.querySelector(".cm-modal-confirm").addEventListener("click", () => {
      overlay.remove();
      onConfirm();
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  }


  // ── Data loading ─────────────────────────────────────────────────────────
  async function loadKeywordConfig() {
    try {
      const res = await fetch(`${KEYWORD_CONFIG_URL}?brand=all`);
      if (res.ok) keywordData = await res.json();
    } catch {
      // non-fatal — keyword management just shows defaults
    }
  }

  async function loadData(container, forceRefresh = false) {
    if (isLoading) return;
    isLoading = true;

    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }

    if (forceRefresh) {
      container.innerHTML = `
        <div class="cm-loading">
          <div class="cm-loading-spinner"></div>
          <div>Refresh triggered — fetching live rankings from DataForSEO…</div>
          <div class="cm-poll-status" id="cm-poll-status">Starting background job…</div>
        </div>`;

      try { await fetch(BACKGROUND_URL, { method: "GET" }); } catch { /* 202 is fine */ }

      // Record exact trigger time — both brands must have fetchedAt AFTER this
      const triggerTime = Date.now();

      pollTimer = setInterval(async () => {
        attempts++;
        const statusEl = document.getElementById("cm-poll-status");
        if (statusEl) statusEl.textContent = `Checking for results… (${attempts * 30}s)`;

        try {
          const res = await fetch(`${FUNCTION_URL}?brand=all`);
          if (!res.ok) return;
          const data = await res.json();

          const picklFresh   = data?.pickl?.rows?.length   && new Date(data.pickl.fetchedAt).getTime()   > triggerTime;
          const bonbirdFresh = data?.bonbird?.rows?.length && new Date(data.bonbird.fetchedAt).getTime() > triggerTime;

          if (picklFresh && bonbirdFresh) {
            clearInterval(pollTimer); pollTimer = null;
            matrixData = data;
            isLoading = false;
            currentView = "matrix";
            render(container);
          } else {
            // Show progress so user knows it's working
            if (statusEl) {
              const done = [picklFresh && "Pickl ✓", bonbirdFresh && "Bonbird ✓"].filter(Boolean);
              statusEl.textContent = done.length
                ? `${done.join(", ")} done — waiting for ${done.length === 1 ? (picklFresh ? "Bonbird" : "Pickl") : ""}… (${attempts * 30}s)`
                : `Fetching… (${attempts * 30}s)`;
            }
            if (attempts >= POLL_MAX_ATTEMPTS) {
              clearInterval(pollTimer); pollTimer = null;
              if (data?.pickl?.rows || data?.bonbird?.rows) matrixData = data;
              isLoading = false;
              render(container);
            }
          }
        } catch { /* keep polling */ }
      }, POLL_INTERVAL_MS);

    } else {
      container.innerHTML = `
        <div class="cm-loading">
          <div class="cm-loading-spinner"></div>
          <div>Loading competitor matrix…</div>
        </div>`;

      try {
        const [matrixRes] = await Promise.all([
          fetch(`${FUNCTION_URL}?brand=all`),
          loadKeywordConfig(),
        ]);

        if (!matrixRes.ok) {
          const err = await matrixRes.json().catch(() => ({ error: matrixRes.statusText }));
          throw new Error(err.error || `HTTP ${matrixRes.status}`);
        }
        matrixData = await matrixRes.json();
      } catch (err) {
        console.error("[competitor-matrix-ui] Load error:", err);
        container.innerHTML = `
          <div class="cm-error">
            <strong>Failed to load competitor rankings:</strong> ${err.message}<br>
            <span style="font-size:0.75rem;opacity:0.7">Check your DataForSEO credentials in Netlify environment variables.</span>
          </div>`;
        isLoading = false;
        return;
      }

      isLoading = false;
      currentView === "keywords" ? renderKeywords(container) : render(container);
    }
  }


  // ── Init: find and replace the static section ────────────────────────────
  function init() {
    injectStyles();

    // Try to find the existing static competitor matrix section
    // Looks for the tab button "Competitor Matrix (SERP API)" or a known heading
    let targetContainer = document.getElementById("competitor-matrix-live");

    if (!targetContainer) {
      // Try to find existing static table by heading text
      const allHeadings = document.querySelectorAll("h2, h3, h4, .section-title, .tab-label");
      for (const h of allHeadings) {
        if (h.textContent.includes("Competitor Matrix")) {
          // Get the nearest parent section/div and replace its content
          const parent =
            h.closest("section") ||
            h.closest(".analytics-section") ||
            h.closest(".card") ||
            h.parentElement;
          if (parent) {
            parent.id = "competitor-matrix-live";
            targetContainer = parent;
            break;
          }
        }
      }
    }

    if (!targetContainer) {
      // Fallback: find by the static table content
      const tables = document.querySelectorAll("table");
      for (const table of tables) {
        if (
          table.innerHTML.includes("smash burger dubai") ||
          table.innerHTML.includes("Pickl Rank") ||
          table.innerHTML.includes("Salt Rank")
        ) {
          const parent =
            table.closest(".card") ||
            table.closest("section") ||
            table.parentElement;
          if (parent) {
            parent.id = "competitor-matrix-live";
            targetContainer = parent;
            break;
          }
        }
      }
    }

    if (!targetContainer) {
      // Last resort: append after the GSC rankings table
      const analyticsTab = document.getElementById("analytics") ||
        document.querySelector('[data-tab="analytics"]') ||
        document.querySelector(".analytics-tab");

      if (analyticsTab) {
        const newDiv = document.createElement("div");
        newDiv.id = "competitor-matrix-live";
        analyticsTab.appendChild(newDiv);
        targetContainer = newDiv;
      }
    }

    if (!targetContainer) {
      console.warn("[competitor-matrix-ui] Could not find Analytics tab container. Check your HTML structure.");
      return;
    }

    loadData(targetContainer, false);
  }

  // ── Watch for tab switches ───────────────────────────────────────────────
  // Initialise immediately if Analytics tab is visible, otherwise wait
  function waitForAnalyticsTab() {
    // Check if already on analytics tab
    const analyticsPanel =
      document.getElementById("analytics") ||
      document.querySelector('[role="tabpanel"][data-tab="analytics"]');

    if (analyticsPanel && analyticsPanel.style.display !== "none" &&
        !analyticsPanel.hidden) {
      init();
      return;
    }

    // Watch for tab click events
    const tabButtons = document.querySelectorAll(
      '[data-tab], .tab-btn, .nav-tab, button[onclick]'
    );
    tabButtons.forEach((btn) => {
      const isAnalyticsTab =
        btn.dataset.tab === "analytics" ||
        btn.textContent.includes("Analytics");

      if (isAnalyticsTab) {
        btn.addEventListener("click", () => {
          // Small delay to let the tab panel show
          setTimeout(init, 50);
        });
      }
    });

    // Also use MutationObserver as fallback
    const observer = new MutationObserver(() => {
      const panel =
        document.getElementById("analytics") ||
        document.querySelector('[data-tab="analytics"]');
      if (panel && getComputedStyle(panel).display !== "none") {
        init();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { attributes: true, subtree: true });
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForAnalyticsTab);
  } else {
    waitForAnalyticsTab();
  }

  // Expose globally for manual trigger and for switchAnalyticsView hook
  window.competitorMatrix = {
    // Called by switchAnalyticsView when comp tab is clicked
    init: () => {
      const c = document.getElementById("competitor-matrix-live");
      if (c && !matrixData) loadData(c, false); // only load if not already loaded
    },
    // Force a fresh DataForSEO pull from browser console
    reload: () => {
      const c = document.getElementById("competitor-matrix-live");
      if (c) loadData(c, true);
    },
  };
})();
