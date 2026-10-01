// Lado de la interfaz: recibe el estado de BookosScrollChild y lo guarda en
// el <browser>, para que al cambiar de pestaña se recupere el de esa página.
export class BookosScrollParent extends JSWindowActorParent {
  receiveMessage({ data }) {
    const browser = this.browsingContext.top.embedderElement;
    if (!browser) return;
    browser.bookosBarra = data;
    const win = browser.ownerDocument.defaultView;
    if (browser === win.gBrowser?.selectedBrowser) win.bookosAplicarBarra?.();
  }
}
