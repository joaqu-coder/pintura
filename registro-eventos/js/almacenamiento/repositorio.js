// Capa de persistencia de eventos.
//
// CONTRATO (RepositorioEventos): todos los métodos son asíncronos, así la UI
// no depende de dónde se guardan los datos. Hoy hay dos implementaciones:
//   - LocalStorageRepositorio: persistencia en el dispositivo (versión actual).
//   - MemoriaRepositorio: respaldo si el navegador bloquea el almacenamiento.
// Para pasar a una base de datos en la nube, basta con una clase nueva que
// cumpla el mismo contrato (por ejemplo, una que llame a una API y sincronice).

import { validarEvento } from '../modelo/eventos.js';
import { ErrorAlmacenamiento, ErrorValidacion } from '../core/errores.js';

export const CLAVE_STORAGE = 'registro-eventos:v1';

/** Clase base de referencia del contrato. No instanciar directamente. */
export class RepositorioEventos {
  async listar() {
    throw new Error('listar() no implementado');
  }
  async guardar(_evento) {
    throw new Error('guardar() no implementado');
  }
  /** Devuelve true si el registro existía y fue eliminado. */
  async eliminar(_id) {
    throw new Error('eliminar() no implementado');
  }
}

export class LocalStorageRepositorio extends RepositorioEventos {
  #storage;
  #clave;
  #descartados = 0;

  constructor({ storage = globalThis.localStorage, clave = CLAVE_STORAGE } = {}) {
    super();
    this.#storage = storage;
    this.#clave = clave;
  }

  /** Cantidad de registros inválidos ignorados en la última lectura. */
  get descartados() {
    return this.#descartados;
  }

  async listar() {
    let crudo;
    try {
      crudo = this.#storage.getItem(this.#clave);
    } catch (error) {
      throw new ErrorAlmacenamiento('No se pudo leer el almacenamiento del dispositivo.', { cause: error });
    }
    if (crudo === null) return [];

    let datos;
    try {
      datos = JSON.parse(crudo);
    } catch {
      this.#respaldarCorrupto(crudo);
      return [];
    }
    if (!Array.isArray(datos)) {
      this.#respaldarCorrupto(crudo);
      return [];
    }

    const validos = [];
    this.#descartados = 0;
    for (const item of datos) {
      if (validarEvento(item).length === 0) {
        validos.push(item);
      } else {
        this.#descartados += 1;
      }
    }
    if (this.#descartados > 0) {
      console.warn(`[repositorio] se ignoraron ${this.#descartados} registros inválidos`);
    }
    return validos;
  }

  async guardar(evento) {
    const problemas = validarEvento(evento);
    if (problemas.length > 0) {
      throw new ErrorValidacion(`Registro inválido: ${problemas.join(', ')}.`);
    }

    const eventos = await this.listar();
    if (eventos.some((e) => e.id === evento.id)) {
      throw new ErrorValidacion('Ya existe un registro con ese identificador.');
    }
    eventos.push(evento);
    this.#escribir(eventos);
    return evento;
  }

  async eliminar(id) {
    const eventos = await this.listar();
    const restantes = eventos.filter((e) => e.id !== id);
    if (restantes.length === eventos.length) return false;
    this.#escribir(restantes);
    return true;
  }

  #escribir(lista) {
    try {
      this.#storage.setItem(this.#clave, JSON.stringify(lista));
    } catch (error) {
      const sinEspacio = error?.name === 'QuotaExceededError';
      throw new ErrorAlmacenamiento(
        sinEspacio ? 'La memoria del dispositivo está llena.' : 'No se pudo guardar el registro.',
        { cause: error },
      );
    }
  }

  /** Guarda una copia de datos ilegibles para no perderlos al reescribir. */
  #respaldarCorrupto(crudo) {
    console.warn('[repositorio] datos corruptos: se respaldan y se inicia vacío');
    try {
      this.#storage.setItem(`${this.#clave}:respaldo:${Date.now()}`, crudo);
    } catch {
      // Si tampoco hay espacio para el respaldo, seguimos igual.
    }
  }
}

export class MemoriaRepositorio extends RepositorioEventos {
  #eventos = [];

  async listar() {
    return this.#eventos.slice();
  }

  async guardar(evento) {
    const problemas = validarEvento(evento);
    if (problemas.length > 0) {
      throw new ErrorValidacion(`Registro inválido: ${problemas.join(', ')}.`);
    }
    this.#eventos.push(evento);
    return evento;
  }

  async eliminar(id) {
    const antes = this.#eventos.length;
    this.#eventos = this.#eventos.filter((e) => e.id !== id);
    return this.#eventos.length !== antes;
  }
}

/**
 * Elige la mejor persistencia disponible.
 * Devuelve { repositorio, persistente }. Si persistente es false, los datos
 * solo viven mientras la app esté abierta, y la UI debe avisarlo.
 */
export function crearRepositorio(storage) {
  try {
    // El acceso a localStorage también puede lanzar (bloqueo de cookies/sitio).
    const almacen = storage ?? globalThis.localStorage;
    const sonda = '__sonda__';
    almacen.setItem(sonda, '1');
    almacen.removeItem(sonda);
    return { repositorio: new LocalStorageRepositorio({ storage: almacen }), persistente: true };
  } catch {
    return { repositorio: new MemoriaRepositorio(), persistente: false };
  }
}
