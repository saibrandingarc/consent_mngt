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
mkdir -p "${WEB_APP_DIR}/.next/static" "${WEB_APP_DIR}/node_modules" "${OUT}/api/node_modules"
cp -a "${ROOT}/apps/web/.next/static/." "${WEB_APP_DIR}/.next/static/"
if [[ -d "${ROOT}/apps/web/public" ]]; then
  mkdir -p "${WEB_APP_DIR}/public"
  cp -a "${ROOT}/apps/web/public/." "${WEB_APP_DIR}/public/"
fi

# pnpm nests next/styled-jsx (and nest/tslib) as siblings under .pnpm/*/node_modules.
copy_pnpm_siblings() {
  local pkg_json_glob="$1"
  local dest="$2"
  local pkg
  pkg="$(find "${ROOT}/node_modules/.pnpm" -path "${pkg_json_glob}" | head -1 || true)"
  if [[ -z "${pkg}" ]]; then
    echo "missing pnpm package ${pkg_json_glob}" >&2
    exit 1
  fi
  local siblings
  siblings="$(dirname "$(dirname "${pkg}")")"
  mkdir -p "${dest}"
  cp -a "${siblings}/." "${dest}/"
  echo "copied siblings of ${pkg} -> ${dest}"
}

copy_pnpm_siblings '*/node_modules/next/package.json' "${WEB_APP_DIR}/node_modules"
copy_pnpm_siblings '*/node_modules/@nestjs/core/package.json' "${OUT}/api/node_modules"

test -f "${WEB_APP_DIR}/node_modules/styled-jsx/package.json"
test -f "${WEB_APP_DIR}/node_modules/next/package.json"
test -f "${OUT}/api/node_modules/tslib/package.json"

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
