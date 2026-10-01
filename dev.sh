#!/usr/bin/bash
# El equivalente a «cargo tauri dev»: monta en ~/.local/lib/bookos-browser con
# bookos/ ENLAZADO (no copiado), así que lo que edites en bookos.css o
# bookos.uc.js se ve al abrir una ventana nueva (Ctrl+N), sin reconstruir.
# bookos.cfg y policies.json sí piden volver a lanzar este script.
#
# Usa un perfil aparte (perfil-dev) con la Caja de herramientas del navegador
# activada: Ctrl+Alt+Shift+I abre el inspector sobre la propia interfaz.
set -euo pipefail
aqui=$(dirname "$(realpath "$0")")
dest=$HOME/.local/lib/bookos-browser
"$aqui/construir.sh" "$dest" >/dev/null
rm -rf "$dest/bookos"
ln -s "$aqui/bookos" "$dest/bookos"

perfil=${XDG_DATA_HOME:-$HOME/.local/share}/bookos-browser/perfil-dev
mkdir -p "$perfil"
cat > "$perfil/user.js" <<'PREFS'
user_pref("devtools.chrome.enabled", true);
user_pref("devtools.debugger.remote-enabled", true);
user_pref("devtools.debugger.prompt-connection", false);
user_pref("devtools.console.stdout.chrome", true);
user_pref("browser.dom.window.dump.enabled", true);
// Sin esto, cerrar a lo bruto unas cuantas veces seguidas lo relanza en
// modo seguro.
user_pref("toolkit.startup.max_resumed_crashes", -1);
PREFS

# Con el lanzador de verdad, para que el idioma y la marca se monten igual
# que al instalar. -purgecaches siempre: Firefox guarda en el perfil una caché
# de los scripts (scriptCache*.bin) y no mira si el fichero cambió, así que el
# actor de scroll editado seguía corriendo en su versión vieja.
BOOKOS_BROWSER_DIR=$dest BOOKOS_PERFIL=$perfil MOZ_APP_REMOTINGNAME=bookos-browser-dev \
  exec "$aqui/bookos-browser" -purgecaches "$@"
