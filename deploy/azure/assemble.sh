#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${ROOT}/azure-site"

rm -rf "${OUT}"
mkdir -p "${OUT}/api" "${OUT}/web"

cp "${ROOT}/deploy/azure/host.js" "${OUT}/host.js"
cp "${ROOT}/deploy/azure/package.json" "${OUT}/package.json"

if [[ ! -d "${ROOT}/azure-api" ]]; then
  echo "missing azure-api (run pnpm --filter @cmp/api deploy --prod ./azure-api first)" >&2
  exit 1
fi
cp -a "${ROOT}/azure-api/." "${OUT}/api/"

STANDALONE="${ROOT}/apps/web/.next/standalone"
if [[ ! -d "${STANDALONE}" ]]; then
  echo "missing ${STANDALONE} (run pnpm --filter @cmp/web build first)" >&2
  exit 1
fi
cp -a "${STANDALONE}/." "${OUT}/web/"

SERVER_JS="$(find "${OUT}/web" -name server.js -not -path '*/node_modules/*' | head -1)"
if [[ -z "${SERVER_JS}" ]]; then
  echo "could not find Next standalone server.js" >&2
  exit 1
fi

WEB_APP_DIR="$(dirname "${SERVER_JS}")"
mkdir -p "${WEB_APP_DIR}/.next/static"
cp -a "${ROOT}/apps/web/.next/static/." "${WEB_APP_DIR}/.next/static/"
if [[ -d "${ROOT}/apps/web/public" ]]; then
  mkdir -p "${WEB_APP_DIR}/public"
  cp -a "${ROOT}/apps/web/public/." "${WEB_APP_DIR}/public/"
fi

mkdir -p "${OUT}/dist"
printf '%s\n' "require('../host.js');" > "${OUT}/dist/main.js"
cat > "${OUT}/.deployment" <<'EOF'
[config]
SCM_DO_BUILD_DURING_DEPLOYMENT=false
EOF
rm -f "${OUT}/oryx-manifest.toml" "${OUT}/node_modules.tar.gz" "${OUT}/api/oryx-manifest.toml"

python3 - <<PY
from pathlib import Path
out = Path("${OUT}")
server = Path("${SERVER_JS}")
(out / "web-server-rel.txt").write_text(str(server.relative_to(out)))
print("web server:", server.relative_to(out))
PY
