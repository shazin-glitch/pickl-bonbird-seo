# SEO Command Center — Pickl & Bonbird

## Deploy to Netlify (free plan)

### Option A: Drag & Drop (fastest, 2 minutes)

1. Go to [netlify.com](https://netlify.com) and sign up / log in
2. From the dashboard, drag the entire `netlify-deploy` folder onto the page
3. Netlify auto-detects `netlify.toml` and deploys everything including the function
4. Go to **Site settings → Environment variables** and add:
   - Key: `ANTHROPIC_API_KEY`
   - Value: your Anthropic API key (get one at console.anthropic.com)
5. Trigger a redeploy (Deploys → Trigger deploy) — the key is now live
6. Done. Your tool is at `https://your-site-name.netlify.app`

### Option B: GitHub + Netlify CI (recommended for ongoing updates)

1. Push the `netlify-deploy` folder contents to a GitHub repo
2. In Netlify: **Add new site → Import from Git → Select your repo**
3. Build settings: leave blank (no build command, publish dir = `/`)
4. Add `ANTHROPIC_API_KEY` env var in site settings
5. Every push to main auto-deploys

---

## Project structure

```
netlify-deploy/
├── index.html                          ← The full SEO tool (all UI + JS)
├── netlify.toml                        ← Routes /api/claude → serverless function
└── netlify/
    └── functions/
        └── claude.js                   ← Serverless proxy (holds your API key securely)
```

## How the API proxy works

The HTML tool calls `/api/claude` instead of Anthropic's API directly.
`netlify.toml` redirects that to `/.netlify/functions/claude`.
The serverless function reads `ANTHROPIC_API_KEY` from env vars (never exposed to the browser)
and forwards the request to Anthropic, returning the response.

This is the correct and secure pattern — never put API keys in client-side HTML.

## Adding Google Search Console data

The tool currently has manual rank entry. To pull real GSC data:

1. Enable the [Google Search Console API](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials (Web application type)
3. Add a second Netlify function `gsc.js` that handles the OAuth callback and API calls
4. Use the `searchanalytics.query` endpoint to pull clicks, impressions, and avg position per query
5. Feed that data into the keyword tracker's `addKeyword()` function

This is a significant addition (~1 day of work) — worth doing once the tool is live and validated.

---

## Dark mode

The tool auto-detects dark/light mode via `prefers-color-scheme`. No toggle needed.
