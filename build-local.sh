#!/usr/bin/env bash
# Compila el sitio como lo haría GitHub Pages, pero en /var/www/html/rp_lock-in_pid
# Uso:  ./build-local.sh          -> compila una vez
#       ./build-local.sh --watch  -> recompila al guardar cambios
set -e
cd "$(dirname "$0")"
DEST=/var/www/html/rp_lock-in_pid
JEKYLL_ENV=production PAGES_REPO_NWO=marceluda/rp_lock-in_pid \
  bundle exec jekyll build --config _config.yml,_config_local.yml -d "$DEST" "$@"
echo "Listo: http://localhost/rp_lock-in_pid/"
