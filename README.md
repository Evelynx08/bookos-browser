# Aether Browser

El navegador de BookOS. Los nombres técnicos siguen siendo `bookos-browser`
(ejecutable, app_id de Wayland, `Icon=`, perfil): la guía de diseño pide
`bookos-<app>` para que el pack de iconos no pise a otras apps.

Es el Firefox del sistema con la interfaz, las políticas y
las prefs de privacidad de BookOS encima. No se compila Firefox; se monta un
árbol de enlaces a `/usr/lib64/firefox` con lo propio al lado.

| Qué | Dónde |
|---|---|
| Políticas (DuckDuckGo por defecto, sin Google ni Bing, sin telemetría, ETP estricto, HTTPS-only, uBlock Origin) | `distribution/policies.json` |
| Prefs de privacidad e interfaz, y el montaje de la piel en cada ventana | `bookos.cfg` (cargado por `defaults/pref/autoconfig.js`) |
| La piel | `bookos/bookos.css` |
| La marca (nombre, logos): en inglés dentro de una copia de `browser/omni.ja`; en otros idiomas, una fuente de traducción superpuesta al paquete de idioma | `marca/`, `construir.sh`, `bookos/bookos.uc.js` |
| Lo que no se hace con CSS: disposición, título de la pestaña, recargar dentro de la barra, pestaña nueva centrada, paleta dinámica, modo enfoque | `bookos/bookos.uc.js` |

## Instalar

```sh
sudo ./instalar.sh          # para todo el sistema (/usr/local)
./instalar.sh --usuario     # solo para ti, sin sudo (~/.local)
```

Deja el lanzador `bookos-browser`, el icono y `bookos-browser.desktop`
(«Aether Browser» en el launchpad y el dock).

Hay que repetirlo **después de cada actualización de Firefox**: el montaje
lleva una copia del ejecutable que tiene que ser de la misma versión que
`libxul.so`.

La interfaz sale en el idioma del sistema solo si están los paquetes de
idioma de Fedora (`sudo dnf install firefox-langpacks`); sin ellos, en inglés.
Tras instalarlos hay que repetir `instalar.sh`, que prepara la marca para cada
idioma.

## Probar sin instalar

```sh
./construir.sh                      # monta en ~/.local/lib/bookos-browser
BOOKOS_BROWSER_DIR=~/.local/lib/bookos-browser ./bookos-browser
```

`BOOKOS_CAPTURA=/ruta.png` guarda una captura de la ventana a los 3 s
(`bookos/captura.uc.js`); spectacle no captura bajo el compositor de BookOS.
