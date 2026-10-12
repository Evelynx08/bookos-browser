#!/usr/bin/bash
# Monta Aether Browser en $1 (por defecto ~/.local/lib/bookos-browser, el de
# pruebas: BOOKOS_BROWSER_DIR=~/.local/lib/bookos-browser ./bookos-browser)
# sobre el Firefox del sistema. instalar.sh lo monta en /usr/local/lib.
#
# Es un árbol de enlaces a /usr/lib64/firefox con lo propio: distribution/
# (políticas), defaults/pref/autoconfig.js, bookos.cfg y la marca (ver abajo). Firefox
# busca todo eso junto a su ejecutable, así que el ejecutable se COPIA (pesa
# medio mega): si fuera un enlace, Firefox resolvería la ruta real y leería la
# configuración de /usr/lib64/firefox, la del Firefox normal del usuario.
#
# Hay que volver a ejecutarlo tras actualizar Firefox: el ejecutable copiado
# tiene que ser de la misma versión que libxul.so.
set -euo pipefail

FIREFOX=/usr/lib64/firefox
ORIGEN=$(dirname "$(realpath "$0")")
DESTINO=${1:-$HOME/.local/lib/bookos-browser}

rm -rf "$DESTINO"
mkdir -p "$DESTINO/defaults/pref"
for f in "$FIREFOX"/*; do
  case $(basename "$f") in
    defaults|distribution|firefox|browser) ;;
    *) ln -s "$f" "$DESTINO/" ;;
  esac
done

# browser/ es propio solo por dos cosas: omni.ja con la marca de BookOS y los
# iconos de ventana. Todo lo demás, enlaces.
mkdir -p "$DESTINO/browser/chrome/icons/default"
for f in "$FIREFOX"/browser/*; do
  case $(basename "$f") in
    omni.ja|chrome) ;;
    *) ln -s "$f" "$DESTINO/browser/" ;;
  esac
done
for f in "$FIREFOX"/browser/chrome/*; do
  [ "$(basename "$f")" = icons ] || ln -s "$f" "$DESTINO/browser/chrome/"
done

# La marca va dentro de omni.ja: Firefox lee «Firefox», sus logos y «Mozilla»
# de ahí (brand.ftl, brand.properties, chrome://branding/). Mozilla escribe
# omni.ja con el índice al principio, que zipfile de Python no entiende;
# unzip sí (avisa con código 2 y extrae bien), y se vuelve a comprimir como
# un zip normal, que Firefox también lee.
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
rc=0
unzip -qq "$FIREFOX/browser/omni.ja" -d "$tmp/omni" 2>/dev/null || rc=$?
[ "$rc" -le 2 ] || { echo "unzip falló ($rc) con omni.ja" >&2; exit "$rc"; }
marca="$tmp/omni/chrome/browser/content/branding"
cp "$ORIGEN/marca/brand.ftl" "$tmp/omni/localization/en-US/branding/brand.ftl"
cp "$ORIGEN/marca/brand.properties" "$tmp/omni/chrome/en-US/locale/branding/brand.properties"
# Los logos salen del PNG original (data/aether-browser.png): la textura
# estrellada de la «A» es un bitmap y pasarla por el SVG no gana nada.
icono="$ORIGEN/data/aether-browser.png"
cp "$ORIGEN/data/bookos-browser.svg" "$marca/about-logo.svg"
cp "$ORIGEN/marca/wordmark.svg" "$marca/about-wordmark.svg"
cp "$ORIGEN/marca/wordmark.svg" "$marca/firefox-wordmark.svg"
for t in 16 32 48 64 128; do
  magick "$icono" -resize ${t}x$t "$marca/icon$t.png"
  cp "$marca/icon$t.png" "$DESTINO/browser/chrome/icons/default/default$t.png"
done
for f in about-logo about-logo-private; do
  magick "$icono" -resize 192x192 "$marca/$f.png"
  magick "$icono" -resize 384x384 "$marca/$f@2x.png"
done
magick "$icono" -resize 192x192 "$marca/about.png"
(cd "$tmp/omni" && zip -qr -X -D -0 "$DESTINO/browser/omni.ja" .)
cp "$FIREFOX/firefox" "$DESTINO/aether-browser"
for f in "$FIREFOX"/defaults/pref/*; do ln -s "$f" "$DESTINO/defaults/pref/"; done

cp "$ORIGEN/defaults/pref/autoconfig.js" "$DESTINO/defaults/pref/"
cp "$ORIGEN/bookos.cfg" "$DESTINO/"
cp -r "$ORIGEN/distribution" "$ORIGEN/bookos" "$DESTINO/"
# La marca para los paquetes de idioma (resource://aether/{idioma}/, ver
# bookos.uc.js): los términos son nombres propios, iguales en todos los
# idiomas, así que es el mismo brand.ftl en cada carpeta.
for idioma in en-US $(ls "$FIREFOX/langpacks" 2>/dev/null | sed -n 's/^langpack-\(.*\)@firefox.mozilla.org.xpi$/\1/p'); do
  install -Dm644 "$ORIGEN/marca/brand.ftl" "$DESTINO/marca/$idioma/branding/brand.ftl"
done
# Y la de los textos antiguos (.properties), con un override de chrome que
# registra bookos.cfg: vale para cualquier idioma.
install -Dm644 "$ORIGEN/marca/brand.properties" "$DESTINO/marca/brand.properties"
echo "override chrome://branding/locale/brand.properties resource://aether/brand.properties" > "$DESTINO/marca/chrome.manifest"
# Huella de lo propio: el lanzador la compara con la del perfil para vaciar la
# caché de scripts de Firefox solo cuando Aether Browser ha cambiado.
cat "$ORIGEN/bookos.cfg" $(find "$ORIGEN/bookos" "$ORIGEN/marca" -type f | sort) | sha256sum | cut -d' ' -f1 > "$DESTINO/bookos-version"
# Dónde están las fuentes: el lanzador las necesita para remontar solo tras
# una actualización de Firefox.
echo "$ORIGEN" > "$DESTINO/origen"
echo "Aether Browser montado en $DESTINO"
