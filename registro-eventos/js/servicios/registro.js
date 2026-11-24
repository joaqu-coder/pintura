// Servicio de registro: orquesta captura de contexto, validación, guardado y
// notificación a la UI. Es el único punto que escribe eventos.
//
// Protección contra toques accidentales:
//  - Mientras un pin está guardando, nuevos toques de ese mismo pin se ignoran.
//  - Después de guardar, el mismo pin no vuelve a registrar durante `ventanaDuplicadoMs`.

import { crearEvento, esTipoValido } from '../modelo/eventos.js';
import { ErrorValidacion } from '../core/errores.js';

export const EVENTO_CAMBIO = 'cambio';

export const ESTADOS = Object.freeze({
  GUARDADO: 'guardado',
  OCUPADO: 'ocupado',
  DUPLICADO: 'duplicado',
});

export class RegistroService {
  #repositorio;
  #bus;
  #obtenerContexto;
  #reloj;
  #ventanaDuplicadoMs;
  #enCurso = new Set();
  #ultimoGuardadoPorTipo = new Map();

  constructor({
    repositorio,
    bus,
    obtenerContexto,
    reloj = () => Date.now(),
    ventanaDuplicadoMs = 2000,
  }) {
    this.#repositorio = repositorio;
    this.#bus = bus;
    this.#obtenerContexto = obtenerContexto;
    this.#reloj = reloj;
    this.#ventanaDuplicadoMs = ventanaDuplicadoMs;
  }

  /** true si un toque de este tipo debe registrar ahora (no está guardando ni en enfriamiento). */
  puedeRegistrar(tipo) {
    if (this.#enCurso.has(tipo)) return false;
    const ultimo = this.#ultimoGuardadoPorTipo.get(tipo);
    return ultimo === undefined || this.#reloj() - ultimo >= this.#ventanaDuplicadoMs;
  }

  /**
   * Registra un evento del tipo indicado.
   * @returns {Promise<{estado: string, evento?: object, motivo?: string|null}>}
   */
  async registrar(tipo) {
    if (!esTipoValido(tipo)) {
      throw new ErrorValidacion(`Tipo de evento desconocido: ${tipo}`);
    }
    if (this.#enCurso.has(tipo)) {
      return { estado: ESTADOS.OCUPADO };
    }
    if (!this.puedeRegistrar(tipo)) {
      return { estado: ESTADOS.DUPLICADO };
    }

    // La hora del evento es la del toque, aunque la ubicación tarde en llegar.
    const ahora = new Date(this.#reloj());
    this.#enCurso.add(tipo);
    try {
      const contexto = await this.#capturarContexto();
      const evento = crearEvento({
        tipo,
        ahora,
        ubicacion: contexto.ubicacion,
      });
      await this.#repositorio.guardar(evento);

      this.#ultimoGuardadoPorTipo.set(tipo, this.#reloj());
      this.#bus.emit(EVENTO_CAMBIO, { accion: 'alta', evento });
      return { estado: ESTADOS.GUARDADO, evento, motivo: contexto.motivo };
    } finally {
      this.#enCurso.delete(tipo);
    }
  }

  async listar() {
    return this.#repositorio.listar();
  }

  async eliminar(id) {
    const eliminado = await this.#repositorio.eliminar(id);
    if (eliminado) {
      this.#bus.emit(EVENTO_CAMBIO, { accion: 'baja', id });
    }
    return eliminado;
  }

  /** Nunca falla: si el contexto no se puede obtener, se guarda sin él. */
  async #capturarContexto() {
    try {
      const contexto = await this.#obtenerContexto();
      return {
        ubicacion: contexto?.ubicacion ?? null,
        motivo: contexto?.motivo ?? null,
      };
    } catch (error) {
      console.error('[registro] error al capturar la ubicación', error);
      return { ubicacion: null, motivo: 'error_inesperado' };
    }
  }
}
