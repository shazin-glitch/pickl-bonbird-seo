// competitor-matrix-ui.js  — Pass 2 rebuild (June 2026)
// Views: Rankings · Share of Voice · 🎯 Gaps · Manage Keywords · Manage Competitors

(function () {
  "use strict";

  const FUNCTION_URL          = "/.netlify/functions/competitor-matrix";
  const BACKGROUND_URL        = "/.netlify/functions/competitor-matrix-background";
  const KEYWORD_CONFIG_URL    = "/.netlify/functions/keyword-config";
  const COMPETITOR_CONFIG_URL = "/.netlify/functions/competitor-config";
  const POLL_INTERVAL_MS      = 30000;
  const POLL_MAX_ATTEMPTS     = 20;

  const BRAND_COLORS = {
    pickl:   { primary: "#f59e0b", label: "Pickl" },
    bonbird: { primary: "#ef4444", label: "Bonbird" },
  };

  // ── SERP Occupier detection ────────────────────────────────────────────────
  // These are aggregators, review sites, media, delivery platforms.
  // They belong in a separate "SERP Landscape" section — not in the competitor SoV chart.
  // Strategy vs them is: get LISTED, not outranked.
  const SERP_OCCUPIER_TERMS = [
    "tripadvisor","zomato","timeout","timeoutdubai","youtube","instagram","facebook",
    "talabat","deliveroo","noon","careem","whats-on","whatson","thenational","gulfnews",
    "khaleejtimes","visitdubai","dubizzle","yelp","foursquare","openrice","entertainer",
    "time-out","hungerstation","noonfood","twitter","tiktok","linkedin","google",
    "reddit","x.com","quora","medium.com","pinterest","threads","snapchat","booking",
    "agoda","trustpilot","apple.com","apps.apple","play.google","indeed","glassdoor",
    "bayt","mrsool","jahez","thechefz","ubereats","wikipedia",
  ];

  function isSerpOccupier(domain) {
    const lower = (domain || "").toLowerCase();
    return SERP_OCCUPIER_TERMS.some(term => lower.includes(term));
  }

  // Locale label for the active market (stops the matrix mislabelling intl data as "UAE (EN)").
  function cmLocaleLabel() {
    if (!currentMarketFilter || currentMarketFilter === "uae") return "UAE · English";
    const txt = (document.querySelector("#cm-market-filter option:checked")?.textContent || currentMarketFilter).trim();
    return txt.replace(/^[^A-Za-z]+/, "") || currentMarketFilter; // strip leading flag emoji
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let currentBrandFilter  = "all";
  let currentMarketFilter = "uae"; // 'uae' | market key e.g. 'pickl_bahrain'
  let matrixData          = null;
  let keywordData        = null;
  let competitorData     = null;
  let marketCompetitorData = null; // intl per-market manual overrides { [brand]: { competitors } }
  let isLoading          = false;
  let currentView        = "matrix";
  let pollTimer          = null;
  let pollAttempts       = 0;

  // ── CSS ────────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("cm-styles")) return;
    const s = document.createElement("style");
    s.id = "cm-styles";
    s.textContent = `
      #competitor-matrix-live { margin-top:24px; }
      /* Main toolbar row — view toggle left, actions right */
      .cm-toolbar { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
      .cm-toolbar-right { margin-left:auto; display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
      /* Title row below toolbar */
      .cm-header { margin-bottom:4px; }
      .cm-badge { font-size:0.65rem; font-weight:600; background:#10b981; color:#fff; padding:2px 7px; border-radius:99px; letter-spacing:0.05em; text-transform:uppercase; }
      .cm-controls { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .cm-filter-btn { padding:5px 14px; border-radius:6px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.05); color:var(--text-secondary,#475569); font-size:0.8rem; cursor:pointer; transition:all 0.15s; }
      .cm-filter-btn.active { background:rgba(245,158,11,0.15); border-color:#f59e0b; color:#f59e0b; font-weight:600; }
      .cm-refresh-btn { padding:5px 14px; border-radius:6px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.05); color:var(--text-secondary,#475569); font-size:0.8rem; cursor:pointer; display:flex; align-items:center; gap:6px; transition:all 0.15s; }
      .cm-refresh-btn:hover { border-color:#60a5fa; color:#60a5fa; }
      .cm-refresh-btn.spinning svg { animation:cm-spin 1s linear infinite; }
      @keyframes cm-spin { to { transform:rotate(360deg); } }
      .cm-meta { font-size:0.75rem; color:var(--text-muted,#64748b); margin-bottom:12px; }
      .cm-table-wrap { overflow-x:auto; border-radius:10px; border:1px solid rgba(255,255,255,0.07); }
      .cm-table { width:100%; border-collapse:collapse; font-size:0.82rem; min-width:640px; }
      .cm-table th { background:rgba(255,255,255,0.04); color:var(--text-muted,#64748b); font-weight:600; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; padding:10px 14px; text-align:left; white-space:nowrap; border-bottom:1px solid rgba(255,255,255,0.06); }
      .cm-table td { padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.04); color:var(--text-main); vertical-align:middle; }
      .cm-table tr:last-child td { border-bottom:none; }
      .cm-table tr:hover td { background:rgba(255,255,255,0.02); }
      .cm-keyword { font-weight:500; }
      .cm-brand-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
      .cm-rank { display:inline-flex; align-items:center; justify-content:center; min-width:32px; height:24px; border-radius:5px; font-weight:700; font-size:0.78rem; padding:0 6px; }
      .cm-rank-our { background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); }
      .cm-rank-our.bonbird-rank { background:rgba(239,68,68,0.15); color:#ef4444; border-color:rgba(239,68,68,0.3); }
      .cm-rank-comp { background:rgba(255,255,255,0.05); color:var(--text-secondary,#475569); border:1px solid rgba(255,255,255,0.08); }
      .cm-rank-none { color:var(--text-muted,#475569); font-size:0.7rem; font-style:italic; }
      .cm-rank-top3 { background:rgba(16,185,129,0.15)!important; color:#10b981!important; border-color:rgba(16,185,129,0.3)!important; }
      .cm-rank-top10 { background:rgba(245,158,11,0.1)!important; color:#d97706!important; border-color:rgba(245,158,11,0.2)!important; }
      .cm-rank-low { background:rgba(239,68,68,0.08)!important; color:#f87171!important; border-color:rgba(239,68,68,0.15)!important; }
      .cm-movement { font-size:0.78rem; font-weight:600; white-space:nowrap; }
      .cm-movement.up { color:#10b981; }
      .cm-movement.down { color:#ef4444; }
      .cm-movement.stable { color:#64748b; }
      .cm-movement.new,.cm-movement.entered { color:#60a5fa; }
      .cm-movement.dropped_out { color:#f87171; }
      .cm-feature-pill { display:inline-block; padding:1px 6px; border-radius:4px; font-size:0.66rem; font-weight:600; margin:1px; white-space:nowrap; }
      .cm-feature-snippet { background:#fef3c7; color:#92400e; }
      .cm-feature-pack    { background:#dcfce7; color:#166534; }
      .cm-feature-paa     { background:#ede9fe; color:#5b21b6; }
      .cm-feature-video   { background:#fee2e2; color:#991b1b; }
      .cm-feature-ai      { background:#dbeafe; color:#1e40af; }
      .cm-empty { text-align:center; padding:40px 20px; color:var(--text-muted,#64748b); font-size:0.85rem; }
      .cm-error { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); border-radius:8px; padding:14px 18px; color:#f87171; font-size:0.85rem; }
      .cm-loading { text-align:center; padding:40px 20px; color:var(--text-muted,#64748b); font-size:0.85rem; }
      .cm-loading-spinner { display:inline-block; width:20px; height:20px; border:2px solid rgba(245,158,11,0.2); border-top-color:#f59e0b; border-radius:50%; animation:cm-spin 0.8s linear infinite; margin-bottom:10px; }
      .cm-legend { display:flex; gap:16px; flex-wrap:wrap; margin-top:12px; font-size:0.72rem; color:var(--text-muted,#64748b); }
      .cm-legend-item { display:flex; align-items:center; gap:5px; }
      .cm-legend-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
      .cm-summary-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:20px; }
      .cm-summary-card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:14px 16px; }
      .cm-summary-card-label { font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted,#64748b); margin-bottom:6px; }
      .cm-summary-card-value { font-size:1.5rem; font-weight:700; color:var(--text-main); }
      .cm-summary-card-sub { font-size:0.72rem; color:var(--text-muted,#64748b); margin-top:2px; }
      .cm-view-toggle { display:flex; gap:6px; flex-wrap:wrap; }
      .cm-view-btn { padding:5px 12px; border-radius:6px; font-size:0.78rem; font-weight:500; border:1px solid rgba(0,0,0,0.15); background:transparent; color:var(--text-secondary,#475569); cursor:pointer; transition:all 0.15s; }
      .cm-view-btn.active { background:#1e293b; color:#fff; border-color:#1e293b; }
      .cm-alert-banner { background:#fffbeb; border:1px solid #fcd34d; border-radius:8px; padding:12px 16px; margin-bottom:16px; font-size:0.82rem; color:#92400e; }
      .cm-alert-banner strong { color:#78350f; }
      .cm-alert-domain { display:inline-block; background:#fef3c7; border:1px solid #fbbf24; border-radius:4px; padding:1px 7px; font-size:0.75rem; font-weight:600; margin:2px; cursor:pointer; }
      .cm-alert-domain:hover { background:#fde68a; }
      .cm-kw-section { margin-bottom:24px; }
      .cm-kw-section-title { font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted,#64748b); margin-bottom:10px; display:flex; align-items:center; gap:8px; }
      .cm-kw-count { background:rgba(0,0,0,0.07); border-radius:10px; padding:1px 7px; font-size:0.72rem; font-weight:600; }
      .cm-kw-grid { display:flex; flex-wrap:wrap; gap:6px; }
      .cm-kw-tag { display:inline-flex; align-items:center; gap:5px; background:rgba(0,0,0,0.05); border:1px solid rgba(0,0,0,0.1); border-radius:20px; padding:4px 10px 4px 12px; font-size:0.78rem; color:var(--text-main); }
      .cm-kw-tag-delete { background:none; border:none; cursor:pointer; padding:0; color:#94a3b8; font-size:1rem; line-height:1; display:flex; align-items:center; transition:color 0.15s; }
      .cm-kw-tag-delete:hover { color:#ef4444; }
      .cm-kw-add-row { display:flex; gap:8px; margin-top:14px; }
      .cm-kw-add-input { flex:1; padding:7px 12px; border-radius:7px; font-size:0.82rem; border:1px solid var(--border,rgba(0,0,0,0.15)); outline:none; color:var(--text-main); background:var(--bg-surface,#fff); }
      .cm-kw-add-input:focus { border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,0.1); }
      .cm-kw-add-btn { padding:7px 16px; border-radius:7px; font-size:0.82rem; font-weight:600; background:#1e293b; color:#fff; border:none; cursor:pointer; }
      .cm-kw-save-bar { margin-top:16px; padding:12px 16px; background:#fffbeb; border:1px solid #fcd34d; border-radius:8px; display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:0.82rem; color:#92400e; }
      .cm-kw-save-btn { padding:6px 16px; border-radius:6px; font-size:0.82rem; font-weight:600; background:#f59e0b; color:#fff; border:none; cursor:pointer; }
      .cm-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; z-index:9999; }
      .cm-modal { background:#fff; border-radius:12px; padding:24px 28px; max-width:400px; width:90%; box-shadow:0 20px 60px rgba(0,0,0,0.2); }
      .cm-modal-title { font-size:1rem; font-weight:700; color:#1e293b; margin-bottom:8px; }
      .cm-modal-body { font-size:0.85rem; color:#475569; margin-bottom:20px; line-height:1.5; }
      .cm-modal-keyword { display:inline-block; background:#f1f5f9; border-radius:5px; padding:2px 8px; font-weight:600; color:#1e293b; }
      .cm-modal-actions { display:flex; gap:10px; justify-content:flex-end; }
      .cm-modal-cancel { padding:8px 16px; border-radius:7px; font-size:0.82rem; border:1px solid rgba(0,0,0,0.15); background:#fff; color:#475569; cursor:pointer; }
      .cm-modal-confirm { padding:8px 16px; border-radius:7px; font-size:0.82rem; font-weight:600; border:none; background:#ef4444; color:#fff; cursor:pointer; }
      .cm-poll-status { font-size:0.75rem; color:#3b82f6; margin-top:4px; text-align:center; }
      /* Share of Voice chart */
      .cm-sov-chart-wrap { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:20px; margin-bottom:20px; }
      .cm-sov-chart-title { font-size:0.85rem; font-weight:700; margin-bottom:16px; color:var(--text-main); }
      .cm-sov-bars { display:flex; flex-direction:column; gap:8px; }
      .cm-sov-bar-row { display:flex; align-items:center; gap:10px; }
      .cm-sov-bar-label { width:140px; font-size:0.78rem; font-weight:500; text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text-secondary,#475569); flex-shrink:0; }
      .cm-sov-bar-track { flex:1; background:rgba(255,255,255,0.06); border-radius:4px; height:20px; position:relative; }
      .cm-sov-bar-fill { height:100%; border-radius:4px; transition:width 0.6s ease; display:flex; align-items:center; justify-content:flex-end; padding-right:6px; }
      .cm-sov-bar-pct { font-size:0.7rem; font-weight:700; color:#fff; white-space:nowrap; }
      .cm-sov-history-chart { margin-top:20px; }
      .cm-sov-history-title { font-size:0.8rem; font-weight:600; color:var(--text-muted,#64748b); margin-bottom:12px; }
      .cm-export-btn { padding:5px 14px; border-radius:6px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.05); color:var(--text-secondary,#475569); font-size:0.8rem; cursor:pointer; transition:all 0.15s; }
      .cm-export-btn:hover { border-color:#10b981; color:#10b981; }
      /* Queue button */
      .cm-queue-btn { padding:3px 9px; border-radius:5px; font-size:11px; font-weight:600; border:1px solid rgba(245,158,11,0.3); background:rgba(245,158,11,0.08); color:#d97706; cursor:pointer; white-space:nowrap; transition:all 0.15s; }
      .cm-queue-btn:hover { background:rgba(245,158,11,0.18); border-color:#f59e0b; }
      .cm-queue-btn.queued { background:rgba(16,185,129,0.1); border-color:rgba(16,185,129,0.3); color:#059669; cursor:default; }
      .cm-queue-btn:disabled { opacity:0.5; cursor:not-allowed; }
    `;
    document.head.appendChild(s);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function rankBadge(rank, brandClass = "") {
    if (rank == null) return '<span class="cm-rank-none">—</span>';
    let cls = "cm-rank";
    if (brandClass) cls += " " + brandClass;
    else if (rank <= 3)  cls += " cm-rank-top3";
    else if (rank <= 10) cls += " cm-rank-top10";
    else if (rank > 20)  cls += " cm-rank-low";
    else                 cls += " cm-rank-comp";
    return `<span class="${cls}">#${rank}</span>`;
  }

  function movementBadge(row) {
    if (!row.movement || row.movement === "new") return "";
    const map = {
      up:          `▲ +${row.movementDelta}`,
      down:        `▼ ${row.movementDelta}`,
      stable:      "→ Stable",
      entered:     "● Entered",
      dropped_out: "✕ Left",
    };
    const text = map[row.movement] || "";
    if (!text) return "";
    return `<span class="cm-movement ${row.movement}">${text}</span>`;
  }

  function serpFeaturePills(features) {
    if (!features) return "";
    const pills = [];
    if (features.featuredSnippet) pills.push(`<span class="cm-feature-pill cm-feature-snippet">⭐ Snippet${typeof features.featuredSnippet === "string" ? " · " + features.featuredSnippet.split(".")[0] : ""}</span>`);
    if (features.localPack)       pills.push('<span class="cm-feature-pill cm-feature-pack">📍 Local Pack</span>');
    if (features.peopleAlsoAsk)   pills.push('<span class="cm-feature-pill cm-feature-paa">💬 PAA</span>');
    if (features.video)           pills.push('<span class="cm-feature-pill cm-feature-video">▶ Video</span>');
    if (features.aiOverview)      pills.push('<span class="cm-feature-pill cm-feature-ai">🤖 AI</span>');
    return pills.join("");
  }

  function formatDate(iso) {
    if (!iso) return "never";
    return new Date(iso).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
  }

  function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  // ── Data helpers ───────────────────────────────────────────────────────────
  function getFilteredRows() {
    if (!matrixData) return [];
    const brands = currentBrandFilter === "all" ? ["pickl","bonbird"] : [currentBrandFilter];
    return brands.flatMap(b => (matrixData[b]?.rows || []).map(r => ({ ...r, brand: b })));
  }

  function getCompetitorNames() {
    const names = new Set();
    const brands = currentBrandFilter === "all" ? ["pickl","bonbird"] : [currentBrandFilter];
    for (const b of brands) {
      (matrixData?.[b]?.competitors || []).forEach(n => names.add(n));
    }
    return [...names];
  }

  function computeSummary(rows) {
    return {
      top10:    rows.filter(r => r.ourRank != null && r.ourRank <= 10).length,
      top3:     rows.filter(r => r.ourRank != null && r.ourRank <= 3).length,
      improved: rows.filter(r => r.movement === "up").length,
      declined: rows.filter(r => r.movement === "down").length,
      total:    rows.length,
    };
  }

  function getAutoDetectedAlerts() {
    const brands = currentBrandFilter === "all" ? ["pickl","bonbird"] : [currentBrandFilter];
    return brands.flatMap(b => (matrixData?.[b]?.autoDetected || []).slice(0, 5).map(d => ({ ...d, brand: b })));
  }

  function getSovData() {
    const brands = currentBrandFilter === "all" ? ["pickl","bonbird"] : [currentBrandFilter];
    if (brands.length === 1) {
      return matrixData?.[brands[0]]?.sovCurrent || {};
    }
    // Merge SoV across brands (average per domain across brands that have it)
    const combined = {};
    const brandCounts = {};
    for (const b of brands) {
      const sov = matrixData?.[b]?.sovCurrent || {};
      for (const [domain, pct] of Object.entries(sov)) {
        combined[domain]    = (combined[domain] || 0) + pct;
        brandCounts[domain] = (brandCounts[domain] || 0) + 1;
      }
    }
    for (const domain of Object.keys(combined)) {
      combined[domain] = combined[domain] / brandCounts[domain];
    }
    return combined;
  }

  // ── Competitor trend: avg position movement across all tracked keywords ────
  function computeCompetitorTrends(rows, competitors) {
    const trends = {};
    for (const comp of competitors) {
      const moved = rows.filter(r => r.movement && r.competitorRanks?.[comp] != null);
      if (!moved.length) { trends[comp] = null; continue; }
      // We don't have prev competitor position directly, use our movement as proxy
      const ups   = rows.filter(r => r.competitorRanks?.[comp] != null && r.competitorRanks[comp] <= 5).length;
      const total = rows.filter(r => r.competitorRanks?.[comp] != null).length;
      trends[comp] = total > 0 ? Math.round((ups / total) * 100) : null;
    }
    return trends;
  }

  // ── View toggle HTML ───────────────────────────────────────────────────────
  function viewToggleHtml(active) {
    const views = [
      { key:"matrix", label:"Rankings" },
      { key:"sov",    label:"📊 Share of Voice" },
      { key:"gaps",   label:"🎯 Gaps" },
      { key:"keywords",    label:"Manage Keywords" },
      { key:"competitors", label:"Manage Competitors" },
    ];
    return `<div class="cm-view-toggle">${views.map(v =>
      `<button class="cm-view-btn ${active === v.key ? "active" : ""}" data-view="${v.key}">${v.label}</button>`
    ).join("")}</div>`;
  }

  function marketFilterHtml() {
    const markets = [
      { key:'uae',             label:'🇦🇪 UAE' },
      { key:'pickl_bahrain',   label:'🇧🇭 Bahrain' },
      { key:'pickl_ksa',       label:'🇸🇦 KSA' },
      { key:'pickl_qatar',     label:'🇶🇦 Qatar (P)' },
      { key:'pickl_egypt',     label:'🇪🇬 Egypt' },
      { key:'pickl_jordan',    label:'🇯🇴 Jordan' },
      { key:'pickl_oman',      label:'🇴🇲 Oman (P)' },
      { key:'bonbird_oman',    label:'🇴🇲 Oman (B)' },
      { key:'bonbird_pakistan',label:'🇵🇰 Pakistan' },
      { key:'bonbird_qatar',   label:'🇶🇦 Qatar (B)' },
    ];
    return `<select id="cm-market-filter" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:var(--bg-surface,#fff);color:var(--text-secondary,#475569);font-size:0.8rem;cursor:pointer" onchange="cmMarketChanged(this.value)">
      ${markets.map(m => `<option value="${m.key}" ${currentMarketFilter===m.key?'selected':''}>${m.label}</option>`).join('')}
    </select>`;
  }

  function brandFilterHtml() {
    return `
      ${marketFilterHtml()}
      <button class="cm-filter-btn ${currentBrandFilter === "all"     ? "active" : ""}" data-filter="all">All</button>
      <button class="cm-filter-btn ${currentBrandFilter === "pickl"   ? "active" : ""}" data-filter="pickl">Pickl</button>
      <button class="cm-filter-btn ${currentBrandFilter === "bonbird" ? "active" : ""}" data-filter="bonbird">Bonbird</button>`;
  }

  // ── Unknown competitor alert banner ───────────────────────────────────────
  function renderAlertBanner(container) {
    const alerts = getAutoDetectedAlerts();
    if (!alerts.length) return "";
    const brands = currentBrandFilter === "all" ? ["pickl","bonbird"] : [currentBrandFilter];
    const items  = alerts.slice(0, 8);
    return `
      <div class="cm-alert-banner">
        <strong>🔍 ${alerts.length} unknown competitor${alerts.length !== 1 ? "s" : ""} detected</strong> — appearing in 3+ of your tracked keywords but not on your list:
        <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
          ${items.map(d => `<span class="cm-alert-domain" title="${d.appearances} appearances · ${d.sampleKeywords?.join(", ") || ""}" data-domain="${esc(d.domain)}" data-brand="${d.brand}">${esc(d.domain)} <small style="opacity:.7">(${d.appearances})</small></span>`).join("")}
          ${alerts.length > 8 ? `<span style="font-size:0.75rem;color:#92400e;padding:2px 4px">+${alerts.length - 8} more</span>` : ""}
        </div>
        <div style="font-size:0.75rem;margin-top:6px;opacity:0.7">Click a domain to add it to your competitor tracking list.</div>
      </div>`;
  }

  // ── Consistent toolbar header — view toggle always left, actions right ────────
  function renderHeader(activeView, opts = {}) {
    const { title, subtitle, showBrandFilter, showRefresh, showExport } = opts;
    const rightItems = [];
    if (showBrandFilter) rightItems.push(brandFilterHtml());
    if (showRefresh) rightItems.push(`
      <button class="cm-refresh-btn ${isLoading ? 'spinning' : ''}" id="cm-refresh-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        ${isLoading ? 'Fetching…' : 'Refresh Now'}
      </button>`);
    if (showExport) rightItems.push('<button class="cm-export-btn" id="cm-export-btn">⬇ CSV</button>');

    return `
      <div class="cm-toolbar">
        ${viewToggleHtml(activeView)}
        ${rightItems.length ? `<div class="cm-toolbar-right">${rightItems.join('')}</div>` : ''}
      </div>
      ${title || subtitle ? `<div class="cm-header">
        ${title ? `<div class="cm-title">${title}</div>` : ''}
        ${subtitle ? `<p style="font-size:0.78rem;color:var(--text-muted,#64748b);margin:2px 0 12px">${subtitle}</p>` : ''}
      </div>` : ''}`;
  }

  // ── Rankings view ──────────────────────────────────────────────────────────
  function render(container) {
    injectStyles();
    const rows        = getFilteredRows();
    const competitors = getCompetitorNames();
    const summary     = computeSummary(rows);
    const lastFetched = matrixData?.pickl?.fetchedAt || matrixData?.bonbird?.fetchedAt;
    const sovData     = getSovData();
    const ourBrand    = currentBrandFilter !== "all" ? currentBrandFilter : "pickl";
    const ourDomain   = matrixData?.[ourBrand]?.ourDomain || "";
    const ourSoV      = ourDomain ? (sovData[ourDomain] || 0).toFixed(1) : "—";

    let html = renderHeader("matrix", {
      title: `Competitor Matrix <span class="cm-badge">Live SERP</span>`,
      showBrandFilter: true, showRefresh: true, showExport: true,
    });

    if (lastFetched) html += `<div class="cm-meta">Last updated: ${formatDate(lastFetched)} · DataForSEO · ${cmLocaleLabel()} · Desktop</div>`;

    html += renderAlertBanner(container);

    // Summary cards
    if (rows.length > 0) {
      html += `<div class="cm-summary-cards">
        <div class="cm-summary-card">
          <div class="cm-summary-card-label">Top 10 Rankings</div>
          <div class="cm-summary-card-value">${summary.top10}</div>
          <div class="cm-summary-card-sub">of ${summary.total} tracked keywords</div>
        </div>
        <div class="cm-summary-card">
          <div class="cm-summary-card-label">Top 3 Rankings</div>
          <div class="cm-summary-card-value">${summary.top3}</div>
          <div class="cm-summary-card-sub">positions 1–3</div>
        </div>
        <div class="cm-summary-card">
          <div class="cm-summary-card-label">Share of Voice</div>
          <div class="cm-summary-card-value" style="color:#f59e0b">${ourSoV}%</div>
          <div class="cm-summary-card-sub">of tracked keyword visibility</div>
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

    // Empty state — rendered OUTSIDE the table for correct layout
    if (!rows.length) {
      const brand     = currentBrandFilter !== "all" ? currentBrandFilter : "pickl";
      const brandData = matrixData?.[brand] || matrixData?.pickl || {};
      const fetchedAt = brandData.fetchedAt;
      const lastError = brandData.lastError;
      const lastRun   = fetchedAt ? new Date(fetchedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : null;
      const errorBlock = lastError
        ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#991b1b;text-align:left;max-width:440px;margin-left:auto;margin-right:auto"><strong>Last error:</strong> ${esc(lastError)}</div>`
        : '';
      html += `<div style="text-align:center;padding:48px 24px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-top:12px">
        <div style="font-size:28px;margin-bottom:10px">📊</div>
        <div style="font-weight:700;font-size:15px;margin-bottom:6px;color:#1e293b">No keyword ranking data</div>
        ${lastRun ? `<div style="font-size:12px;color:#64748b;margin-bottom:8px">Last attempted: ${lastRun}</div>` : ''}
        ${errorBlock}
        <div style="font-size:13px;color:#64748b;margin-bottom:16px;max-width:420px;margin-left:auto;margin-right:auto">
          Check <strong>Manage Keywords</strong> to confirm keywords are set, then click Refresh.<br>
          If it keeps failing, check DataForSEO balance at <a href="https://app.dataforseo.com" target="_blank" style="color:#2563eb">app.dataforseo.com</a>.
        </div>
        <button onclick="document.getElementById('cm-refresh-btn')?.click()" style="background:#2563eb;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:13px;cursor:pointer;font-weight:600">↻ Refresh Now</button>
      </div>`;
      container.innerHTML = html;
      bindMatrixEvents(container);
      return;
    }

    // Table
    html += `<div class="cm-table-wrap"><table class="cm-table">
      <thead><tr>
        <th>Keyword</th><th>Brand</th><th>Vol/mo</th><th>KD</th><th>Our Rank</th>
        ${competitors.map(c => `<th>${esc(c)}</th>`).join("")}
        <th>SERP Features</th><th>Movement</th>
      </tr></thead><tbody>`;

    {
      for (const row of rows) {
        const brandColor   = BRAND_COLORS[row.brand]?.primary || "#f59e0b";
        const ourRankClass = row.brand === "bonbird" ? "cm-rank bonbird-rank" : "cm-rank cm-rank-our";
        const ourRankHtml  = row.ourRank != null
          ? `<span class="${ourRankClass}">#${row.ourRank}</span>`
          : '<span class="cm-rank-none">—</span>';
        const volTxt = row.searchVolume ? row.searchVolume.toLocaleString() : '—';
        const kd     = row.keywordDifficulty;
        const kdColor = kd == null ? 'var(--text-muted)' : kd >= 70 ? '#ef4444' : kd >= 40 ? '#d97706' : '#10b981';
        const kdTxt  = kd == null ? '—' : kd;
        html += `<tr>
          <td class="cm-keyword">${esc(row.keyword)}</td>
          <td><span class="cm-brand-dot" style="background:${brandColor}"></span>${BRAND_COLORS[row.brand]?.label || row.brand}</td>
          <td style="color:var(--text-muted);font-size:0.78rem;white-space:nowrap">${volTxt}</td>
          <td style="font-size:0.78rem;font-weight:600;color:${kdColor}">${kdTxt}</td>
          <td>${ourRankHtml}</td>
          ${competitors.map(c => `<td>${rankBadge(row.competitorRanks?.[c])}</td>`).join("")}
          <td>${serpFeaturePills(row.serpFeatures)}</td>
          <td>${movementBadge(row)}</td>
        </tr>`;
      }
    }

    html += `</tbody></table></div>`;
    html += `<div class="cm-legend">
      <span class="cm-legend-item"><span class="cm-legend-dot" style="background:#10b981"></span>#1–3</span>
      <span class="cm-legend-item"><span class="cm-legend-dot" style="background:#d97706"></span>#4–10</span>
      <span class="cm-legend-item"><span class="cm-legend-dot" style="background:#64748b"></span>#11–20</span>
      <span class="cm-legend-item"><span class="cm-legend-dot" style="background:#f87171"></span>#21+</span>
      <span style="margin-left:auto">${cmLocaleLabel()} · Desktop · Source: DataForSEO</span>
    </div>`;

    container.innerHTML = html;
    bindMatrixEvents(container);
  }

  // ── Share of Voice view ────────────────────────────────────────────────────
  function renderSoV(container) {
    injectStyles();
    const sovData     = getSovData();
    const lastFetched = matrixData?.pickl?.fetchedAt || matrixData?.bonbird?.fetchedAt;

    // Split into direct competitors vs SERP occupiers
    const allEntries = Object.entries(sovData).filter(([,v]) => v > 0).sort(([,a],[,b]) => b - a);
    const directEntries   = allEntries.filter(([domain]) => !isSerpOccupier(domain)).slice(0, 12);
    const occupierEntries = allEntries.filter(([domain]) => isSerpOccupier(domain)).slice(0, 10);

    // Domain → display name mapping
    const domainLabel = {};
    for (const b of ["pickl","bonbird"]) {
      if (matrixData?.[b]) {
        const od = matrixData[b].ourDomain;
        if (od) domainLabel[od] = BRAND_COLORS[b]?.label + " (us)";
      }
    }

    const barColors = [
      "#f59e0b","#ef4444","#6366f1","#10b981","#f97316",
      "#8b5cf6","#06b6d4","#ec4899","#84cc16","#14b8a6",
    ];

    const brands      = currentBrandFilter === "all" ? ["pickl","bonbird"] : [currentBrandFilter];
    const historyData = brands.flatMap(b => (matrixData?.[b]?.sovHistory || []).map(h => ({ ...h, brand: b })));

    let html = renderHeader("sov", {
      title: `📊 Share of Voice <span class="cm-badge">CTR-Weighted</span>`,
      showBrandFilter: true,
    });

    if (lastFetched) html += `<div class="cm-meta">Last updated: ${formatDate(lastFetched)} · CTR-weighted % of visibility across tracked keywords</div>`;

    html += `<p style="font-size:0.82rem;color:var(--text-muted,#64748b);margin-bottom:16px;line-height:1.5">
      Share of Voice = estimated clicks captured across all tracked keywords. Uses real CTR curve (pos 1 = 30%, pos 5 = 7%, etc.).
      <strong>Direct competitors only</strong> — aggregators and media sites are separated below because the strategy is different: get listed on them, not outrank them.
    </p>`;

    if (!directEntries.length) {
      html += `<div class="cm-empty">No SoV data yet. Click <strong>Refresh Now</strong> to calculate.</div>`;
    } else {

      // ── Direct competitors chart ────────────────────────────────────────────
      html += `<div class="cm-sov-chart-wrap">
        <div class="cm-sov-chart-title">Direct Competitors — Share of Organic Visibility</div>
        <div class="cm-sov-bars">`;

      directEntries.forEach(([domain, pct], i) => {
        const label = domainLabel[domain] || domain;
        const color = barColors[i % barColors.length];
        const width = Math.max(2, Math.min(100, pct));
        html += `<div class="cm-sov-bar-row">
          <div class="cm-sov-bar-label" title="${esc(domain)}">${esc(label)}</div>
          <div class="cm-sov-bar-track">
            <div class="cm-sov-bar-fill" style="width:${width}%;background:${color}">
              <span class="cm-sov-bar-pct">${pct.toFixed(1)}%</span>
            </div>
          </div>
        </div>`;
      });

      html += `</div></div>`;

      if (historyData.length > 1) {
        html += renderSovHistoryChart(historyData, directEntries, barColors);
      } else if (historyData.length === 1) {
        html += `<div style="font-size:12px;color:var(--text-muted);padding:10px 0;font-style:italic">📅 First data point recorded ${new Date(historyData[0].date).toLocaleDateString('en-GB', {day:'numeric',month:'short'})}. Trend line will appear after next Monday's run.</div>`;
      }

      // ── SERP Landscape (collapsible) ────────────────────────────────────────
      if (occupierEntries.length) {
        const occupierTotal = occupierEntries.reduce((s,[,v]) => s + v, 0).toFixed(1);
        html += `
          <div style="margin-top:24px">
            <div style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;user-select:none" id="cm-landscape-toggle" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('.cm-toggle-icon').textContent=this.nextElementSibling.style.display==='none'?'▶':'▼'">
              <span style="font-size:13px;font-weight:700">🌐 SERP Landscape</span>
              <span style="font-size:12px;color:var(--text-muted)">${occupierEntries.length} aggregators &amp; media sites · ${occupierTotal}% combined visibility</span>
              <span class="cm-toggle-icon" style="margin-left:auto;font-size:11px;color:var(--text-muted)">▶</span>
            </div>
            <div style="display:none;padding:14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-top:none;border-radius:0 0 8px 8px">
              <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.5">
                These sites occupy your SERPs but aren't direct competitors — they're <strong>distribution channels</strong>.
                The right move is to get your brand listed and reviewed on them (Zomato, TripAdvisor, Time Out), 
                not to try to outrank them for generic terms.
              </p>
              <div class="cm-sov-bars" style="gap:6px">`;

        occupierEntries.forEach(([domain, pct], i) => {
          const width = Math.max(1, Math.min(100, pct));
          html += `<div class="cm-sov-bar-row" style="gap:8px">
            <div class="cm-sov-bar-label" style="width:160px;font-size:0.74rem">${esc(domain)}</div>
            <div class="cm-sov-bar-track" style="height:16px">
              <div class="cm-sov-bar-fill" style="width:${width}%;background:#94a3b8">
                <span class="cm-sov-bar-pct" style="font-size:0.65rem">${pct.toFixed(1)}%</span>
              </div>
            </div>
          </div>`;
        });

        html += `</div></div></div>`;
      }
    }

    container.innerHTML = html;
    bindViewToggle(container);
    container.querySelectorAll(".cm-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => { currentBrandFilter = btn.dataset.filter; renderSoV(container); });
    });
  }

  function renderSovHistoryChart(historyData, topDomains, barColors) {
    // Group by date
    const dateMap = {};
    for (const h of historyData) {
      if (!dateMap[h.date]) dateMap[h.date] = {};
      Object.assign(dateMap[h.date], h.sov || {});
    }
    const dates = Object.keys(dateMap).sort();
    if (dates.length < 2) return "";

    const W = 600, H = 220, PAD = { t:20, r:20, b:40, l:50 };
    const cw = W - PAD.l - PAD.r;
    const ch = H - PAD.t - PAD.b;
    const xStep = cw / Math.max(dates.length - 1, 1);

    // Only chart top 5 domains
    const chartDomains = topDomains.slice(0, 5).map(([d]) => d);

    // Find y-max
    const yMax = Math.min(100, Math.max(20,
      Math.ceil(Math.max(...chartDomains.flatMap(d => dates.map(dt => dateMap[dt]?.[d] || 0))) / 5) * 5 + 5
    ));

    function x(i) { return PAD.l + i * xStep; }
    function y(v) { return PAD.t + ch - (v / yMax) * ch; }

    let lines = "";
    let legend = "";
    chartDomains.forEach((domain, di) => {
      const color  = barColors[di % barColors.length];
      const points = dates.map((dt, i) => `${x(i).toFixed(1)},${y(dateMap[dt]?.[domain] || 0).toFixed(1)}`).join(" ");
      lines += `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
      dates.forEach((dt, i) => {
        const v = dateMap[dt]?.[domain] || 0;
        if (v > 0) lines += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${color}"/>`;
      });
      legend += `<span style="display:inline-flex;align-items:center;gap:5px;font-size:0.72rem;color:#475569">
        <span style="width:12px;height:3px;background:${color};border-radius:2px;display:inline-block"></span>
        ${esc(domain.split(".")[0])}
      </span>`;
    });

    // Y axis ticks
    let yTicks = "";
    for (let v = 0; v <= yMax; v += (yMax > 30 ? 10 : 5)) {
      const yy = y(v).toFixed(1);
      yTicks += `<line x1="${PAD.l}" y1="${yy}" x2="${W - PAD.r}" y2="${yy}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
      yTicks += `<text x="${PAD.l - 6}" y="${yy}" text-anchor="end" fill="#64748b" font-size="10" dominant-baseline="middle">${v}%</text>`;
    }

    // X axis labels (abbreviated dates)
    let xLabels = "";
    dates.forEach((dt, i) => {
      const short = new Date(dt).toLocaleDateString("en-GB", { month:"short", day:"numeric" });
      xLabels += `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="#64748b" font-size="9">${short}</text>`;
    });

    return `<div class="cm-sov-history-chart">
      <div class="cm-sov-history-title">Share of Voice Trend (last ${dates.length} weeks)</div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;overflow:visible;display:block">
        ${yTicks}${lines}${xLabels}
      </svg>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">${legend}</div>
    </div>`;
  }

  // ── Gaps view ──────────────────────────────────────────────────────────────
  function renderGaps(container) {
    injectStyles();
    const brands      = currentBrandFilter === "all" ? ["pickl","bonbird"] : [currentBrandFilter];
    const competitors = getCompetitorNames();

    // ── Section A: Competitor-discovered keywords ─────────────────────────────
    // Keywords from DataForSEO Labs ranked_keywords that competitors rank for.
    // These are the real content opportunities — keywords that exist outside our tracked list.
    // Group by competitor → show their top non-branded keywords + search volume.
    const discoveredByComp = {};
    let totalDiscovered = 0;

    for (const brand of brands) {
      const rankedKw = matrixData?.[brand]?.rankedKeywords || {};
      const ourGscKeywords = new Set((matrixData?.[brand]?.rows || []).map(r => r.keyword?.toLowerCase()));

      for (const [domain, kwList] of Object.entries(rankedKw)) {
        if (!kwList?.length) continue;
        // Find competitor display name from config
        const compName = (matrixData?.[brand]?.competitors || []).find(() => true) || domain;
        const key = `${brand}::${domain}`;
        discoveredByComp[key] = {
          domain, brand,
          name: compName, // will be overridden below
          keywords: kwList
            .filter(k => k.keyword)
            .map(k => ({
              ...k,
              inOurGsc: ourGscKeywords.has(k.keyword.toLowerCase()),
            })),
        };
        totalDiscovered += kwList.length;
      }

      // Resolve display names by matching domains to competitor config
      const compConfig = matrixData?.[brand]?.rows?.[0]?.competitorRanks
        ? Object.keys(matrixData[brand].rows[0].competitorRanks)
        : [];
      for (const [domain, kwList] of Object.entries(rankedKw)) {
        const key = `${brand}::${domain}`;
        if (discoveredByComp[key]) {
          // Try to find name from the first row's competitorRanks keys
          // The names come from config — match via known competitor list
          const knownComps = [
            {n:"Salt", d:"saltuae.com"}, {n:"High Joint", d:"highjoint.co"},
            {n:"Shake Shack", d:"shakeshack.com"}, {n:"Five Guys", d:"fiveguys.ae"},
            {n:"Raising Cane's", d:"raisingcanes.com"}, {n:"Jailbird", d:"jailbirddubai.com"},
            {n:"Dave's Hot Chicken", d:"daveshotchicken.com"}, {n:"Toit", d:"toitchicken.com"},
            {n:"Nash Hot Chicken", d:"nashhotchicken.com"}, {n:"Peppers", d:"peppersuae.com"},
            {n:"Jollibee", d:"jollibee.com.ph"}, {n:"KFC", d:"kfc.com"}, {n:"Popeyes", d:"popeyes.com"},
          ];
          const match = knownComps.find(c => c.d === domain || c.d === domain.replace(/^www\./, ""));
          if (match) discoveredByComp[key].name = match.n;
          else discoveredByComp[key].name = domain.split(".")[0];
        }
      }
    }

    // ── Section B: Tracked-keyword gaps ─────────────────────────────────────
    const gapRows = [];
    for (const brand of brands) {
      for (const row of (matrixData?.[brand]?.rows || [])) {
        if (row.ourRank != null && row.ourRank <= 30) continue;
        for (const [comp, rank] of Object.entries(row.competitorRanks || {})) {
          if (rank && rank <= 20) {
            gapRows.push({
              keyword: row.keyword, brand, competitor: comp,
              competitorRank: rank, ourRank: row.ourRank,
              opportunity: rank <= 5 ? "high" : rank <= 10 ? "medium" : "low",
            });
          }
        }
      }
    }
    gapRows.sort((a, b) => a.competitorRank - b.competitorRank);
    const byComp = {};
    for (const row of gapRows) {
      if (!byComp[row.competitor]) byComp[row.competitor] = [];
      byComp[row.competitor].push(row);
    }

    const oppColor = { high:"#ef4444", medium:"#f59e0b", low:"#6b7280" };
    const oppLabel = { high:"🔴 High", medium:"🟡 Medium", low:"⚪ Low" };

    let html = renderHeader("gaps", {
      title: "🎯 Content Strategy — Competitor Gaps",
      subtitle: "What your competitors rank for that you don't. These are direct content briefs. Ranked by search volume.",
      showBrandFilter: true,
    });

    // ── Competitor-discovered keywords (main section) ─────────────────────────
    if (totalDiscovered > 0) {
      const newKwCount = Object.values(discoveredByComp).reduce((s, c) =>
        s + c.keywords.filter(k => !k.inOurGsc).length, 0);

      html += `<div class="cm-summary-cards" style="margin-bottom:20px">
        <div class="cm-summary-card">
          <div class="cm-summary-card-label">Competitor Keywords Found</div>
          <div class="cm-summary-card-value">${totalDiscovered}</div>
          <div class="cm-summary-card-sub">non-branded, top 50 per competitor</div>
        </div>
        <div class="cm-summary-card">
          <div class="cm-summary-card-label">You Don't Rank For</div>
          <div class="cm-summary-card-value" style="color:#ef4444">${newKwCount}</div>
          <div class="cm-summary-card-sub">not in your current GSC data</div>
        </div>
        <div class="cm-summary-card">
          <div class="cm-summary-card-label">Competitors Analysed</div>
          <div class="cm-summary-card-value">${Object.keys(discoveredByComp).length}</div>
          <div class="cm-summary-card-sub">via DataForSEO Labs</div>
        </div>
      </div>`;

      for (const { domain, brand, name, keywords } of Object.values(discoveredByComp)) {
        const notRanking = keywords.filter(k => !k.inOurGsc);
        const ranking    = keywords.filter(k => k.inOurGsc);
        if (!notRanking.length && !ranking.length) continue;

        const brandColor = BRAND_COLORS[brand]?.primary || "#f59e0b";
        html += `<div style="margin-bottom:24px">
          <div style="font-weight:700;font-size:14px;padding:10px 0 8px;border-bottom:2px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;gap:12px">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="cm-brand-dot" style="background:${brandColor};width:10px;height:10px"></span>
              <span>${esc(name)}</span>
              <span style="font-size:11px;color:var(--text-muted)">${esc(domain)}</span>
            </div>
            <span style="font-size:12px;color:var(--text-muted);font-weight:400">${notRanking.length} gaps · ${ranking.length} shared</span>
          </div>`;

        if (notRanking.length) {
          html += `<div style="margin-top:4px;margin-bottom:8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#ef4444">🎯 Keywords they rank for that you don't</div>
            <table class="cm-table" style="margin-top:0"><thead><tr>
              <th>Keyword</th><th>Their Position</th><th>Search Volume</th><th>CPC</th><th></th>
            </tr></thead><tbody>
            ${(()=>{ const compKey = (name||domain).replace(/\W/g,'_'); return notRanking.map((k, idx) => `<tr class="cm-gap-row-${compKey}" ${idx >= 20 ? 'style="display:none"' : ''}>
              <td style="font-weight:600">${esc(k.keyword)}</td>
              <td><span class="cm-rank ${k.position <= 3 ? "cm-rank-top3" : k.position <= 10 ? "cm-rank-top10" : "cm-rank-comp"}">#${k.position || "?"}</span></td>
              <td style="color:var(--text-muted)">${k.searchVolume ? k.searchVolume.toLocaleString() : "—"}</td>
              <td style="color:var(--text-muted)">${k.cpc ? "$" + k.cpc.toFixed(2) : "—"}</td>
              <td><button class="cm-queue-btn" data-keyword="${esc(k.keyword)}" data-brand="${brand}" title="Add to priority queue for Monday">📝 Queue</button></td>
            </tr>`).join("") + (notRanking.length > 20 ? `<tr id="cm-show-more-${compKey}"><td colspan="5" style="padding:6px 14px"><button onclick="cmShowAllGaps('${compKey}',this)" style="font-size:12px;color:var(--primary);background:none;border:none;cursor:pointer;padding:0;font-weight:600">+ Show ${notRanking.length - 20} more keywords ▾</button></td></tr>` : ""); })()}
            </tbody></table>`;
        }

        html += `</div>`;
      }
    } else {
      // No ranked_keywords data — check if there's a Labs error
      const labsErr = brands.map(b => matrixData?.[b]?.labsError).find(Boolean);
      if (labsErr) {
        html += `<div style="padding:16px 20px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:10px;margin-bottom:20px">
          <div style="font-weight:700;font-size:14px;color:#ef4444;margin-bottom:6px">⚠ DataForSEO Labs error</div>
          <div style="font-size:13px;line-height:1.6;margin-bottom:8px">${esc(labsErr)}</div>
          <div style="font-size:12px;color:var(--text-muted)">
            DataForSEO Labs is a separate product from the SERP API. Check your DataForSEO account at
            <strong>app.dataforseo.com → API Access</strong> to confirm Labs is enabled.
            The SERP rankings above will still work without Labs access.
          </div>
        </div>`;
      } else {
        html += `<div style="padding:20px;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.2);border-radius:10px;margin-bottom:20px">
          <div style="font-weight:700;font-size:14px;color:#3b82f6;margin-bottom:8px">🔄 Competitor keyword data not yet fetched</div>
          <div style="font-size:13px;line-height:1.6">
            The next Monday run will fetch the top 50 non-branded keywords each competitor ranks for via DataForSEO Labs.
            These become your direct content briefs — keywords you know work in your category because a competitor already ranks for them.
          </div>
          <div style="margin-top:10px;font-size:13px">
            Click <strong>Refresh Now</strong> in the Rankings tab to run immediately.
          </div>
        </div>`;
      }
    }

    // ── Tracked-keyword gaps (secondary section) ──────────────────────────────
    html += `<div style="margin-top:8px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.08)">
      <div style="font-weight:700;font-size:13px;margin-bottom:4px">Within Tracked Keywords</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Gaps within your ${getFilteredRows().length}-keyword tracking list — where competitors rank top 20 and you don't appear at all.</div>`;

    if (!gapRows.length) {
      html += `<div style="font-size:13px;color:#059669;padding:8px 0">✅ You rank for everything in your current tracked keyword set.</div>`;
    } else {
      html += `<div style="font-size:13px;color:#ef4444;font-weight:600;margin-bottom:12px">${gapRows.length} gap${gapRows.length!==1?"s":""} found across ${Object.keys(byComp).length} competitor${Object.keys(byComp).length!==1?"s":""}</div>`;
      for (const [comp, rows] of Object.entries(byComp)) {
        html += `<div style="margin-bottom:16px">
          <div style="font-weight:600;font-size:13px;margin-bottom:4px">${esc(comp)} — ${rows.length} keyword${rows.length!==1?"s":""}</div>
          <table class="cm-table" style="margin-top:0"><thead><tr>
            <th>Keyword</th><th>Their Rank</th><th>Your Rank</th><th>Opportunity</th><th></th>
          </tr></thead><tbody>
          ${rows.map(r => `<tr>
            <td style="font-weight:500">${esc(r.keyword)}</td>
            <td><span class="cm-rank" style="background:#fee2e2;color:#dc2626;font-weight:700">#${r.competitorRank}</span></td>
            <td><span style="color:#94a3b8;font-size:12px">${r.ourRank ? "#"+r.ourRank : "Not ranking"}</span></td>
            <td><span style="color:${oppColor[r.opportunity]};font-weight:600;font-size:12px">${oppLabel[r.opportunity]}</span></td>
            <td><button class="cm-queue-btn" data-keyword="${esc(r.keyword)}" data-brand="${r.brand}" title="Add to priority queue">📝 Queue</button></td>
          </tr>`).join("")}
          </tbody></table>
        </div>`;
      }
    }
    html += `</div>`;

    container.innerHTML = html;
    bindViewToggle(container);
    container.querySelectorAll(".cm-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => { currentBrandFilter = btn.dataset.filter; renderGaps(container); });
    });
    // Queue buttons — add keyword to seed list (scheduler picks up Monday, or trigger manually)
    container.querySelectorAll(".cm-queue-btn").forEach(btn => {
      btn.addEventListener("click", () => queueGapKeyword(btn));
    });
  }

  async function queueGapKeyword(btn) {
    const keyword = btn.dataset.keyword;
    const brand   = btn.dataset.brand || currentBrandFilter;
    if (!keyword || !brand || brand === "all") return;

    // Guard: queuing to the seed list is UAE-only. On an intl market this would
    // silently write to the UAE list (which intl doesn't even consume).
    if (currentMarketFilter && currentMarketFilter !== "uae") {
      btn.textContent = "UAE-only";
      alert("Queuing gap keywords to the content pipeline is UAE-only.\n\nInternational markets are driven automatically by the per-market keyword-discovery pipeline — no manual queue needed.");
      setTimeout(() => { btn.textContent = "📝 Queue"; }, 2000);
      return;
    }

    btn.disabled = true;
    btn.textContent = "Adding…";

    try {
      // Fetch current seed keywords, add the new one, save back
      const getRes  = await fetch(`/api/seed-keywords?brand=${brand}`, { credentials: "include" });
      const current = getRes.ok ? (await getRes.json()).keywords || [] : [];

      if (current.includes(keyword.toLowerCase())) {
        btn.textContent = "✓ Already queued";
        btn.classList.add("queued");
        return;
      }

      const updated = [...current, keyword.toLowerCase()];
      const saveRes = await fetch("/api/seed-keywords", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ brand, keywords: updated }),
      });

      if (!saveRes.ok) throw new Error("Save failed");

      btn.textContent = "✓ Queued";
      btn.classList.add("queued");

      // Show a dismissible tip about triggering now
      const row = btn.closest("tr");
      if (row) {
        const tip = document.createElement("tr");
        tip.innerHTML = `<td colspan="5" style="padding:6px 14px;background:rgba(16,185,129,0.06);font-size:11px;color:#059669">
          ✓ <strong>${keyword}</strong> added to Priority Gap seed list for ${brand === "pickl" ? "Pickl" : "Bonbird"}.
          Runs next Monday 8am Dubai — or go to <strong>Settings & Logs → Run Scheduler</strong> to generate now.
          <a href="#" onclick="event.preventDefault()" style="color:#059669;text-decoration:underline;margin-left:4px">dismiss</a>
        </td>`;
        tip.querySelector("a").addEventListener("click", () => tip.remove());
        row.insertAdjacentElement("afterend", tip);
      }

    } catch (e) {
      btn.textContent = "📝 Queue";
      btn.disabled = false;
      console.error("[competitor-matrix] Queue error:", e.message);
    }
  }

  // ── Keywords management view ───────────────────────────────────────────────
  function renderKeywords(container) {
    injectStyles();
    // Guard: the tracked-keyword list is UAE-only. Editing it while an intl market
    // is selected would silently overwrite the UAE list (intl markets use preset
    // per-market seed keywords + SERP auto-detection, not this list).
    if (currentMarketFilter && currentMarketFilter !== "uae") {
      container.innerHTML = renderHeader("keywords", { showBrandFilter: true }) +
        `<div style="padding:24px;background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;margin-top:12px;font-size:13px;color:#92400e;line-height:1.6">
          <strong>Keyword tracking list is UAE-only.</strong><br>
          International markets use preset seed keywords per market, and their competitor matrix auto-detects keywords from the market's SERPs — there's no manual list to edit here. Switch the market back to 🇦🇪 UAE (in the dropdown above) to edit the UAE keyword list.
        </div>`;
      bindViewToggle(container);
      container.querySelectorAll(".cm-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => { currentBrandFilter = btn.dataset.filter; renderKeywords(container); });
      });
      return;
    }
    let html = renderHeader("keywords", { showBrandFilter: true }) + `<div style="padding:20px 0">`;

    for (const brand of ["pickl","bonbird"]) {
      const keywords = keywordData?.[brand]?.keywords || [];
      const color    = BRAND_COLORS[brand].primary;
      html += `<div class="cm-kw-section" data-brand="${brand}">
        <div class="cm-kw-section-title">
          <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block"></span>
          ${BRAND_COLORS[brand].label} <span class="cm-kw-count" id="cm-kw-count-${brand}">${keywords.length}</span>
        </div>
        <div class="cm-kw-grid" id="cm-kw-grid-${brand}">
          ${keywords.map(kw => `<span class="cm-kw-tag" data-kw="${esc(kw)}" data-brand="${brand}">${esc(kw)}<button class="cm-kw-tag-delete" data-kw="${esc(kw)}" data-brand="${brand}">×</button></span>`).join("")}
        </div>
        <div class="cm-kw-add-row">
          <input class="cm-kw-add-input" id="cm-kw-input-${brand}" type="text" placeholder="Add keyword e.g. crispy chicken abu dhabi"/>
          <button class="cm-kw-add-btn" id="cm-kw-add-${brand}" data-brand="${brand}">Add</button>
        </div>
        <div id="cm-kw-savebar-${brand}" style="display:none" class="cm-kw-save-bar">
          <span>⚠ Unsaved changes — click Save to update</span>
          <button class="cm-kw-save-btn" id="cm-kw-save-${brand}" data-brand="${brand}">Save Changes</button>
        </div>
      </div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
    bindKeywordEvents(container);
  }

  // ── Competitors management view ────────────────────────────────────────────
  function renderCompetitors(container) {
    if (currentMarketFilter && currentMarketFilter !== "uae") {
      return renderCompetitorsIntl(container);
    }
    injectStyles();
    let html = renderHeader("competitors") + `
      <div style="padding:20px 0">
        <p style="font-size:13px;color:#64748b;margin-bottom:16px">Add or remove tracked competitors. Changes apply on next Refresh Now.</p>

        <!-- Auto-discovery section -->
        <div style="background:linear-gradient(135deg,rgba(99,102,241,0.06),rgba(245,158,11,0.06));border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:16px 20px;margin-bottom:24px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
              <div style="font-weight:700;font-size:13px;margin-bottom:2px">🔍 Auto-Discover Competitors</div>
              <div style="font-size:12px;color:#64748b">DataForSEO finds who's competing for your keywords — no manual entry needed</div>
            </div>
            <div style="display:flex;gap:8px">
              <button id="cm-discover-pickl" onclick="cmDiscoverCompetitors('pickl',this)" style="padding:6px 14px;background:#f59e0b;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Discover Pickl</button>
              <button id="cm-discover-bonbird" onclick="cmDiscoverCompetitors('bonbird',this)" style="padding:6px 14px;background:#ef4444;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Discover Bonbird</button>
            </div>
          </div>
          <div id="cm-discover-results" style="margin-top:8px"></div>
        </div>`;

    for (const brand of ["pickl","bonbird"]) {
      const competitors = competitorData?.[brand]?.competitors || [];
      html += `<div class="cm-kw-section" data-brand="${brand}" style="margin-bottom:24px">
        <div class="cm-kw-section-title">
          <span style="width:10px;height:10px;border-radius:50%;background:${BRAND_COLORS[brand].primary};display:inline-block"></span>
          ${BRAND_COLORS[brand].label} Competitors <span class="cm-kw-count" id="cm-comp-count-${brand}">${competitors.length}</span>
        </div>
        <div class="cm-comp-grid" id="cm-comp-grid-${brand}">
          ${competitors.map(c => `<span class="cm-kw-tag">
            <span>${esc(c.name)}</span><span style="font-size:10px;color:#94a3b8">${esc(c.domain)}</span>
            <button class="cm-kw-tag-delete cm-comp-delete" data-comp="${esc(c.name)}" data-brand="${brand}">×</button>
          </span>`).join("")}
        </div>
        <div class="cm-kw-add-row" style="flex-wrap:wrap">
          <input class="cm-kw-add-input" id="cm-comp-name-${brand}" type="text" placeholder="Name e.g. Jailbird" style="flex:1;min-width:130px"/>
          <input class="cm-kw-add-input" id="cm-comp-domain-${brand}" type="text" placeholder="Domain e.g. jailbirddubai.com" style="flex:1;min-width:170px"/>
          <button class="cm-kw-add-btn" id="cm-comp-add-${brand}" data-brand="${brand}">Add</button>
        </div>
        <div id="cm-comp-savebar-${brand}" style="display:none" class="cm-kw-save-bar">
          <span>⚠ Unsaved changes — click Save to update</span>
          <button class="cm-kw-save-btn" id="cm-comp-save-${brand}" data-brand="${brand}">Save Changes</button>
        </div>
      </div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
    bindCompetitorEvents(container);
  }

  // ── Competitors management — international per-market (hybrid) ───────────────
  // For intl markets there is no curated default list. The effective competitor
  // set used by the matrix run = manual overrides (saved here) ∪ top auto-detected
  // domains. This view lets the user promote auto-detected domains into the manual
  // list and curate it. Saves to competitorConfig:<brand>:<market>.
  function renderCompetitorsIntl(container) {
    injectStyles();
    const marketKey   = currentMarketFilter;
    const brand       = marketKey.split("_")[0];
    const marketLabel = (document.querySelector("#cm-market-filter option:checked")?.textContent || marketKey).trim();
    const manual      = marketCompetitorData?.[brand]?.competitors || [];
    const auto        = matrixData?.[brand]?.autoDetected || [];
    const hasMatrixRun = !!(matrixData?.[brand]?.fetchedAt);
    const color       = BRAND_COLORS[brand]?.primary || "#f59e0b";

    let html = renderHeader("competitors", { showBrandFilter: true });
    html += `<div style="padding:20px 0">
      <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:14px 18px;margin-bottom:20px">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px">🌍 ${esc(marketLabel)} — Hybrid Competitor Tracking</div>
        <div style="font-size:12px;color:#64748b;line-height:1.5">
          Unlike UAE, international markets have no preset competitor list. Each run <strong>auto-detects</strong> the domains
          that keep showing up in this market's SERPs, and combines them with any you pin below. Promote the ones that matter,
          ignore the rest. Changes apply on the next Refresh Now (or the monthly run).
        </div>
      </div>`;

    // ── Auto-detected (promotable) ───────────────────────────────────────────
    const manualDomains = new Set(manual.map(c => c.domain.replace(/^www\./, "")));
    const autoNotManual = auto.filter(d => !manualDomains.has(d.domain.replace(/^www\./, "")));
    html += `<div class="cm-kw-section" style="margin-bottom:24px">
      <div class="cm-kw-section-title">🔍 Auto-Detected in ${esc(marketLabel)} <span class="cm-kw-count">${autoNotManual.length}</span></div>`;
    if (!hasMatrixRun) {
      html += `<div style="font-size:12px;color:#64748b;padding:6px 0">No data yet for this market. Click <strong>Refresh Now</strong> in the Rankings tab to run it once — auto-detected competitors will appear here.</div>`;
    } else if (!autoNotManual.length) {
      html += `<div style="font-size:12px;color:#64748b;padding:6px 0">Nothing new auto-detected (everything found is already pinned below, or the SERPs were dominated by aggregators).</div>`;
    } else {
      html += `<div class="cm-kw-grid" id="cm-intl-auto-grid"></div>`;
    }
    html += `</div>`;

    // ── Manual pinned list ───────────────────────────────────────────────────
    html += `<div class="cm-kw-section" data-brand="${brand}">
      <div class="cm-kw-section-title">
        <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block"></span>
        Pinned Competitors <span class="cm-kw-count" id="cm-intl-count">${manual.length}</span>
      </div>
      <div class="cm-comp-grid" id="cm-intl-manual-grid"></div>
      <div class="cm-kw-add-row" style="flex-wrap:wrap">
        <input class="cm-kw-add-input" id="cm-intl-name" type="text" placeholder="Name e.g. Burger Boutique" style="flex:1;min-width:130px"/>
        <input class="cm-kw-add-input" id="cm-intl-domain" type="text" placeholder="Domain e.g. burgerboutique.com" style="flex:1;min-width:170px"/>
        <button class="cm-kw-add-btn" id="cm-intl-add">Add</button>
      </div>
      <div id="cm-intl-savebar" style="display:none" class="cm-kw-save-bar">
        <span>⚠ Unsaved changes — click Save to update</span>
        <button class="cm-kw-save-btn" id="cm-intl-save">Save Changes</button>
      </div>
    </div></div>`;

    container.innerHTML = html;
    bindCompetitorEventsIntl(container, brand, marketKey, autoNotManual);
  }

  function bindCompetitorEventsIntl(container, brand, marketKey, autoDomains) {
    bindViewToggle(container);
    container.querySelectorAll(".cm-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => { currentBrandFilter = btn.dataset.filter; renderCompetitorsIntl(container); });
    });

    const localComps = [...(marketCompetitorData?.[brand]?.competitors || [])];
    let availableAuto = [...autoDomains];

    const savebar = container.querySelector("#cm-intl-savebar");
    function markUnsaved() { if (savebar) savebar.style.display = "flex"; }

    function pinnedDomains() { return new Set(localComps.map(c => c.domain.replace(/^www\./, ""))); }

    function renderManualGrid() {
      const grid  = container.querySelector("#cm-intl-manual-grid");
      const count = container.querySelector("#cm-intl-count");
      if (!grid) return;
      grid.innerHTML = localComps.length
        ? localComps.map(c => `<span class="cm-kw-tag">
            <span>${esc(c.name)}</span><span style="font-size:10px;color:#94a3b8">${esc(c.domain)}</span>
            <button class="cm-kw-tag-delete cm-intl-del" data-domain="${esc(c.domain)}">×</button>
          </span>`).join("")
        : `<span style="font-size:12px;color:#94a3b8;font-style:italic">None pinned — the matrix will use auto-detected domains only.</span>`;
      if (count) count.textContent = localComps.length;
      grid.querySelectorAll(".cm-intl-del").forEach(btn => {
        btn.addEventListener("click", () => {
          const c = localComps.find(x => x.domain === btn.dataset.domain);
          showDeleteModal(c ? c.name : btn.dataset.domain, () => {
            const removed = localComps.find(x => x.domain === btn.dataset.domain);
            localComps.splice(localComps.findIndex(x => x.domain === btn.dataset.domain), 1);
            // If it was an auto-detected domain, return it to the promotable list
            if (removed && autoDomains.some(d => d.domain.replace(/^www\./, "") === removed.domain.replace(/^www\./, ""))
                && !availableAuto.some(d => d.domain === removed.domain)) {
              availableAuto.push(autoDomains.find(d => d.domain.replace(/^www\./, "") === removed.domain.replace(/^www\./, "")));
            }
            renderManualGrid(); renderAutoGrid(); markUnsaved();
          });
        });
      });
    }

    function renderAutoGrid() {
      const grid = container.querySelector("#cm-intl-auto-grid");
      if (!grid) return;
      const pinned = pinnedDomains();
      const show = availableAuto.filter(d => !pinned.has(d.domain.replace(/^www\./, "")));
      grid.innerHTML = show.map(d => `<span class="cm-kw-tag" style="background:rgba(99,102,241,0.06);border-color:rgba(99,102,241,0.25)">
          <span>${esc(d.domain)}</span><span style="font-size:10px;color:#94a3b8">${d.appearances || 0}× top-10</span>
          <button class="cm-kw-tag-delete cm-intl-promote" data-domain="${esc(d.domain)}" style="color:#6366f1;font-weight:700" title="Pin as competitor">+</button>
        </span>`).join("");
      grid.querySelectorAll(".cm-intl-promote").forEach(btn => {
        btn.addEventListener("click", () => {
          const domain = btn.dataset.domain;
          if (localComps.some(c => c.domain.replace(/^www\./, "") === domain.replace(/^www\./, ""))) return;
          const name = domain.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
          localComps.push({ name, domain });
          renderManualGrid(); renderAutoGrid(); markUnsaved();
        });
      });
    }

    renderManualGrid();
    renderAutoGrid();

    // Add row
    const nameInput   = container.querySelector("#cm-intl-name");
    const domainInput = container.querySelector("#cm-intl-domain");
    const addBtn      = container.querySelector("#cm-intl-add");
    if (addBtn) {
      const doAdd = () => {
        const name   = (nameInput?.value || "").trim();
        const domain = (domainInput?.value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
        if (!name || !domain) return;
        if (localComps.some(c => c.domain === domain)) { domainInput.style.borderColor = "#ef4444"; setTimeout(() => domainInput.style.borderColor = "", 1500); return; }
        localComps.push({ name, domain });
        if (nameInput)   nameInput.value   = "";
        if (domainInput) domainInput.value = "";
        renderManualGrid(); renderAutoGrid(); markUnsaved();
      };
      addBtn.addEventListener("click", doAdd);
      domainInput?.addEventListener("keydown", e => { if (e.key === "Enter") doAdd(); });
    }

    // Save (per-market)
    const saveBtn = container.querySelector("#cm-intl-save");
    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        saveBtn.disabled = true; saveBtn.textContent = "Saving…";
        try {
          const res = await fetch(COMPETITOR_CONFIG_URL, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brand, market: marketKey, competitors: localComps }),
          });
          if (!res.ok) throw new Error("Save failed");
          if (!marketCompetitorData) marketCompetitorData = {};
          marketCompetitorData[brand] = { competitors: [...localComps] };
          if (savebar) { savebar.style.background = "#f0fdf4"; savebar.style.borderColor = "#86efac"; savebar.querySelector("span").style.color = "#166534"; savebar.querySelector("span").textContent = "✓ Saved! Applies on next Refresh Now."; saveBtn.style.background = "#22c55e"; saveBtn.textContent = "Saved ✓"; }
          setTimeout(() => {
            saveBtn.disabled = false; saveBtn.textContent = "Save Changes"; saveBtn.style.background = "";
            if (savebar) { savebar.style.display = "none"; savebar.style.background = ""; savebar.style.borderColor = ""; }
          }, 3000);
        } catch { saveBtn.disabled = false; saveBtn.textContent = "Save Changes"; alert("Failed to save."); }
      });
    }
  }

  // ── Event binding ──────────────────────────────────────────────────────────
  function bindViewToggle(container) {
    container.querySelectorAll(".cm-view-btn").forEach(btn => {
      btn.addEventListener("click", () => switchView(container, btn.dataset.view));
    });
  }

  function switchView(container, view) {
    currentView = view;
    if      (view === "sov")         renderSoV(container);
    else if (view === "gaps")        renderGaps(container);
    else if (view === "keywords")    renderKeywords(container);
    else if (view === "competitors") renderCompetitors(container);
    else                             render(container);
  }

  function bindMatrixEvents(container) {
    bindViewToggle(container);
    container.querySelectorAll(".cm-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => { currentBrandFilter = btn.dataset.filter; render(container); });
    });
    const refreshBtn = container.querySelector("#cm-refresh-btn");
    if (refreshBtn) refreshBtn.addEventListener("click", () => loadData(container, true));

    const exportBtn = container.querySelector("#cm-export-btn");
    if (exportBtn) exportBtn.addEventListener("click", () => exportCsv());

    // Alert banner domain click → add to competitor
    container.querySelectorAll(".cm-alert-domain").forEach(el => {
      el.addEventListener("click", () => {
        const domain = el.dataset.domain;
        const brand  = el.dataset.brand || currentBrandFilter;
        const name   = domain.split(".")[0].replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase());
        if (confirm(`Add "${domain}" as a competitor for ${BRAND_COLORS[brand]?.label || brand}?\n\nDisplay name will be "${name}". You can edit this in Manage Competitors.`)) {
          addCompetitorFromAlert(brand, name, domain);
        }
      });
    });
  }

  async function addCompetitorFromAlert(brand, name, domain) {
    try {
      const isIntl = currentMarketFilter && currentMarketFilter !== "uae";
      // Write to the selected market's list — NOT silently to UAE.
      const dataset  = isIntl ? marketCompetitorData : competitorData;
      const existing = dataset?.[brand]?.competitors || [];
      if (existing.some(c => c.domain === domain)) return;
      const updated = [...existing, { name, domain }];
      const body = isIntl ? { brand, market: currentMarketFilter, competitors: updated } : { brand, competitors: updated };
      const res = await fetch(COMPETITOR_CONFIG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        if (isIntl) { if (!marketCompetitorData) marketCompetitorData = {}; marketCompetitorData[brand] = { competitors: updated }; }
        else        { if (!competitorData) competitorData = {}; competitorData[brand] = { competitors: updated }; }
        const where = isIntl ? (document.querySelector("#cm-market-filter option:checked")?.textContent || currentMarketFilter).trim() : (BRAND_COLORS[brand]?.label || brand);
        alert(`✓ "${name}" added to ${where} competitors. They'll appear on next Refresh Now.`);
        render(document.getElementById("competitor-matrix-live"));
      }
    } catch (e) { alert("Failed to add: " + e.message); }
  }

  function exportCsv() {
    const rows = getFilteredRows();
    const competitors = getCompetitorNames();
    const headers = ["Keyword","Brand","Our Rank",...competitors,"Movement","Search Volume","CPC (USD)"];
    const csvRows = [headers.join(",")];
    for (const row of rows) {
      csvRows.push([
        `"${row.keyword}"`,
        row.brand,
        row.ourRank ?? "",
        ...competitors.map(c => row.competitorRanks?.[c] ?? ""),
        row.movement || "",
        row.searchVolume ?? "",
        row.cpc_usd ?? "",
      ].join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `competitor-matrix-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  }

  function bindKeywordEvents(container) {
    bindViewToggle(container);
    const localKeywords = {
      pickl:   [...(keywordData?.pickl?.keywords   || [])],
      bonbird: [...(keywordData?.bonbird?.keywords || [])],
    };

    function markUnsaved(brand) { const b = container.querySelector(`#cm-kw-savebar-${brand}`); if (b) b.style.display = "flex"; }

    function updateGrid(brand) {
      const grid  = container.querySelector(`#cm-kw-grid-${brand}`);
      const count = container.querySelector(`#cm-kw-count-${brand}`);
      if (!grid) return;
      grid.innerHTML = localKeywords[brand].map(kw =>
        `<span class="cm-kw-tag">${esc(kw)}<button class="cm-kw-tag-delete" data-kw="${esc(kw)}" data-brand="${brand}">×</button></span>`
      ).join("");
      if (count) count.textContent = localKeywords[brand].length;
      grid.querySelectorAll(".cm-kw-tag-delete").forEach(btn => {
        btn.addEventListener("click", () => showDeleteModal(btn.dataset.kw, () => {
          localKeywords[brand] = localKeywords[brand].filter(k => k !== btn.dataset.kw);
          updateGrid(brand); markUnsaved(brand);
        }));
      });
    }

    container.querySelectorAll(".cm-kw-tag-delete").forEach(btn => {
      btn.addEventListener("click", () => showDeleteModal(btn.dataset.kw, () => {
        localKeywords[btn.dataset.brand] = localKeywords[btn.dataset.brand].filter(k => k !== btn.dataset.kw);
        updateGrid(btn.dataset.brand); markUnsaved(btn.dataset.brand);
      }));
    });

    for (const brand of ["pickl","bonbird"]) {
      const input   = container.querySelector(`#cm-kw-input-${brand}`);
      const addBtn  = container.querySelector(`#cm-kw-add-${brand}`);
      const saveBtn = container.querySelector(`#cm-kw-save-${brand}`);

      if (addBtn && input) {
        const doAdd = () => {
          const val = input.value.trim().toLowerCase();
          if (!val) return;
          if (localKeywords[brand].includes(val)) { input.style.borderColor = "#ef4444"; setTimeout(() => input.style.borderColor = "", 1500); return; }
          localKeywords[brand].push(val); input.value = ""; updateGrid(brand); markUnsaved(brand);
        };
        addBtn.addEventListener("click", doAdd);
        input.addEventListener("keydown", e => { if (e.key === "Enter") doAdd(); });
      }

      if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
          saveBtn.disabled = true; saveBtn.textContent = "Saving…";
          try {
            const res = await fetch(KEYWORD_CONFIG_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ brand, keywords: localKeywords[brand] }) });
            if (!res.ok) throw new Error("Save failed");
            if (!keywordData) keywordData = {};
            keywordData[brand] = { keywords: localKeywords[brand] };
            const bar = container.querySelector(`#cm-kw-savebar-${brand}`);
            if (bar) { bar.style.background="#f0fdf4"; bar.style.borderColor="#86efac"; bar.querySelector("span").style.color="#166534"; bar.querySelector("span").textContent="✓ Saved! Refresh rankings to apply."; saveBtn.style.background="#22c55e"; saveBtn.textContent="Saved ✓"; }
            // Reset after 3s so user can keep adding keywords
            setTimeout(() => {
              saveBtn.disabled = false; saveBtn.textContent = "Save Changes"; saveBtn.style.background = "";
              if (bar) { bar.style.display = "none"; bar.style.background = ""; bar.style.borderColor = ""; }
            }, 3000);
          } catch { saveBtn.disabled = false; saveBtn.textContent = "Save Changes"; alert("Failed to save."); }
        });
      }
    }
  }

  function bindCompetitorEvents(container) {
    bindViewToggle(container);
    const localComps = {
      pickl:   [...(competitorData?.pickl?.competitors   || [])],
      bonbird: [...(competitorData?.bonbird?.competitors || [])],
    };

    function markUnsaved(brand) { const b = container.querySelector(`#cm-comp-savebar-${brand}`); if (b) b.style.display = "flex"; }

    function updateGrid(brand) {
      const grid  = container.querySelector(`#cm-comp-grid-${brand}`);
      const count = container.querySelector(`#cm-comp-count-${brand}`);
      if (!grid) return;
      grid.innerHTML = localComps[brand].map(c => `<span class="cm-kw-tag">
        <span>${esc(c.name)}</span><span style="font-size:10px;color:#94a3b8">${esc(c.domain)}</span>
        <button class="cm-kw-tag-delete cm-comp-delete" data-comp="${esc(c.name)}" data-brand="${brand}">×</button>
      </span>`).join("");
      if (count) count.textContent = localComps[brand].length;
      grid.querySelectorAll(".cm-comp-delete").forEach(btn => {
        btn.addEventListener("click", () => showDeleteModal(btn.dataset.comp, () => {
          localComps[brand] = localComps[brand].filter(c => c.name !== btn.dataset.comp);
          updateGrid(brand); markUnsaved(brand);
        }));
      });
    }

    container.querySelectorAll(".cm-comp-delete").forEach(btn => {
      btn.addEventListener("click", () => showDeleteModal(btn.dataset.comp, () => {
        localComps[btn.dataset.brand] = localComps[btn.dataset.brand].filter(c => c.name !== btn.dataset.comp);
        updateGrid(btn.dataset.brand); markUnsaved(btn.dataset.brand);
      }));
    });

    for (const brand of ["pickl","bonbird"]) {
      const nameInput   = container.querySelector(`#cm-comp-name-${brand}`);
      const domainInput = container.querySelector(`#cm-comp-domain-${brand}`);
      const addBtn      = container.querySelector(`#cm-comp-add-${brand}`);
      const saveBtn     = container.querySelector(`#cm-comp-save-${brand}`);

      if (addBtn) {
        const doAdd = () => {
          const name   = (nameInput?.value || "").trim();
          const domain = (domainInput?.value || "").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/\/$/,"");
          if (!name || !domain) return;
          if (localComps[brand].some(c => c.domain === domain)) { domainInput.style.borderColor="#ef4444"; setTimeout(()=>domainInput.style.borderColor="",1500); return; }
          localComps[brand].push({ name, domain });
          if (nameInput)   nameInput.value   = "";
          if (domainInput) domainInput.value = "";
          updateGrid(brand); markUnsaved(brand);
        };
        addBtn.addEventListener("click", doAdd);
        domainInput?.addEventListener("keydown", e => { if (e.key === "Enter") doAdd(); });
      }

      if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
          saveBtn.disabled = true; saveBtn.textContent = "Saving…";
          try {
            const res = await fetch(COMPETITOR_CONFIG_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ brand, competitors: localComps[brand] }) });
            if (!res.ok) throw new Error("Save failed");
            if (!competitorData) competitorData = {};
            competitorData[brand] = { competitors: localComps[brand] };
            const bar = container.querySelector(`#cm-comp-savebar-${brand}`);
            if (bar) { bar.style.background="#f0fdf4"; bar.style.borderColor="#86efac"; bar.querySelector("span").style.color="#166534"; bar.querySelector("span").textContent="✓ Saved! Changes apply on next Refresh Now."; saveBtn.style.background="#22c55e"; saveBtn.textContent="Saved ✓"; }
            // Reset after 3s so user can keep adding competitors
            setTimeout(() => {
              saveBtn.disabled = false; saveBtn.textContent = "Save Changes"; saveBtn.style.background = "";
              if (bar) { bar.style.display = "none"; bar.style.background = ""; bar.style.borderColor = ""; }
            }, 3000);
          } catch { saveBtn.disabled = false; saveBtn.textContent = "Save Changes"; alert("Failed to save."); }
        });
      }
    }
  }

  function showDeleteModal(keyword, onConfirm) {
    const overlay = document.createElement("div");
    overlay.className = "cm-modal-overlay";
    overlay.innerHTML = `<div class="cm-modal">
      <div class="cm-modal-title">Remove?</div>
      <div class="cm-modal-body">You're about to stop tracking <span class="cm-modal-keyword">${esc(keyword)}</span>. Historical data already fetched won't be affected.</div>
      <div class="cm-modal-actions">
        <button class="cm-modal-cancel">Cancel</button>
        <button class="cm-modal-confirm">Yes, remove it</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".cm-modal-cancel").addEventListener("click", () => overlay.remove());
    overlay.querySelector(".cm-modal-confirm").addEventListener("click", () => { overlay.remove(); onConfirm(); });
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  }

  // ── Data loading ───────────────────────────────────────────────────────────
  async function loadKeywordConfig() {
    try { const r = await fetch(`${KEYWORD_CONFIG_URL}?brand=all`); if (r.ok) keywordData = await r.json(); } catch {}
  }
  async function loadCompetitorConfig() {
    try {
      if (currentMarketFilter && currentMarketFilter !== "uae") {
        // Per-market manual overrides for the market's owning brand
        const brand = currentMarketFilter.split("_")[0];
        const r = await fetch(`${COMPETITOR_CONFIG_URL}?brand=${brand}&market=${currentMarketFilter}`);
        if (r.ok) marketCompetitorData = await r.json();
      } else {
        const r = await fetch(`${COMPETITOR_CONFIG_URL}?brand=all`);
        if (r.ok) competitorData = await r.json();
      }
    } catch {}
  }

  async function loadData(container, forceRefresh = false) {
    // Always clear any existing poll first — prevents orphaned polls on tab switch
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (isLoading && !forceRefresh) return;
    isLoading    = true;
    pollAttempts = 0;

    if (forceRefresh) {
      container.innerHTML = `<div class="cm-loading"><div class="cm-loading-spinner"></div><div>Refresh triggered — fetching live rankings…</div><div class="cm-poll-status" id="cm-poll-status">Starting background job…</div></div>`;
      try {
        const mq = currentMarketFilter && currentMarketFilter !== 'uae' ? `?market=${currentMarketFilter}` : '';
        await fetch(`${BACKGROUND_URL}${mq}`, { method: "GET" });
      } catch { /* 202 is fine */ }

      const triggerTime = Date.now();
      pollTimer = setInterval(async () => {
        pollAttempts++;
        const statusEl = document.getElementById("cm-poll-status");
        if (statusEl) statusEl.textContent = `Checking for results… (${pollAttempts * 30}s)`;

        try {
          const mq2  = currentMarketFilter && currentMarketFilter !== 'uae' ? `&market=${currentMarketFilter}` : '';
          const res  = await fetch(`${FUNCTION_URL}?brand=all${mq2}`);
          if (!res.ok) return;
          const data = await res.json();
          const picklFresh   = data?.pickl?.rows?.length   && new Date(data.pickl.fetchedAt).getTime()   > triggerTime;
          const bonbirdFresh = data?.bonbird?.rows?.length && new Date(data.bonbird.fetchedAt).getTime() > triggerTime;

          if ((picklFresh || !data?.pickl) && (bonbirdFresh || !data?.bonbird)) {
            clearInterval(pollTimer); pollTimer = null;
            matrixData = data; isLoading = false;
            switchView(container, "matrix");
          } else if (pollAttempts >= POLL_MAX_ATTEMPTS) {
            clearInterval(pollTimer); pollTimer = null;
            if (data?.pickl?.rows || data?.bonbird?.rows) matrixData = data;
            isLoading = false; switchView(container, "matrix");
          }
        } catch { /* keep polling */ }
      }, POLL_INTERVAL_MS);

    } else {
      container.innerHTML = `<div class="cm-loading"><div class="cm-loading-spinner"></div><div>Loading competitor matrix…</div></div>`;
      try {
        const marketQ = currentMarketFilter && currentMarketFilter !== 'uae' ? `&market=${currentMarketFilter}` : '';
        const [matrixRes] = await Promise.all([fetch(`${FUNCTION_URL}?brand=all${marketQ}`), loadKeywordConfig(), loadCompetitorConfig()]);
        if (!matrixRes.ok) throw new Error(`HTTP ${matrixRes.status}`);
        matrixData = await matrixRes.json();
      } catch (err) {
        container.innerHTML = `<div class="cm-error"><strong>Failed to load:</strong> ${esc(err.message)}</div>`;
        isLoading = false; return;
      }
      isLoading = false;
      switchView(container, currentView);
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    let container = document.getElementById("competitor-matrix-live");
    if (!container) {
      const analyticsTab = document.getElementById("analytics") || document.querySelector('[data-tab="analytics"]');
      if (analyticsTab) { const d = document.createElement("div"); d.id = "competitor-matrix-live"; analyticsTab.appendChild(d); container = d; }
    }
    if (!container) { console.warn("[competitor-matrix-ui] Container not found"); return; }
    loadData(container, false);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.competitorMatrix = {
    init:      () => { const c = document.getElementById("competitor-matrix-live"); if (c && !matrixData) loadData(c, false); },
    reload:    () => { const c = document.getElementById("competitor-matrix-live"); if (c) loadData(c, true); },
    setMarket: (mk) => {
      currentMarketFilter = mk || 'uae';
      matrixData = null; // clear cached data so new market loads fresh
      const c = document.getElementById("competitor-matrix-live");
      if (c) loadData(c, false);
    },
  };
})();

// ── Market filter change handler (called from select onchange) ────────────────
function cmMarketChanged(marketKey) {
  if (window.competitorMatrix?.setMarket) {
    window.competitorMatrix.setMarket(marketKey);
  }
}

// ── Competitor auto-discovery (called from Manage Competitors UI) ─────────────
async function cmDiscoverCompetitors(brand, btn) {
  const resultsEl = document.getElementById("cm-discover-results");
  if (!resultsEl) return;
  const origText = btn.textContent;
  btn.disabled = true; btn.textContent = "Discovering…";
  resultsEl.innerHTML = `<div style="font-size:12px;color:#64748b;padding:8px 0">Asking DataForSEO who's competing for ${brand === 'pickl' ? 'eatpickl.com' : 'bonbirdchicken.com'} keywords…</div>`;

  try {
    const res  = await fetch(`/.netlify/functions/competitor-matrix?discover=1&brand=${brand}`, { credentials: "include" });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const competitors = data.competitors || [];
    if (!competitors.length) {
      resultsEl.innerHTML = `<div style="font-size:12px;color:#64748b;padding:8px 0">No new competitors found — DataForSEO may need more keyword data first. Try after a Refresh Now.</div>`;
      return;
    }

    const existingDomains = new Set(
      (window.competitorMatrix && document.querySelectorAll(`#cm-comp-grid-${brand} .cm-kw-tag`).length
        ? [...document.querySelectorAll(`#cm-comp-grid-${brand} .cm-kw-tag span:nth-child(2)`)].map(s => s.textContent.trim())
        : [])
    );

    resultsEl.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">${competitors.length} competitors found for ${brand} — ranked by keyword overlap</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${competitors.map(c => {
          const alreadyTracked = existingDomains.has(c.domain);
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px">${esc(c.domain)}</div>
              <div style="font-size:11px;color:#64748b">${c.intersections} shared keywords · they rank for ${c.compCount} total</div>
            </div>
            ${alreadyTracked
              ? `<span style="font-size:11px;color:#059669;font-weight:600">✓ Already tracked</span>`
              : `<button onclick="cmAddDiscoveredCompetitor('${brand}','${esc(c.domain)}',this)" style="padding:4px 12px;background:#6366f1;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">+ Add</button>`
            }
          </div>`;
        }).join("")}
      </div>`;
  } catch (e) {
    resultsEl.innerHTML = `<div style="font-size:12px;color:#ef4444;padding:8px 0">Discovery failed: ${e.message}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = origText;
  }
}

function cmShowAllGaps(compKey, btn) {
  document.querySelectorAll(`.cm-gap-row-${compKey}`).forEach(row => row.style.display = '');
  const wrap = document.getElementById(`cm-show-more-${compKey}`);
  if (wrap) wrap.style.display = 'none';
}

async function cmAddDiscoveredCompetitor(brand, domain, btn) {
  // Derive a display name from the domain
  const name = domain.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  // Respect the selected market — don't silently write to UAE.
  const market = document.getElementById("cm-market-filter")?.value || "uae";
  const isIntl = market && market !== "uae";
  btn.disabled = true; btn.textContent = "Adding…";

  try {
    const cRes = await fetch(`/.netlify/functions/competitor-config?brand=${isIntl ? brand : "all"}${isIntl ? "&market=" + market : ""}`, { credentials: "include" });
    const cData = await cRes.json();
    const existing = cData?.[brand]?.competitors || [];
    if (existing.some(c => c.domain === domain)) { btn.textContent = "✓ Added"; return; }
    const updated = [...existing, { name, domain }];
    await fetch("/.netlify/functions/competitor-config", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isIntl ? { brand, market, competitors: updated } : { brand, competitors: updated }),
    });
    btn.textContent = "✓ Added";
    btn.style.background = "#059669";
  } catch (e) {
    btn.disabled = false; btn.textContent = "+ Add";
    alert("Failed to add: " + e.message);
  }
}
