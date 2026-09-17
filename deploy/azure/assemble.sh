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

# pnpm deploy uses symlinks; Azure zip drops them. Copy real package trees.
copy_real_pkg() {
  local name="$1"
  local dest_parent="$2"
  local pkg_json
  pkg_json="$(find "${ROOT}/node_modules/.pnpm" -path "*/node_modules/${name}/package.json" | head -1 || true)"
  if [[ -z "${pkg_json}" ]]; then
    echo "missing ${name} in pnpm store" >&2
    exit 1
  fi
  mkdir -p "${dest_parent}"
  rm -rf "${dest_parent}/${name}"
  cp -aL "$(dirname "${pkg_json}")" "${dest_parent}/${name}"
  echo "real copy ${name} -> ${dest_parent}/${name}"
}

copy_real_pkg tslib "${OUT}/api/node_modules"
copy_real_pkg next "${OUT}/web/node_modules"
copy_real_pkg react "${OUT}/web/node_modules"
copy_real_pkg react-dom "${OUT}/web/node_modules"
copy_real_pkg styled-jsx "${OUT}/web/node_modules"

test -f "${OUT}/web/node_modules/next/dist/bin/next"
test -f "${OUT}/api/node_modules/tslib/package.json"
printf '%s\n' 'web/node_modules/next/dist/bin/next' > "${OUT}/next-bin-rel.txt"
echo "next bin: web/node_modules/next/dist/bin/next"

mkdir -p "${OUT}/dist"
printf '%s\n' "require('../host.js');" > "${OUT}/dist/main.js"
cat > "${OUT}/.deployment" <<'EOF'
[config]
SCM_DO_BUILD_DURING_DEPLOYMENT=false
EOF
rm -f "${OUT}/oryx-manifest.toml" "${OUT}/node_modules.tar.gz" "${OUT}/api/oryx-manifest.toml"
