// Bus de eventos mínimo para desacoplar servicios y pantallas.
// Ejemplo: el servicio emite "cambio" y el Dashboard/Historial se repintan
// sin que el servicio conozca a ninguna pantalla.

export class Bus {
  #oyentes = new Map();

  /** Suscribe una función a un evento. Devuelve la función para cancelar. */
  on(evento, fn) {
    if (!this.#oyentes.has(evento)) this.#oyentes.set(evento, new Set());
    this.#oyentes.get(evento).add(fn);
    return () => this.off(evento, fn);
  }

  off(evento, fn) {
    this.#oyentes.get(evento)?.delete(fn);
  }

  emit(evento, datos) {
    for (const fn of [...(this.#oyentes.get(evento) ?? [])]) {
      try {
        fn(datos);
      } catch (error) {
        // Un oyente roto no debe impedir que avisemos a los demás.
        console.error(`[bus] error en oyente de "${evento}"`, error);
      }
    }
  }
}
