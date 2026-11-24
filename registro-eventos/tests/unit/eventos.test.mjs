import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLAVES_TIPO, crearEvento, validarEvento } from '../../js/modelo/eventos.js';
import { ErrorValidacion } from '../../js/core/errores.js';

const base = () => ({
  id: 'abc-123',
  tipo: 'corazon',
  fecha: '2026-11-24',
  hora: '14:32:05',
  temperatura: 21.4,
  ubicacion: { lat: -31.4, lon: -64.2 },
  creadoEn: '2026-11-24T17:32:05.000Z',
});

test('hay exactamente tres tipos de evento con las claves del modelo', () => {
  assert.deepEqual([...CLAVES_TIPO], ['corazon', 'gasolinera', 'cuento']);
});

test('un registro completo es válido', () => {
  assert.deepEqual(validarEvento(base()), []);
});

test('temperatura y ubicación pueden ser null (sin permiso o sin servicio)', () => {
  const e = { ...base(), temperatura: null, ubicacion: null };
  assert.deepEqual(validarEvento(e), []);
});

test('detecta tipo, fecha, hora, temperatura, ubicación y creadoEn inválidos', () => {
  const problemas = validarEvento({
    ...base(),
    tipo: 'otro',
    fecha: '2026-02-30',
    hora: '25:00:00',
    temperatura: 200,
    ubicacion: { lat: 120, lon: 0 },
    creadoEn: 'no-es-fecha',
  });
  assert.deepEqual(problemas, [
    'tipo inválido',
    'fecha inválida',
    'hora inválida',
    'temperatura inválida',
    'ubicación inválida',
    'creadoEn inválido',
  ]);
});

test('rechaza temperaturas NaN o no numéricas (no se inventan valores)', () => {
  assert.ok(validarEvento({ ...base(), temperatura: NaN }).includes('temperatura inválida'));
  assert.ok(validarEvento({ ...base(), temperatura: '21' }).includes('temperatura inválida'));
});

test('crearEvento arma la estructura con fecha y hora locales y creadoEn ISO', () => {
  const ahora = new Date(2026, 10, 24, 9, 5, 7);
  const e = crearEvento({ tipo: 'gasolinera', ahora, temperatura: 18, ubicacion: null, id: 'x1' });
  assert.deepEqual(Object.keys(e).sort(), ['creadoEn', 'fecha', 'hora', 'id', 'temperatura', 'tipo', 'ubicacion']);
  assert.equal(e.id, 'x1');
  assert.equal(e.tipo, 'gasolinera');
  assert.equal(e.fecha, '2026-11-24');
  assert.equal(e.hora, '09:05:07');
  assert.equal(e.temperatura, 18);
  assert.equal(e.ubicacion, null);
  assert.equal(e.creadoEn, ahora.toISOString());
});

test('crearEvento genera id único cuando no se pasa uno', () => {
  const a = crearEvento({ tipo: 'cuento' });
  const b = crearEvento({ tipo: 'cuento' });
  assert.notEqual(a.id, b.id);
  assert.match(a.id, /^[0-9a-f-]{36}$/);
});

test('crearEvento lanza ErrorValidacion con tipo desconocido o fecha inválida', () => {
  assert.throws(() => crearEvento({ tipo: 'nope' }), ErrorValidacion);
  assert.throws(() => crearEvento({ tipo: 'cuento', ahora: new Date('x') }), ErrorValidacion);
});
