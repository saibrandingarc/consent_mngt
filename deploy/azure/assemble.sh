#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

write_deploy_meta() {
  local dir="$1"
  cat > "${dir}/.deployment" <<'EOF'
[config]
SCM_DO_BUILD_DURING_DEPLOYMENT=false
EOF
  rm -f "${dir}/oryx-manifest.toml" "${dir}/node_modules.tar.gz"
}

copy_real_pkg() {
  local name="$1"
  local dest_parent="$2"
  local optional="${3:-}"
  local pkg_json
  pkg_json="$(find "${ROOT}/node_modules/.pnpm" -path "*/node_modules/${name}/package.json" | head -1 || true)"
  if [[ -z "${pkg_json}" ]]; then
    if [[ -n "${optional}" ]]; then
      echo "skip missing optional ${name}"
      return 0
    fi
    echo "missing ${name} in pnpm store" >&2
    exit 1
  fi
  mkdir -p "${dest_parent}"
  rm -rf "${dest_parent}/${name}"
  mkdir -p "$(dirname "${dest_parent}/${name}")"
  cp -aL "$(dirname "${pkg_json}")" "${dest_parent}/${name}"
  echo "real copy ${name} -> ${dest_parent}/${name}"
}

copy_next_runtime() {
  local dest="$1"
  copy_real_pkg next "${dest}"
  copy_real_pkg react "${dest}"
  copy_real_pkg react-dom "${dest}"
  local next_pkg="${dest}/next/package.json"
  local dep
  while IFS= read -r dep; do
    [[ -z "${dep}" ]] && continue
    copy_real_pkg "${dep}" "${dest}"
  done < <(node -e 'const p=require(process.argv[1]); Object.keys(p.dependencies||{}).forEach((k)=>console.log(k));' "${next_pkg}")
  copy_real_pkg @next/swc-linux-x64-gnu "${dest}" optional
}

deref_node_modules() {
  local dir="$1"
  if [[ ! -d "${dir}/node_modules" ]]; then
    return 0
  fi
  find "${dir}/node_modules" -xtype l -print -delete || true
  local tmp
  tmp="$(mktemp -d)"
  set +e
  rsync -a --copy-links --exclude '.bin/' "${dir}/node_modules/" "${tmp}/"
  local rc=$?
  set -e
  if [[ "${rc}" -ne 0 && "${rc}" -ne 23 && "${rc}" -ne 24 ]]; then
    echo "rsync failed in ${dir} with ${rc}" >&2
    exit "${rc}"
  fi
  rm -rf "${dir}/node_modules"
  mv "${tmp}" "${dir}/node_modules"
  echo "dereferenced node_modules in ${dir}"
}

assemble_api() {
  local out="${ROOT}/azure-site-api"
  rm -rf "${out}"
  mkdir -p "${out}"
  if [[ ! -d "${ROOT}/azure-api" ]]; then
    echo "missing azure-api" >&2
    exit 1
  fi
  cp -a "${ROOT}/azure-api/." "${out}/"
  copy_real_pkg tslib "${out}/node_modules"
  cat > "${out}/package.json" <<'EOF'
{
  "name": "cmp-api",
  "private": true,
  "author": "saibrandingarc",
  "scripts": { "start": "node dist/main.js" },
  "engines": { "node": "22.x" }
}
EOF
  write_deploy_meta "${out}"
  test -f "${out}/dist/main.js"
  test -f "${out}/node_modules/tslib/package.json"
}

assemble_next_app() {
  local name="$1"
  local src_deploy="$2"
  local src_app="$3"
  local out="${ROOT}/azure-site-${name}"
  rm -rf "${out}"
  mkdir -p "${out}"
  if [[ ! -d "${src_deploy}" ]]; then
    echo "missing ${src_deploy}" >&2
    exit 1
  fi
  cp -a "${src_deploy}/." "${out}/"
  rm -rf "${out}/.next"
  cp -a "${src_app}/.next" "${out}/.next"
  if [[ -d "${src_app}/public" ]]; then
    mkdir -p "${out}/public"
    cp -a "${src_app}/public/." "${out}/public/"
  fi
  deref_node_modules "${out}"
  copy_next_runtime "${out}/node_modules"
  cp "${ROOT}/deploy/azure/start-next.js" "${out}/start-next.js"
  cat > "${out}/package.json" <<EOF
{
  "name": "cmp-${name}",
  "private": true,
  "author": "saibrandingarc",
  "scripts": { "start": "node start-next.js" },
  "engines": { "node": "22.x" }
}
EOF
  write_deploy_meta "${out}"
  test -f "${out}/node_modules/next/dist/bin/next"
  test -f "${out}/node_modules/@next/env/package.json"
  test -f "${out}/node_modules/@swc/helpers/package.json"
}

assemble_api
assemble_next_app web "${ROOT}/azure-web" "${ROOT}/apps/web"
assemble_next_app admin "${ROOT}/azure-admin" "${ROOT}/apps/admin"
echo "assembled azure-site-api azure-site-web azure-site-admin"
