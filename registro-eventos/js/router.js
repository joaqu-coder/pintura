// Navegación por hash (#/registro, #/dashboard, #/historial).
// Usar el hash permite recargar en la misma pantalla y funciona sin configurar el servidor.

export function iniciarRouter({ contenedor, rutas, rutaPorDefecto, alCambiar }) {
  let actual = null;

  function leerRuta() {
    const nombre = globalThis.location.hash.replace(/^#\/?/, '');
    return Object.hasOwn(rutas, nombre) ? nombre : rutaPorDefecto;
  }

  function ir() {
    const nombre = leerRuta();
    if (actual?.nombre === nombre) return;

    actual?.vista?.destruir?.();
    const vista = rutas[nombre].crear();
    contenedor.replaceChildren(vista.el);
    actual = { nombre, vista };

    alCambiar?.(nombre);
    globalThis.scrollTo?.(0, 0);
  }

  globalThis.addEventListener('hashchange', ir);
  ir();

  return {
    ir,
    rutaActual: () => actual?.nombre ?? null,
  };
}
