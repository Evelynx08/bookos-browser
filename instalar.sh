#!/usr/bin/bash
# Instala Aether Browser.
#   sudo ./instalar.sh        para todo el sistema (/usr/local)
#   ./instalar.sh --usuario   solo para ti, sin sudo (~/.local)
#
# Hay que repetirlo después de cada actualización de Firefox (dnf): el
# montaje lleva una copia del ejecutable que tiene que casar con libxul.so.
set -euo pipefail

aqui=$(dirname "$(realpath "$0")")
if [ "${1:-}" = --usuario ]; then
  # En ~/.local/opt y no en ~/.local/lib/bookos-browser, que es el montaje de
  # desarrollo que rehace dev.sh.
  raiz=$HOME/.local/opt/bookos-browser
  bin=$HOME/.local/bin
  share=$HOME/.local/share
else
  raiz=/usr/local/lib/bookos-browser
  bin=/usr/local/bin
  share=/usr/local/share
fi

"$aqui/construir.sh" "$raiz"
install -Dm755 "$aqui/bookos-browser" "$bin/bookos-browser"
install -Dm644 "$aqui/data/bookos-browser.svg" "$share/icons/hicolor/scalable/apps/bookos-browser.svg"
install -Dm644 "$aqui/data/aether-browser.png" "$share/icons/hicolor/512x512/apps/bookos-browser.png"
# Ruta absoluta en Exec: el compositor no tiene por qué llevar ~/.local/bin en
# su PATH.
sed "s|^Exec=bookos-browser|Exec=$bin/bookos-browser|; s|^TryExec=bookos-browser|TryExec=$bin/bookos-browser|" \
  "$aqui/data/bookos-browser.desktop" > "$aqui/.desktop.tmp"
install -Dm644 "$aqui/.desktop.tmp" "$share/applications/bookos-browser.desktop"
rm "$aqui/.desktop.tmp"
update-desktop-database -q "$share/applications" 2>/dev/null || true
echo "Aether Browser instalado: $share/applications/bookos-browser.desktop"
