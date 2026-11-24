import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esFechaValida,
  esHoraValida,
  fechaLocal,
  horaLocal,
  limitesPeriodo,
  sumarDias,
} from '../../js/core/fecha.js';

test('fechaLocal y horaLocal usan la zona horaria local con ceros a la izquierda', () => {
  const d = new Date(2026, 0, 5, 7, 4, 9); // 5 de enero, 07:04:09 local
  assert.equal(fechaLocal(d), '2026-01-05');
  assert.equal(horaLocal(d), '07:04:09');
});

test('esFechaValida rechaza formatos y fechas imposibles', () => {
  assert.equal(esFechaValida('2026-02-28'), true);
  assert.equal(esFechaValida('2024-02-29'), true);
  assert.equal(esFechaValida('2026-02-29'), false);
  assert.equal(esFechaValida('2026-13-01'), false);
  assert.equal(esFechaValida('26-01-01'), false);
  assert.equal(esFechaValida(null), false);
});

test('esHoraValida acepta HH:MM:SS y rechaza valores fuera de rango', () => {
  assert.equal(esHoraValida('23:59:59'), true);
  assert.equal(esHoraValida('24:00:00'), false);
  assert.equal(esHoraValida('12:60:00'), false);
  assert.equal(esHoraValida('12:30'), false);
});

test('sumarDias cruza meses, años y bisiestos sin depender de la zona horaria', () => {
  assert.equal(sumarDias('2026-01-01', -1), '2025-12-31');
  assert.equal(sumarDias('2026-02-27', 2), '2026-03-01');
  assert.equal(sumarDias('2024-02-28', 1), '2024-02-29');
  assert.equal(sumarDias('2026-11-24', 0), '2026-11-24');
});

test('limitesPeriodo: hoy, 7 y 30 días son inclusivos; todo no tiene límites', () => {
  const hoy = '2026-11-24';
  assert.deepEqual(limitesPeriodo('hoy', hoy), { desde: '2026-11-24', hasta: '2026-11-24' });
  assert.deepEqual(limitesPeriodo('7d', hoy), { desde: '2026-11-18', hasta: '2026-11-24' });
  assert.deepEqual(limitesPeriodo('30d', hoy), { desde: '2026-10-26', hasta: '2026-11-24' });
  assert.equal(limitesPeriodo('todo', hoy), null);
});
