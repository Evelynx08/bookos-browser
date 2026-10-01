// Solo para desarrollo: el lanzador lo carga si BOOKOS_CAPTURA tiene una ruta.
// Guarda un PNG de la ventana (la interfaz, no el contenido web, que va en
// otro proceso) a los 3 s. Existe porque spectacle no captura bajo el
// compositor de BookOS y grim no está instalado.
setTimeout(async () => {
  const ruta = Services.env.get("BOOKOS_CAPTURA");
  // BOOKOS_DEPURAR: expresión que se evalúa en la ventana y se vuelca por
  // stdout, para inspeccionar el árbol sin abrir las herramientas.
  if (Services.env.get("BOOKOS_DEPURAR")) {
    try {
      dump(`[bookos] ${String(Cu.evalInSandbox(Services.env.get("BOOKOS_DEPURAR"), Cu.Sandbox(window, { sandboxPrototype: window, wantXrays: false })))}\n`);
    } catch (e) {
      dump(`[bookos] ${e}\n`);
    }
  }
  // BOOKOS_DEPURAR puede cambiar el estado (pantalla completa, abrir un
  // panel): se da un respiro para que se pinte antes de la foto.
  await new Promise(r => setTimeout(r, Number(Services.env.get("BOOKOS_CAPTURA_PAUSA") || 0)));
  const bmp = await window.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, "transparent");
  const lienzo = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
  lienzo.width = bmp.width;
  lienzo.height = bmp.height;
  lienzo.getContext("2d").drawImage(bmp, 0, 0);
  const blob = await new Promise(r => lienzo.toBlob(r, "image/png"));
  await IOUtils.write(ruta, new Uint8Array(await blob.arrayBuffer()));
  console.log("[bookos] captura en", ruta);
  // Cerrar desde dentro: matarlo con una señal durante el arranque varias
  // veces seguidas hace que Firefox se relance solo en modo seguro.
  if (Services.env.get("BOOKOS_CAPTURA_SALIR")) {
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
  }
}, Number(Services.env.get("BOOKOS_CAPTURA_ESPERA") || 3000));
