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
  const REFRESH_POLL_DELAY  = 90000; // ms to wait before polling — ~40s pickl + ~40s bonbird

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
  let matrixData = null; // { pickl: {...}, bonbird: {...} }
  let isLoading = false;

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
          <button class="cm-filter-btn ${currentBrandFilter === "all" ? "active" : ""}" data-filter="all">All Brands</button>
          <button class="cm-filter-btn ${currentBrandFilter === "pickl" ? "active" : ""}" data-filter="pickl">Pickl</button>
          <button class="cm-filter-btn ${currentBrandFilter === "bonbird" ? "active" : ""}" data-filter="bonbird">Bonbird</button>
          <button class="cm-refresh-btn ${isLoading ? "spinning" : ""}" id="cm-refresh-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            ${isLoading ? "Fetching…" : "Refresh Now"}
          </button>
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
      <span class="cm-legend-item"><span class="cm-legend-dot" style="background:#64748b"></span>#11–30</span>
      <span class="cm-legend-item"><span class="cm-legend-dot" style="background:#f87171"></span>#21+</span>
      <span style="margin-left:auto">UAE · English · Desktop · Source: DataForSEO</span>
    </div>`;

    container.innerHTML = html;

    // Bind events
    container.querySelectorAll(".cm-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentBrandFilter = btn.dataset.filter;
        render(container);
      });
    });

    const refreshBtn = container.querySelector("#cm-refresh-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => loadData(container, true));
    }
  }

  // ── Data loading ─────────────────────────────────────────────────────────
  async function loadData(container, forceRefresh = false) {
    if (isLoading) return;
    isLoading = true;

    if (forceRefresh) {
      // Fire the background function (returns 202 immediately — runs async on Netlify)
      container.innerHTML = `
        <div class="cm-loading">
          <div class="cm-loading-spinner"></div>
          <div>Refresh triggered — fetching live rankings from DataForSEO…</div>
          <div style="margin-top:6px;font-size:0.72rem;color:#475569">This runs in the background and takes ~30 seconds. Checking for results…</div>
        </div>`;

      try {
        await fetch(BACKGROUND_URL, { method: "GET" });
      } catch {
        // 202 or network hiccup — either way the background job is running
      }

      // Poll for fresh cache after the background function has had time to finish
      await new Promise((resolve) => setTimeout(resolve, REFRESH_POLL_DELAY));
    } else {
      container.innerHTML = `
        <div class="cm-loading">
          <div class="cm-loading-spinner"></div>
          <div>Loading competitor matrix…</div>
        </div>`;
    }

    try {
      const res = await fetch(`${FUNCTION_URL}?brand=all`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      matrixData = await res.json();
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
    render(container);
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
