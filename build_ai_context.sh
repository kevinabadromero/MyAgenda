#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="ai-context"
mkdir -p "$OUT_DIR"

# ------ 0) Metadata -------
COMMIT_SHA=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --pretty=%s)
STAMP=$(date -Is)

# ------ 1) Árbol (3 niveles) ------
{
  echo "# MyAgenda – AI Context"
  echo
  echo "- Fecha: ${STAMP}"
  echo "- Commit: ${COMMIT_SHA} — ${COMMIT_MSG}"
  echo
  echo "## Árbol (nivel 3)"
  echo '```txt'
  if command -v tree >/dev/null 2>&1; then
    tree -L 3 -I 'node_modules|dist|build|coverage|.git|.next|out|.cache|.astro|.venv|venv|.DS_Store'
  else
    find . -maxdepth 3 \( \
      -path "./.git" -o -path "./node_modules" -o -path "./dist" -o -path "./build" -o \
      -path "./coverage" -o -path "./.next" -o -path "./out" -o -path "./.cache" -o -path "./.astro" \
    \) -prune -o -print
  fi
  echo '```'
  echo
} > "$OUT_DIR/index.md"

# ------ 2) Últimos commits ------
{
  echo "## Últimos 15 commits"
  echo '```txt'
  git log -n 15 --pretty='%h %ad %an %s' --date=iso
  echo '```'
  echo
} >> "$OUT_DIR/index.md"

# ------ 3) Diff resumido vs remoto ------
BRANCH=$(git rev-parse --abbrev-ref HEAD)
UPSTREAM="origin/$BRANCH"
if git rev-parse --verify "$UPSTREAM" >/dev/null 2>&1; then
  {
    echo "## Diff breve vs $UPSTREAM"
    echo '```diff'
    git diff --stat "$UPSTREAM"...HEAD || true
    echo '```'
    echo
  } >> "$OUT_DIR/index.md"
fi

# ------ 4) Archivos clave + recién modificados ------
KEY_FILES=(
  "routes/admin.js"
  "auth.js"
  "Frontend/src/lib/apiAdmin.ts"
  "Frontend/src/pages/AdminLogin.tsx"
  "Frontend/src/layouts/AdminLayout.tsx"
  "Frontend/src/main.tsx"
)

# archivos tocados en los últimos 2 commits
CHANGED=($(git diff --name-only HEAD~2..HEAD || true))

# Unir y deduplicar
FILES_TO_DUMP=($(printf "%s\n" "${KEY_FILES[@]}" "${CHANGED[@]}" | awk 'NF && !seen[$0]++'))

{
  echo "## Archivos clave y recientes"
  for f in "${FILES_TO_DUMP[@]}"; do
    # excluir secretos/binarios/grandes
    if [[ "$f" =~ (^|/)\.env($|\.|/) ]]; then continue; fi
    if [[ "$f" =~ (^|/)\.gitignore$ ]]; then :; fi
    if [[ ! -f "$f" ]]; then continue; fi
    SIZE=$(wc -c < "$f" || echo 0)
    if (( SIZE > 350000 )); then
      echo -e "\n### \`$f\`\n*(omitido por tamaño)*"
      continue
    fi

    echo
    echo "### \`$f\`"
    echo '```'
    sed -n '1,500p' "$f"
    [[ $(wc -l < "$f") -gt 500 ]] && echo -e "\n[...truncado...]"
    echo '```'
  done
} >> "$OUT_DIR/index.md"

# ------ 5) HTML plano a partir de MD ------
cat > "$OUT_DIR/index.html" <<EOF
<!doctype html>
<meta charset="utf-8">
<title>MyAgenda – AI Context</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:1000px;margin:40px auto;padding:0 16px;line-height:1.5}
  pre{background:#f6f8fa;padding:12px;border-radius:8px;overflow:auto}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  h1,h2,h3{scroll-margin-top:80px}
</style>
<article>
<pre>
$(sed 's/&/\&amp;/g; s/</\&lt;/g' "$OUT_DIR/index.md")
</pre>
</article>
EOF

echo "OK → $OUT_DIR/index.html"
