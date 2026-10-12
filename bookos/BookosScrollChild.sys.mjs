// Lado de contenido de la barra que se esconde al bajar (bookos.uc.js).
//
// El scroll de la página ocurre en el proceso de contenido y la interfaz no
// lo ve, así que este actor lo observa y avisa al padre, pero solo cuando
// cambia de estado: un mensaje por evento de scroll serían ~60 por segundo
// cruzando procesos para nada.
//
// Dos estados:
// - «visible»: la barra ocupa su franja y la web empieza debajo. Nunca tapa
//   nada de la página (ni su menú de navegación).
// - «oculta»: bajando; la web empieza justo bajo las pestañas.
// Al subir, en cualquier punto de la página, vuelve a «visible».

// Píxeles que hay que recorrer en un sentido antes de cambiar de estado. Sin
// este margen, el rebote de inercia del touchpad al parar (unos pocos px
// hacia atrás) volvía a sacar la barra.
const UMBRAL = 24;
// Arriba del todo la barra se ve siempre.
const ARRIBA = 8;
// No se oculta hasta haber bajado más que la franja (58px): al irse, la
// página se compensa subiendo ese alto y no debe quedar dentro de ARRIBA.
const MINIMO_PARA_OCULTAR = 80;

export class BookosScrollChild extends JSWindowActorChild {
  #ultimaY = 0;
  #acumulado = 0;
  #estado = "visible";
  #alto = 0;
  // Solo se compensa el resize que provoca la propia barra al cambiar, no
  // uno del usuario agrandando la ventana.
  #compensar = false;
  // Lo que se desplaza: el documento (null) o el contenedor de una web tipo
  // aplicación. #ultimaY se mide sobre él y la compensación se le aplica a
  // él; con win.scrollBy/scrollY a secas, en esas webs la compensación no
  // movía nada y #ultimaY quedaba en 0, así que el siguiente scroll del
  // contenedor parecía un salto hacia abajo y al subir la barra entraba y
  // salía en bucle.
  #objetivo = null;

  #posicion() {
    return this.#objetivo ? this.#objetivo.scrollTop : this.contentWindow.scrollY;
  }

  handleEvent(ev) {
    const win = this.contentWindow;
    if (ev.type === "pageshow") {
      // Se avisa siempre: el actor es nuevo en cada página y empieza en
      // «visible», pero el <browser> conserva el estado de la anterior. Sin
      // esto, tras bajar en una página la siguiente se abría arriba del todo
      // con la barra oculta.
      this.#estado = null;
      // En las páginas internas (Ajustes, Complementos) la barra se queda:
      // llevan la navegación y el buscador fijos a la ventana, no dentro de lo
      // que se desplaza, y cada vez que la franja entraba o salía saltaban
      // 58px (visto fotograma a fotograma en Ajustes). La compensación solo
      // mueve lo que se desplaza.
      if (win.location.protocol === "about:") {
        this.#avisar("visible", false);
        return;
      }
      // En Gemini el contenido se desplaza dentro de la aplicación: cambiar
      // la altura disponible al ocultar la barra puede realimentar su scroll.
      if (win.location.hostname === "gemini.google.com") {
        this.#avisar("visible", false);
        return;
      }
      // En captura para ver también el scroll de contenedores, que no
      // burbujea (ver abajo).
      win.addEventListener("scroll", this, { passive: true, capture: true });
      win.addEventListener("resize", this);
      this.#alto = win.innerHeight;
      this.#ultimaY = win.scrollY;
      this.#avisar(win.scrollY <= MINIMO_PARA_OCULTAR ? "visible" : "oculta", false);
      return;
    }
    if (ev.type === "resize") {
      // La franja entra o sale y el área de la web encoge o crece por arriba:
      // todo el contenido saltaría (y lo fijo abajo, como un aviso de cookies,
      // se recolocaría a destiempo). Se devuelve ese alto en scroll para que
      // la página se quede donde estaba.
      const cambio = win.innerHeight - this.#alto;
      this.#alto = win.innerHeight;
      if (cambio && this.#compensar) {
        this.#compensar = false;
        (this.#objetivo ?? win).scrollBy({ top: -cambio, behavior: "instant" });
        this.#ultimaY = this.#posicion();
        this.#acumulado = 0;
      }
      return;
    }
    // El scroll del documento o el de un contenedor que ocupa casi toda la
    // ventana: las webs tipo aplicación desplazan un <main> con overflow en
    // vez del documento. Un menú o un carrusel, más pequeños, no cuentan como
    // «bajar por la página».
    const t = ev.target;
    const esDocumento = t === win.document;
    if (!esDocumento && !(t.clientHeight > win.innerHeight * 0.6)) return;
    const objetivo = esDocumento ? null : t;
    if (objetivo !== this.#objetivo) {
      // Las posiciones de dos elementos distintos no se pueden restar.
      this.#objetivo = objetivo;
      this.#ultimaY = this.#posicion();
      this.#acumulado = 0;
    }
    const y = this.#posicion();
    const delta = y - this.#ultimaY;
    this.#ultimaY = y;
    if (y <= ARRIBA) {
      this.#acumulado = 0;
      // Arriba del todo no hay scroll que devolver: que la franja empuje la
      // página es justo lo que se quiere.
      this.#avisar("visible", false);
      return;
    }
    // Se acumula en un sentido; un cambio de sentido empieza de cero.
    this.#acumulado = Math.sign(delta) === Math.sign(this.#acumulado) ? this.#acumulado + delta : delta;
    if (this.#acumulado > UMBRAL && y > MINIMO_PARA_OCULTAR) this.#avisar("oculta", true);
    else if (this.#acumulado < -UMBRAL) this.#avisar("visible", true);
  }

  #avisar(estado, compensar) {
    if (estado === this.#estado) return;
    this.#estado = estado;
    this.#compensar = compensar;
    this.sendAsyncMessage("estado", estado);
  }
}
