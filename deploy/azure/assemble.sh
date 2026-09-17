#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${ROOT}/azure-site"

rm -rf "${OUT}"
mkdir -p "${OUT}/api" "${OUT}/web"

cp "${ROOT}/deploy/azure/host.js" "${OUT}/host.js"
cp "${ROOT}/deploy/azure/package.json" "${OUT}/package.json"

if [[ ! -d "${ROOT}/azure-api" ]]; then
  echo "missing azure-api" >&2
  exit 1
fi
cp -a "${ROOT}/azure-api/." "${OUT}/api/"

if [[ ! -d "${ROOT}/azure-web" ]]; then
  echo "missing azure-web (pnpm --filter @cmp/web deploy --prod ./azure-web)" >&2
  exit 1
fi
cp -a "${ROOT}/azure-web/." "${OUT}/web/"
rm -rf "${OUT}/web/.next"
cp -a "${ROOT}/apps/web/.next" "${OUT}/web/.next"
if [[ -d "${ROOT}/apps/web/public" ]]; then
  mkdir -p "${OUT}/web/public"
  cp -a "${ROOT}/apps/web/public/." "${OUT}/web/public/"
fi

copy_named_pkg() {
  local name="$1"
  local dest="$2"
  mkdir -p "${dest}"
  if [[ -f "${dest}/${name}/package.json" ]]; then
    return 0
  fi
  local src
  src="$(find "${ROOT}/node_modules/.pnpm" -path "*/node_modules/${name}/package.json" | head -1 || true)"
  if [[ -z "${src}" ]]; then
    echo "missing package ${name}" >&2
    exit 1
  fi
  rm -rf "${dest}/${name}"
  cp -a "$(dirname "${src}")" "${dest}/${name}"
}

copy_named_pkg tslib "${OUT}/api/node_modules"

test -f "${OUT}/web/node_modules/next/package.json" || test -f "${OUT}/web/node_modules/next/dist/bin/next"
test -f "${OUT}/api/node_modules/tslib/package.json"

NEXT_BIN="$(find "${OUT}/web" -path '*/next/dist/bin/next' -not -path '*/.pnpm/*' | head -1 || true)"
if [[ -z "${NEXT_BIN}" ]]; then
  NEXT_BIN="$(find "${OUT}/web/node_modules" -path '*/next/dist/bin/next' | head -1)"
fi
test -n "${NEXT_BIN}"
python3 - <<PY
from pathlib import Path
out = Path("${OUT}")
(out / "next-bin-rel.txt").write_text(str(Path("${NEXT_BIN}").relative_to(out)))
print("next bin:", Path("${NEXT_BIN}").relative_to(out))
PY

mkdir -p "${OUT}/dist"
printf '%s\n' "require('../host.js');" > "${OUT}/dist/main.js"
cat > "${OUT}/.deployment" <<'EOF'
[config]
SCM_DO_BUILD_DURING_DEPLOYMENT=false
EOF
rm -f "${OUT}/oryx-manifest.toml" "${OUT}/node_modules.tar.gz" "${OUT}/api/oryx-manifest.toml"
