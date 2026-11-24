import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAVE_STORAGE,
  LocalStorageRepositorio,
  MemoriaRepositorio,
  crearRepositorio,
} from '../../js/almacenamiento/repositorio.js';
import { crearEvento } from '../../js/modelo/eventos.js';
import { ErrorAlmacenamiento, ErrorValidacion } from '../../js/core/errores.js';

/** Implementación en memoria de Storage para probar sin navegador. */
class FakeStorage {
  #datos = new Map();
  quota = false;
  getItem(k) {
    return this.#datos.has(k) ? this.#datos.get(k) : null;
  }
  setItem(k, v) {
    if (this.quota) {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.#datos.set(k, String(v));
  }
  removeItem(k) {
    this.#datos.delete(k);
  }
  get size() {
    return this.#datos.size;
  }
  keys() {
    return [...this.#datos.keys()];
  }
  raw(k = CLAVE_STORAGE) {
    return this.#datos.get(k);
  }
}

const nuevo = (tipo = 'corazon', id) =>
  crearEvento({ tipo, ahora: new Date(2026, 10, 24, 10, 0, 0), temperatura: 20, ubicacion: null, id });

test('listar devuelve [] cuando no hay datos guardados', async () => {
  const repo = new LocalStorageRepositorio({ storage: new FakeStorage() });
  assert.deepEqual(await repo.listar(), []);
});

test('guardar y listar persisten los registros en orden de inserción', async () => {
  const storage = new FakeStorage();
  const repo = new LocalStorageRepositorio({ storage });
  await repo.guardar(nuevo('corazon', 'a'));
  await repo.guardar(nuevo('cuento', 'b'));

  // Una instancia nueva (como al reabrir la app) ve los mismos datos.
  const otra = new LocalStorageRepositorio({ storage });
  const lista = await otra.listar();
  assert.deepEqual(lista.map((e) => e.id), ['a', 'b']);
  assert.deepEqual(lista[1].ubicacion, null);
});

test('guardar rechaza registros inválidos y ids duplicados', async () => {
  const repo = new LocalStorageRepositorio({ storage: new FakeStorage() });
  await assert.rejects(() => repo.guardar({ id: 'x' }), ErrorValidacion);
  await repo.guardar(nuevo('corazon', 'dup'));
  await assert.rejects(() => repo.guardar(nuevo('corazon', 'dup')), ErrorValidacion);
});

test('eliminar quita solo el registro indicado y devuelve false si no existe', async () => {
  const repo = new LocalStorageRepositorio({ storage: new FakeStorage() });
  await repo.guardar(nuevo('corazon', 'a'));
  await repo.guardar(nuevo('gasolinera', 'b'));
  assert.equal(await repo.eliminar('a'), true);
  assert.equal(await repo.eliminar('a'), false);
  assert.deepEqual((await repo.listar()).map((e) => e.id), ['b']);
});

test('datos corruptos: se respaldan, se devuelve [] y se puede volver a guardar', async () => {
  const storage = new FakeStorage();
  storage.setItem(CLAVE_STORAGE, '{no es json');
  const repo = new LocalStorageRepositorio({ storage });

  assert.deepEqual(await repo.listar(), []);
  const respaldo = storage.keys().find((k) => k.startsWith(`${CLAVE_STORAGE}:respaldo:`));
  assert.ok(respaldo, 'debe existir una copia de respaldo del contenido corrupto');
  assert.equal(storage.raw(respaldo), '{no es json');

  await repo.guardar(nuevo('cuento', 'nuevo'));
  assert.deepEqual((await repo.listar()).map((e) => e.id), ['nuevo']);
});

test('datos que no son un arreglo se tratan como corruptos', async () => {
  const storage = new FakeStorage();
  storage.setItem(CLAVE_STORAGE, JSON.stringify({ algo: 1 }));
  assert.deepEqual(await new LocalStorageRepositorio({ storage }).listar(), []);
});

test('registros inválidos guardados a mano se descartan sin romper la lista', async () => {
  const storage = new FakeStorage();
  const bueno = nuevo('corazon', 'ok');
  storage.setItem(CLAVE_STORAGE, JSON.stringify([bueno, { id: 'roto', tipo: 'x' }, null]));
  const repo = new LocalStorageRepositorio({ storage });
  assert.deepEqual((await repo.listar()).map((e) => e.id), ['ok']);
  assert.equal(repo.descartados, 2);
});

test('sin espacio en el dispositivo se lanza ErrorAlmacenamiento con mensaje claro', async () => {
  const storage = new FakeStorage();
  const repo = new LocalStorageRepositorio({ storage });
  storage.quota = true;
  await assert.rejects(() => repo.guardar(nuevo('corazon', 'x')), (err) => {
    assert.ok(err instanceof ErrorAlmacenamiento);
    assert.match(err.message, /memoria del dispositivo está llena/);
    return true;
  });
});

test('crearRepositorio cae a memoria si el almacenamiento no está disponible', async () => {
  const roto = {
    setItem() {
      throw new Error('SecurityError');
    },
    removeItem() {},
  };
  const { repositorio, persistente } = crearRepositorio(roto);
  assert.equal(persistente, false);
  assert.ok(repositorio instanceof MemoriaRepositorio);

  await repositorio.guardar(nuevo('gasolinera', 'm1'));
  assert.equal((await repositorio.listar()).length, 1);
});

test('crearRepositorio usa localStorage cuando está disponible', () => {
  const { repositorio, persistente } = crearRepositorio(new FakeStorage());
  assert.equal(persistente, true);
  assert.ok(repositorio instanceof LocalStorageRepositorio);
});
