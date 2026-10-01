// La parte de la interfaz de BookOS que no se puede hacer solo con CSS. Corre
// una vez por ventana, en el ámbito de browser.xhtml, cuando Firefox avisa de
// browser-delayed-startup-finished (gBrowser y CustomizableUI ya existen).
"use strict";

(() => {
  const raiz = document.documentElement;
  const pestanas = document.getElementById("TabsToolbar");

  // ── Marca en los paquetes de idioma ───────────────────────────────────────
  // La marca en inglés va dentro de omni.ja (construir.sh), pero cada paquete
  // de idioma trae su propio brand.ftl («Acerca de Firefox»). Las
  // traducciones se resuelven por «metafuente» y cada paquete es la suya, así
  // que se registra una fuente sombra con solo nuestro brand.ftl dentro de
  // cada paquete activo, como hace Firefox con las de la pestaña nueva
  // (AboutNewTabResourceMapping.sys.mjs). Modificar el paquete no vale: pierde
  // la firma y Firefox lo borra al arrancar.
  {
    const { Langpack } = ChromeUtils.importESModule("resource://gre/modules/Extension.sys.mjs");
    const registro = L10nRegistry.getInstance();
    const fuentes = [...Langpack.activeLangpackIds]
      .map(id => `aether-marca-${id}`)
      .filter(nombre => !registro.hasSource(nombre))
      .map(
        nombre =>
          new L10nFileSource(
            nombre,
            nombre.slice("aether-marca-".length),
            Services.locale.availableLocales,
            "resource://aether/{locale}/"
          )
      );
    if (fuentes.length) registro.registerSources(fuentes);
  }

  // ── Disposición ────────────────────────────────────────────────────────────
  // Solo la primera vez: CustomizableUI guarda la disposición en el perfil, y
  // si se forzara en cada arranque se perdería lo que el usuario recoloque.
  // Subir DISPOSICION si cambia la disposición de fábrica.
  const DISPOSICION = 4;

  if (CustomizableUI.getWidget("bookos-compartir")?.provider !== CustomizableUI.PROVIDER_API) {
    // Firefox en Linux no tiene botón de compartir (no hay hoja de compartir
    // del sistema a la que llamar): este abre la de BookOS, #bookos-compartir-menu.
    CustomizableUI.createWidget({
      id: "bookos-compartir",
      label: "Compartir",
      tooltiptext: "Compartir esta página",
      defaultArea: CustomizableUI.AREA_NAVBAR,
      onCommand(ev) {
        const win = ev.target.ownerDocument.defaultView;
        if (win.isBlankPageURL(win.gBrowser.currentURI.spec)) return;
        win.document.getElementById("bookos-compartir-menu").openPopup(ev.target, "after_start");
      },
    });
  }
  if (CustomizableUI.getWidget("bookos-pestanas")?.provider !== CustomizableUI.PROVIDER_API) {
    // Vista de todas las pestañas en cuadrícula (como en Safari), en lugar
    // de la lista desplegable de Firefox.
    CustomizableUI.createWidget({
      id: "bookos-pestanas",
      label: "Todas las pestañas",
      tooltiptext: "Ver todas las pestañas",
      defaultArea: CustomizableUI.AREA_TABSTRIP,
      onCommand(ev) {
        ev.target.ownerDocument.defaultView.bookosVistaPestanas();
      },
    });
  }

  const disposicion = Services.prefs.getIntPref("bookos.disposicion", 0);
  if (disposicion < 1) {
    // Se mueve sobre la disposición de fábrica en vez de escribirla entera:
    // así se conservan sus muelles y lo que añadan las extensiones.
    const { AREA_TABSTRIP, AREA_NAVBAR } = CustomizableUI;
    ["sidebar-button", "alltabs-button", "new-tab-button"].forEach((id, i) =>
      CustomizableUI.addWidgetToArea(id, AREA_TABSTRIP, i)
    );
    for (const id of ["home-button", "fxa-toolbar-menu-button"]) {
      CustomizableUI.removeWidgetFromArea(id);
    }
    const posicion = id => CustomizableUI.getPlacementOfWidget(id).position;
    CustomizableUI.addWidgetToArea("bookos-compartir", AREA_NAVBAR, posicion("urlbar-container"));
    CustomizableUI.moveWidgetWithinArea("stop-reload-button", posicion("urlbar-container") + 1);
  }
  if (disposicion < 2) {
    // La versión 1 ponía el modo enfoque en la barra; ahora va arriba.
    CustomizableUI.removeWidgetFromArea("bookos-enfoque");
  }
  if (disposicion < 3) {
    // Su sitio (arriba a la izquierda) es ahora el del menú principal. La
    // barra lateral sigue a mano con Ctrl+B y desde el menú.
    CustomizableUI.removeWidgetFromArea("sidebar-button");
  }
  if (disposicion < 4) {
    // La lista de pestañas de Firefox deja su sitio a la vista en cuadrícula.
    const sitio = CustomizableUI.getPlacementOfWidget("alltabs-button");
    CustomizableUI.addWidgetToArea("bookos-pestanas", CustomizableUI.AREA_TABSTRIP, sitio?.position ?? 0);
    CustomizableUI.removeWidgetFromArea("alltabs-button");
  }
  Services.prefs.setIntPref("bookos.disposicion", DISPOSICION);

  // ── Menú de compartir ─────────────────────────────────────────────────────
  // Por ventana: los menús viven en el documento de cada una.
  const menuCompartir = document.createXULElement("menupopup");
  menuCompartir.id = "bookos-compartir-menu";
  const opcion = (etiqueta, accion) => {
    const item = document.createXULElement("menuitem");
    item.setAttribute("label", etiqueta);
    item.addEventListener("command", accion);
    menuCompartir.append(item);
  };
  const copiado = () =>
    ConfirmationHint.show(document.getElementById("bookos-compartir"), "confirmation-hint-link-copied");
  opcion("Copiar enlace", () => {
    gClipboard.write(gBrowser.currentURI.displaySpec);
    copiado();
  });
  opcion("Copiar título y enlace", () => {
    gClipboard.write(`${gBrowser.selectedTab.label}\n${gBrowser.currentURI.displaySpec}`);
    copiado();
  });
  opcion("Enviar por correo", () => MailIntegration.sendLinkForBrowser(gBrowser.selectedBrowser));
  // Book Share (Quick Share de BookOS) vive en Ajustes: se le pasa el enlace
  // y Ajustes abre su hoja de dispositivos cercanos. Con setsid para que
  // Ajustes no quede colgando como hijo del navegador si no estaba abierto.
  // Solo se ofrece si Ajustes está instalado.
  const { Subprocess } = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs");
  Subprocess.pathSearch("bookos-settings").then(
    () => {
      const item = document.createXULElement("menuitem");
      item.setAttribute("label", "Enviar con Book Share");
      item.addEventListener("command", () => {
        const url = gBrowser.currentURI.displaySpec;
        if (!/^https?:/.test(url)) return;
        Subprocess.call({
          command: "/usr/bin/setsid",
          arguments: ["-f", "bookos-settings", "--share-url", url],
        });
      });
      menuCompartir.prepend(item, document.createXULElement("menuseparator"));
    },
    () => {}
  );
  document.getElementById("mainPopupSet").append(menuCompartir);

  // ── El menú principal, arriba a la izquierda (diseño de Figma) ───────────
  // PanelUI ancla el menú siempre a #PanelUI-menu-button, así que en vez de
  // abrirlo desde otro botón se mueve el suyo. Va delante del área
  // personalizable de las pestañas y no dentro: CustomizableUI rehace esa
  // área y no espera nodos ajenos en ella.
  document
    .getElementById("TabsToolbar-customization-target")
    .before(document.getElementById("PanelUI-button"));
  // Abre hacia la derecha: con la posición de fábrica (pegado al borde
  // derecho del botón) se salía de la ventana por la izquierda.
  document.getElementById("appMenu-popup").setAttribute("position", "bottomleft topleft");

  // ── Fila del título: enfoque y extensiones junto a los botones de ventana.
  // Así la barra de navegación queda solo con lo que se usa al navegar y se
  // puede centrar. Son nodos fijos de Firefox (no widgets), así que se mueven
  // sin pasar por CustomizableUI; Firefox los busca por id.
  const acciones = document.createXULElement("hbox");
  acciones.id = "bookos-acciones";
  const enfoque = document.createXULElement("toolbarbutton");
  enfoque.id = "bookos-enfoque";
  enfoque.className = "toolbarbutton-1";
  enfoque.setAttribute("tooltiptext", "Modo enfoque (F11)");
  enfoque.addEventListener("command", () => (window.fullScreen = !window.fullScreen));
  acciones.append(enfoque, document.getElementById("unified-extensions-button"));
  pestanas.append(acciones);

  // La estrella va fuera de la barra de direcciones, en su propia píldora
  // (diseño de Figma). Es un nodo fijo de #urlbar y no un widget, así que
  // CustomizableUI no la puede mover; BookmarkingUI la busca por id y sigue
  // anclando su panel a ella esté donde esté. Va tras #stop-reload-button
  // (oculto, ver bookos.css) para que nada se cuele entre barra y estrella.
  document
    .getElementById("stop-reload-button")
    .after(document.getElementById("star-button-box"));

  // Recargar dentro de la barra, al final. Un botón propio y no el de la
  // barra de herramientas: ese no se puede meter ahí sin sacarlo de
  // CustomizableUI, y superponerlo no vale porque la barra se pinta encima.
  const recargar = document.createXULElement("hbox");
  recargar.id = "bookos-recargar";
  recargar.className = "urlbar-page-action";
  recargar.setAttribute("role", "button");
  recargar.setAttribute("tooltiptext", "Recargar (F5)");
  const iconoRecargar = document.createXULElement("image");
  iconoRecargar.className = "urlbar-icon";
  recargar.append(iconoRecargar);
  document.getElementById("page-action-buttons").append(recargar);
  recargar.addEventListener("click", ev => {
    if (recargar.hasAttribute("parar")) BrowserCommands.stop();
    else BrowserCommands.reloadOrDuplicate(ev);
  });
  // Browser:Stop solo está activo mientras la página carga: es la misma
  // señal que usa el botón de Firefox para cambiar a «parar».
  const comandoParar = document.getElementById("Browser:Stop");
  new MutationObserver(() =>
    recargar.toggleAttribute("parar", !comandoParar.hasAttribute("disabled"))
  ).observe(comandoParar, { attributeFilter: ["disabled"] });

  // ── Vista de pestañas (Tab overview) ──────────────────────────────────────
  // Una capa sobre la web con una tarjeta por pestaña: miniatura, título y
  // cerrar. Clic o Intro va a esa pestaña; Esc o clic fuera, cierra.
  const HTML = "http://www.w3.org/1999/xhtml";
  const ANCHO_MINIATURA = 260;
  let vista = null;

  const cerrarVista = () => {
    if (!vista) return;
    const v = vista;
    vista = null;
    v.toggleAttribute("abierta", false);
    raiz.removeAttribute("bookos-vista");
    // Se retira al acabar el fundido de salida (220ms en bookos.css).
    setTimeout(() => v.remove(), 220);
    window.removeEventListener("keydown", teclaVista, true);
  };
  function teclaVista(ev) {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    ev.stopPropagation();
    cerrarVista();
  }

  // La miniatura sale de la propia página (drawSnapshot, lo mismo que usan
  // las capturas de Firefox). Una pestaña descargada no tiene página que
  // pintar: se queda con su favicon en grande.
  async function miniatura(tab, lienzo) {
    const wg = tab.linkedBrowser.browsingContext?.currentWindowGlobal;
    if (!wg || !tab.linkedPanel) return false;
    const { width, height } = tab.linkedBrowser.getBoundingClientRect();
    const ancho = width || gBrowser.selectedBrowser.clientWidth;
    const alto = height || gBrowser.selectedBrowser.clientHeight;
    const escala = ANCHO_MINIATURA / ancho;
    try {
      const bmp = await wg.drawSnapshot(new DOMRect(0, 0, ancho, alto), escala, "white");
      lienzo.width = bmp.width;
      lienzo.height = bmp.height;
      lienzo.getContext("2d").drawImage(bmp, 0, 0);
      bmp.close();
      return true;
    } catch (e) {
      // Páginas que no se dejan pintar (about: de otro proceso privilegiado):
      // se quedan con el favicon, igual que las descargadas.
      console.warn("[bookos] sin miniatura para", tab.linkedBrowser.currentURI.spec, e);
      return false;
    }
  }

  function pintarVista() {
    const rejilla = vista.querySelector(".bookos-rejilla");
    rejilla.replaceChildren();
    for (const tab of gBrowser.visibleTabs) {
      const tarjeta = document.createElementNS(HTML, "button");
      tarjeta.className = "bookos-tarjeta";
      tarjeta.toggleAttribute("seleccionada", tab.selected);
      tarjeta.title = tab.label;
      const marco = document.createElementNS(HTML, "div");
      marco.className = "bookos-miniatura";
      const lienzo = document.createElementNS(HTML, "canvas");
      const icono = document.createElementNS(HTML, "img");
      icono.src = tab.getAttribute("image") || "chrome://global/skin/icons/defaultFavicon.svg";
      marco.append(icono, lienzo);
      miniatura(tab, lienzo).then(ok => marco.toggleAttribute("con-miniatura", ok));
      const pie = document.createElementNS(HTML, "div");
      pie.className = "bookos-pie";
      pie.textContent = tab.label;
      const cerrar = document.createElementNS(HTML, "span");
      cerrar.className = "bookos-cerrar";
      cerrar.title = "Cerrar pestaña";
      cerrar.addEventListener("click", ev => {
        ev.stopPropagation();
        gBrowser.removeTab(tab, { animate: false });
        if (!vista) return;
        if (gBrowser.visibleTabs.length) pintarVista();
        else cerrarVista();
      });
      tarjeta.append(marco, pie, cerrar);
      tarjeta.addEventListener("click", () => {
        gBrowser.selectedTab = tab;
        cerrarVista();
      });
      rejilla.append(tarjeta);
    }
    rejilla.querySelector("[seleccionada]")?.focus();
  }

  window.bookosVistaPestanas = () => {
    if (vista) {
      cerrarVista();
      return;
    }
    vista = document.createElementNS(HTML, "div");
    vista.id = "bookos-vista-pestanas";
    // Empieza justo bajo las pestañas, que siguen a la vista; la barra de
    // navegación se esconde mientras (bookos.css, [bookos-vista]).
    vista.style.top = `${pestanas.getBoundingClientRect().bottom}px`;
    raiz.setAttribute("bookos-vista", "");
    const rejilla = document.createElementNS(HTML, "div");
    rejilla.className = "bookos-rejilla";
    vista.append(rejilla);
    vista.addEventListener("click", ev => {
      if (ev.target === vista || ev.target === rejilla) cerrarVista();
    });
    document.documentElement.append(vista);
    pintarVista();
    window.addEventListener("keydown", teclaVista, true);
    // Un fotograma después, para que el fundido de entrada tenga de dónde
    // partir.
    requestAnimationFrame(() => vista?.toggleAttribute("abierta", true));
  };

  // ── Página de inicio ──────────────────────────────────────────────────────
  // La pestaña nueva es la propia ventana: la web vacía se esconde y la barra
  // de direcciones se centra (bookos.css, [bookos-nueva]). Aquí va lo de
  // alrededor: fondo, reloj con saludo, favoritos y el panel «Personalizar».
  // Está en la interfaz y no en una página propia para usar la barra de
  // direcciones de verdad y leer el historial sin pasar por otro proceso.
  // Con el DOM y no con innerHTML: en un documento privilegiado Firefox
  // depura el innerHTML y se quedaba sin los <button> y los <input>.
  const el = (etiqueta, atributos = {}, ...hijos) => {
    const nodo = document.createElementNS(HTML, etiqueta);
    for (const [k, v] of Object.entries(atributos)) nodo.setAttribute(k, v);
    nodo.append(...hijos);
    return nodo;
  };
  const fila = (texto, control) => el("label", { class: "bookos-fila" }, el("span", {}, texto), control);
  const opcionFondo = (valor, texto) => fila(texto, el("input", { type: "radio", name: "fondo", value: valor }));
  const interruptor = (pref, texto) =>
    fila(texto, el("input", { type: "checkbox", class: "bookos-interruptor", "data-pref": pref }));
  const inicio = el(
    "div",
    { id: "bookos-inicio" },
    el("div", { class: "bookos-reloj" }, el("div", { class: "bookos-hora" }), el("div", { class: "bookos-saludo" })),
    el("div", { class: "bookos-favoritos" }),
    el("button", { class: "bookos-personalizar" }, "Personalizar"),
    el(
      "div",
      { class: "bookos-panel-inicio", hidden: "" },
      el("div", { class: "bookos-seccion" }, "Fondo"),
      el(
        "div",
        { class: "bookos-tarjeta-ajustes" },
        opcionFondo("color", "Color de la paleta"),
        opcionFondo("escritorio", "Fondo del escritorio"),
        opcionFondo("imagen", "Imagen propia…")
      ),
      el("div", { class: "bookos-seccion" }, "Mostrar"),
      el(
        "div",
        { class: "bookos-tarjeta-ajustes" },
        interruptor("bookos.inicio.reloj", "Reloj y saludo"),
        interruptor("bookos.inicio.favoritos", "Favoritos")
      )
    )
  );
  document.getElementById("browser").after(inicio);
  const panelInicio = inicio.querySelector(".bookos-panel-inicio");

  // El fondo del escritorio sale de ~/.config/bookos/panel.conf con las
  // mismas reglas que el compositor (bookos-desktop, fondo.rs): fondo_claro
  // o fondo_oscuro según el tema, y si no, fondo para los dos.
  async function fondoEscritorio() {
    const conf = PathUtils.join(Services.dirsvc.get("Home", Ci.nsIFile).path, ".config", "bookos", "panel.conf");
    let texto;
    try {
      texto = await IOUtils.readUTF8(conf);
    } catch (e) {
      return null; // sin panel.conf no hay fondo de escritorio que usar
    }
    const valores = Object.fromEntries(
      texto.split("\n").map(l => l.split("=").map(x => x.trim())).filter(([k, v]) => k && v && !k.startsWith("#"))
    );
    const oscuro = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return (oscuro ? valores.fondo_oscuro : valores.fondo_claro) || valores.fondo || null;
  }

  async function pintarFondoInicio() {
    const modo = Services.prefs.getStringPref("bookos.inicio.fondo");
    let ruta = null;
    if (modo === "escritorio") ruta = await fondoEscritorio();
    if (modo === "imagen") ruta = Services.prefs.getStringPref("bookos.inicio.imagen") || null;
    const existe = ruta && (await IOUtils.exists(ruta));
    inicio.style.backgroundImage = existe ? `url("${PathUtils.toFileURI(ruta)}")` : "";
    inicio.toggleAttribute("con-imagen", !!existe);
    for (const r of inicio.querySelectorAll("input[name=fondo]")) r.checked = r.value === modo;
  }

  function pintarReloj() {
    const ahora = new Date();
    inicio.querySelector(".bookos-hora").textContent = ahora.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const h = ahora.getHours();
    inicio.querySelector(".bookos-saludo").textContent =
      h < 6 ? "Buenas noches" : h < 13 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
  }

  async function pintarFavoritos() {
    const { NewTabUtils } = ChromeUtils.importESModule("resource://gre/modules/NewTabUtils.sys.mjs");
    // topsiteFrecency: 1 en vez del umbral de Firefox, que dejaba la lista
    // vacía hasta haber visitado cada sitio muchas veces (medido: 0 sitios
    // tras visitar tres una vez cada uno).
    const sitios = (await NewTabUtils.activityStreamLinks.getTopSites({ numItems: 8, topsiteFrecency: 1 })).slice(0, 8);
    const caja = inicio.querySelector(".bookos-favoritos");
    caja.replaceChildren(
      ...(await Promise.all(sitios.map(async sitio => {
        const enlace = document.createElementNS(HTML, "button");
        enlace.className = "bookos-favorito";
        enlace.title = sitio.url;
        const dominio = new URL(sitio.url).hostname.replace(/^www\./, "");
        const icono = document.createElementNS(HTML, "img");
        // El favicon guardado que ya trae getTopSites, en su tamaño grande y
        // como URL data: (en Firefox 156 es eso, no bytes). page-icon: queda
        // para los que no lo traen.
        const favicon = typeof sitio.favicon === "string" && sitio.favicon.startsWith("data:") ? sitio.favicon : null;
        // Un SVG que tira de un archivo externo (<image href="logo.png">, el
        // de bookos.es) sale vacío: un SVG usado como imagen no puede cargar
        // nada de fuera. Para esos se pide el icono en mapa de bits más
        // grande que haya guardado (a 192px Places devuelve el PNG de la web
        // en vez del SVG) y, si no hay, la inicial del sitio.
        const svgHueco =
          favicon?.startsWith("data:image/svg+xml;base64,") &&
          /<image[^>]+href="(?!data:)/.test(atob(favicon.slice(favicon.indexOf(",") + 1)));
        icono.src = favicon ?? `page-icon:${sitio.url}`;
        let sinIcono = svgHueco;
        if (svgHueco) {
          const grande = await PlacesUtils.favicons.getFaviconForPage(Services.io.newURI(sitio.url), 192);
          if (grande && grande.mimeType !== "image/svg+xml") {
            icono.src = URL.createObjectURL(new Blob([new Uint8Array(grande.rawData)], { type: grande.mimeType }));
            sinIcono = false;
          }
        }
        icono.addEventListener("error", () => (icono.src = "chrome://global/skin/icons/defaultFavicon.svg"), { once: true });
        const inicial = document.createElementNS(HTML, "span");
        inicial.className = "bookos-inicial";
        inicial.textContent = dominio[0].toUpperCase();
        // El dominio y no el título: los títulos suelen ser frases largas
        // («BookOS — Linux made consistent») que no caben bajo un icono.
        const nombre = document.createElementNS(HTML, "span");
        nombre.textContent = dominio;
        enlace.append(sinIcono ? inicial : icono, nombre);
        enlace.addEventListener("click", ev =>
          openTrustedLinkIn(sitio.url, ev.ctrlKey || ev.button === 1 ? "tab" : "current")
        );
        return enlace;
      })))
    );
    inicio.toggleAttribute("sin-favoritos", !sitios.length);
  }

  function aplicarPrefsInicio() {
    inicio.toggleAttribute("sin-reloj", !Services.prefs.getBoolPref("bookos.inicio.reloj"));
    inicio.toggleAttribute("ocultar-favoritos", !Services.prefs.getBoolPref("bookos.inicio.favoritos"));
    for (const i of inicio.querySelectorAll(".bookos-interruptor")) i.checked = Services.prefs.getBoolPref(i.dataset.pref);
  }

  // El reloj solo corre con la página de inicio a la vista, y despierta al
  // cambiar de minuto y no cada segundo: no muestra segundos.
  let temporizadorReloj = 0;
  const programarReloj = () => {
    clearTimeout(temporizadorReloj);
    if (!raiz.hasAttribute("bookos-nueva")) return;
    pintarReloj();
    temporizadorReloj = setTimeout(programarReloj, 60000 - (Date.now() % 60000) + 50);
  };
  new MutationObserver(() => {
    if (!raiz.hasAttribute("bookos-nueva")) {
      mostrarPanel(false);
      clearTimeout(temporizadorReloj);
      return;
    }
    // Empieza justo bajo las pestañas (la barra de navegación no está).
    inicio.style.top = `${pestanas.getBoundingClientRect().bottom}px`;
    programarReloj();
    pintarFavoritos();
  }).observe(raiz, { attributeFilter: ["bookos-nueva"] });

  const mostrarPanel = abierto => {
    panelInicio.hidden = !abierto;
    raiz.toggleAttribute("bookos-personalizando", abierto);
  };
  inicio.querySelector(".bookos-personalizar").addEventListener("click", () => mostrarPanel(panelInicio.hidden));
  inicio.addEventListener("click", ev => {
    if (!panelInicio.hidden && !ev.target.closest(".bookos-panel-inicio, .bookos-personalizar")) mostrarPanel(false);
  });
  for (const i of inicio.querySelectorAll(".bookos-interruptor")) {
    i.addEventListener("change", () => Services.prefs.setBoolPref(i.dataset.pref, i.checked));
  }
  for (const r of inicio.querySelectorAll("input[name=fondo]")) {
    r.addEventListener("change", async () => {
      if (r.value === "imagen") {
        const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
        fp.init(window.browsingContext, "Imagen de fondo", Ci.nsIFilePicker.modeOpen);
        fp.appendFilters(Ci.nsIFilePicker.filterImages);
        const resultado = await new Promise(resolve => fp.open(resolve));
        if (resultado !== Ci.nsIFilePicker.returnOK) {
          pintarFondoInicio(); // vuelve a marcar la opción que había
          return;
        }
        Services.prefs.setStringPref("bookos.inicio.imagen", fp.file.path);
      }
      Services.prefs.setStringPref("bookos.inicio.fondo", r.value);
    });
  }
  const alCambiarPref = (_s, _t, pref) => {
    if (pref === "bookos.inicio.fondo" || pref === "bookos.inicio.imagen") pintarFondoInicio();
    else aplicarPrefsInicio();
  };
  Services.prefs.addObserver("bookos.inicio.", alCambiarPref);
  window.addEventListener("unload", () => Services.prefs.removeObserver("bookos.inicio.", alCambiarPref));
  // El fondo del escritorio depende del tema claro u oscuro.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", pintarFondoInicio);
  aplicarPrefsInicio();
  pintarFondoInicio();

  // ── Título de la pestaña activa en la primera fila ────────────────────────
  const ponerTitulo = () => pestanas.setAttribute("bookos-titulo", gBrowser.selectedTab.label);
  gBrowser.tabContainer.addEventListener("TabSelect", ponerTitulo);
  gBrowser.tabContainer.addEventListener("TabAttrModified", ev => {
    if (ev.target.selected && ev.detail.changed.includes("label")) ponerTitulo();
  });
  ponerTitulo();

  // ── Pestaña nueva: la barra de direcciones al centro ──────────────────────
  // Se reutiliza la barra de verdad (con su buscador, sugerencias y atajos)
  // en vez de una página propia con otro campo de búsqueda que tendría que
  // reimplementar todo eso desde un proceso de contenido sin privilegios.
  const marcarNueva = () =>
    raiz.toggleAttribute("bookos-nueva", isBlankPageURL(gBrowser.currentURI.spec));
  gBrowser.addProgressListener({
    onLocationChange: marcarNueva,
    QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener", "nsISupportsWeakReference"]),
  });
  gBrowser.tabContainer.addEventListener("TabSelect", marcarNueva);
  marcarNueva();

  // ── Barra que se esconde al bajar ─────────────────────────────────────────
  // Al bajar se va y la web empieza bajo las pestañas; al subir, en
  // cualquier punto, vuelve a su franja. Nunca tapa la página.
  // BookosScrollChild avisa del estado y lo deja en el <browser>; cada
  // pestaña conserva el suyo.
  window.bookosAplicarBarra = () =>
    raiz.setAttribute("bookos-barra", gBrowser.selectedBrowser.bookosBarra ?? "visible");
  gBrowser.tabContainer.addEventListener("TabSelect", bookosAplicarBarra);
  bookosAplicarBarra();

  // ── Paleta dinámica de BookOS Settings ────────────────────────────────────
  // Misma idea que bookos-palette.js en las apps Tauri: la hoja de Settings
  // se añade después de bookos.css, con los mismos selectores, y gana por
  // orden. Se recarga al recuperar el foco porque es cuando puede haber
  // cambiado el fondo de pantalla.
  const paleta = PathUtils.join(Services.dirsvc.get("Home", Ci.nsIFile).path, ".config", "bookos", "palette.css");
  let hojaPaleta = null;
  const aplicarPaleta = async () => {
    let nueva = null;
    if (Services.prefs.getBoolPref("bookos.dynamicPalette") && (await IOUtils.exists(paleta))) {
      // La marca de tiempo esquiva la caché de hojas: con la misma URI
      // Firefox devolvería la paleta anterior aunque el fichero cambiara.
      const { lastModified } = await IOUtils.stat(paleta);
      nueva = `${PathUtils.toFileURI(paleta)}?${lastModified}`;
    }
    if (nueva !== hojaPaleta) {
      if (hojaPaleta) windowUtils.removeSheetUsingURIString(hojaPaleta, windowUtils.AUTHOR_SHEET);
      if (nueva) windowUtils.loadSheetUsingURIString(nueva, windowUtils.AUTHOR_SHEET);
      hojaPaleta = nueva;
    }
    pintarBarrasDeScroll();
  };

  // Hojas globales con la paleta ya resuelta: las páginas (otros procesos) y
  // Ajustes de Firefox no ven las variables de esta ventana. Como son
  // globales, la última registrada de cada una se guarda en una pref para
  // poder retirarla al cambiar la paleta.
  const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
  function registrarHoja(pref, tipo, css) {
    const nueva = Services.io.newURI(`data:text/css;charset=utf-8,${encodeURIComponent(css)}`);
    if (sss.sheetRegistered(nueva, tipo)) return;
    const anterior = Services.prefs.getStringPref(pref, "");
    if (anterior) {
      const uri = Services.io.newURI(anterior);
      if (sss.sheetRegistered(uri, tipo)) sss.unregisterSheet(uri, tipo);
    }
    sss.loadAndRegisterSheet(nueva, tipo);
    Services.prefs.setStringPref(pref, nueva.spec);
  }

  function pintarBarrasDeScroll() {
    const estilo = getComputedStyle(raiz);
    const t = nombre => estilo.getPropertyValue(`--${nombre}`).trim();

    // Barras de desplazamiento de todas las webs, en hoja de agente: una web
    // que ponga su propio scrollbar-color sigue mandando.
    registrarHoja(
      "bookos.hojaScroll",
      sss.AGENT_SHEET,
      `:root { scrollbar-color: color-mix(in srgb, ${t("blue")} 55%, transparent) transparent; }`
    );

    // Ajustes y Extensiones de Firefox con el aspecto de BookOS. Hoja de
    // usuario con !important: las de la página son de autor y, sin él,
    // ganarían. Se ocultan el aviso de «gestionado por tu organización» (son
    // nuestras propias políticas, no una empresa), la promo de navegador
    // predeterminado (defaultBrowser y defaultBrowserSync: sale en dos sitios),
    // la cuenta de Firefox (desactivada por política: «accountDisabled»), la
    // copia de seguridad, los controles de IA, Firefox Labs, «Más de Mozilla»
    // y el enlace de soporte de Mozilla.
    registrarHoja(
      "bookos.hojaAjustes",
      sss.USER_SHEET,
      `@-moz-document url-prefix("about:preferences"), url-prefix("about:settings"), url-prefix("about:addons") {
        :root {
          --background-color-canvas: ${t("bg")} !important;
          --background-color-box: ${t("card")} !important;
          --card-background-color: ${t("card")} !important;
          --card-border-color: transparent !important;
          --card-border-radius: 22px !important;
          --text-color: ${t("tx")} !important;
          --text-color-deemphasized: ${t("tx2")} !important;
          --border-color: ${t("brd")} !important;
          --color-accent-primary: ${t("blue")} !important;
          --color-accent-primary-hover: color-mix(in srgb, ${t("blue")}, ${t("tx")} 12%) !important;
          --color-accent-primary-active: color-mix(in srgb, ${t("blue")}, ${t("tx")} 22%) !important;
          --button-background-color-primary: ${t("blue")} !important;
          --button-background-color-primary-hover: color-mix(in srgb, ${t("blue")}, ${t("tx")} 12%) !important;
          --button-background-color-primary-active: color-mix(in srgb, ${t("blue")}, ${t("tx")} 22%) !important;
          --button-text-color-primary: ${t("on-accent") || "#fff"} !important;
          --button-background-color: ${t("hov")} !important;
          --button-background-color-hover: ${t("act")} !important;
          --button-border-radius: 12px !important;
          --border-radius-medium: 12px !important;
          --focus-outline-color: ${t("blue")} !important;
          --link-color: ${t("blue")} !important;
          background-color: ${t("bg")} !important;
          color: ${t("tx")} !important;
        }
        #policies-container-content, setting-group[groupid="defaultBrowser"],
        setting-group:is([groupid="backup"], [groupid="defaultBrowserSync"], [groupid="accountDisabled"]),
        #weavePrefsDeck, [data-srd-groupid="sync"],
        #category-ai-features, #category-experimental, #category-more-from-mozilla,
        #helpButton, #support-firefox {
          display: none !important;
        }
      }`
    );
  }
  window.addEventListener("activate", aplicarPaleta);
  // Las hojas globales llevan los colores ya calculados, así que no siguen
  // solas al tema como el resto (que va por prefers-color-scheme): al pasar
  // de claro a oscuro, Ajustes y las barras de las webs se quedaban con los
  // colores del tema anterior hasta volver a la ventana.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", pintarBarrasDeScroll);
  Services.prefs.addObserver("bookos.dynamicPalette", aplicarPaleta);
  window.addEventListener("unload", () => Services.prefs.removeObserver("bookos.dynamicPalette", aplicarPaleta));
  aplicarPaleta();
})();
