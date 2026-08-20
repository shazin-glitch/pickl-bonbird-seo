#!/usr/bin/env bash
# Pre-commit check for The Nest (CLAUDE.md rule 10).
#
# WHY no-undef and not just `node --check`: on 2026-08-19 a real bug shipped where
# technical-seo-background.js referenced `brandCfg` outside its scope. `node --check`
# PASSES that file — it is valid syntax — and the ReferenceError was swallowed by a
# try/catch, so WordPress page discovery was silently dead for every brand. `no-undef`
# flags it in one second. Same class of bug broke the Markets tab ("brand is not
# defined"). Syntax checking alone is not enough.
#
# Uses npx (no repo dependency) so the Netlify build is untouched.
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0

echo "── 1/3  node --check (syntax) ────────────────────────────────"
while IFS= read -r f; do
  node --check "$f" || { echo "   SYNTAX FAIL: $f"; FAIL=1; }
done < <(find netlify/functions -name '*.js' -not -path '*/node_modules/*')
echo "   ok"

echo "── 2/3  no-undef: netlify/functions ──────────────────────────"
npx --yes eslint@9 --config tools/eslint.functions.mjs --no-config-lookup netlify/functions || FAIL=1

echo "── 3/3  no-undef: index.html inline JS ───────────────────────"
TMP=".nest-check"; mkdir -p "$TMP"   # inside the repo: eslint flat config ignores files outside cwd
python3 - "$TMP" <<'PY'
import re, sys, os
src = open('index.html').read()
out = [''] * (src.count('\n') + 1)          # keep original line numbers
for m in re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', src, re.S):
    start = src[:m.start(1)].count('\n')
    for j, l in enumerate(m.group(1).split('\n')):
        out[start + j] = l
open(os.path.join(sys.argv[1], 'index_lines.js'), 'w').write('\n'.join(out))
PY
# line numbers in this output map 1:1 to index.html
npx --yes eslint@9 --config tools/eslint.browser.mjs --no-config-lookup "$TMP/index_lines.js" || FAIL=1
npx --yes eslint@9 --config tools/eslint.browser.mjs --no-config-lookup js/*.js || FAIL=1
rm -rf "$TMP"

[ "$FAIL" = 0 ] && echo "✅ all checks passed" || echo "❌ checks FAILED — do not commit"
exit $FAIL
