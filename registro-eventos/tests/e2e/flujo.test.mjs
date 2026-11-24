// Pruebas de extremo a extremo en Chromium (Playwright).
// Sirven la app con un servidor estático local y simulan la geolocalización.
//
// Ejecutar:  node --test registro-eventos/tests/e2e/flujo.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { fechaLocal, sumarDias } from '../../js/core/fecha.js';

// Playwright se resuelve como CommonJS (respeta NODE_PATH / instalación local).
const { chromium } = createRequire(import.meta.url)('playwright');

// Raíz del repo: se sirve desde ahí para que la app quede en /registro-eventos/ (como en el sitio real).
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CAPTURAS = process.env.CAPTURAS_DIR ?? null;
const CLAVE = 'registro-eventos:v1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

let servidor;
let base;
let navegador;

before(async () => {
  servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let archivo = path.join(RAIZ, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) archivo = path.join(archivo, 'index.html');
    if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(archivo)] ?? 'application/octet-stream' });
    fs.createReadStream(archivo).pipe(res);
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}/`;
  navegador = await chromium.launch();
});

after(async () => {
  await navegador?.close();
  servidor?.close();
});

/** Crea un contexto móvil (390x844) con sus simulaciones. */
async function nuevoContexto({ ubicacion = true, serviceWorkers = 'block' } = {}) {
  const contexto = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Cordoba',
    serviceWorkers,
    permissions: ubicacion ? ['geolocation'] : [],
    geolocation: { latitude: -31.42008, longitude: -64.18877 },
  });
  return contexto;
}

async function abrir(contexto, ruta = '') {
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(e.message));
  await pagina.goto(`${base}registro-eventos/${ruta}`);
  pagina.errores = errores;
  return pagina;
}

const leerRegistros = (pagina) =>
  pagina.evaluate((clave) => JSON.parse(localStorage.getItem(clave) ?? '[]'), CLAVE);

const sembrar = async (pagina, registros) => {
  await pagina.evaluate(([clave, datos]) => localStorage.setItem(clave, JSON.stringify(datos)), [CLAVE, registros]);
  await pagina.reload();
};

function registro({ id, tipo, fecha, hora, ubicacion = null }) {
  return {
    id,
    tipo,
    fecha,
    hora,
    ubicacion,
    creadoEn: new Date(`${fecha}T${hora}`).toISOString(),
  };
}

// "Hoy" debe calcularse en la zona del navegador (la app usa la hora local del dispositivo),
// no en la del proceso de Node, que puede estar en UTC.
const ZONA_NAVEGADOR = 'America/Argentina/Cordoba';
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_NAVEGADOR, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const AYER = sumarDias(HOY, -1);
const HACE_10 = sumarDias(HOY, -10);
const HACE_40 = sumarDias(HOY, -40);

const DATOS_BASE = [
  registro({ id: 'r1', tipo: 'corazon', fecha: HACE_40, hora: '08:00:00' }),
  registro({ id: 'r2', tipo: 'cuento', fecha: HACE_10, hora: '07:30:00' }),
  registro({ id: 'r3', tipo: 'gasolinera', fecha: AYER, hora: '18:10:00' }),
  registro({ id: 'r4', tipo: 'corazon', fecha: HOY, hora: '09:00:00' }),
  registro({ id: 'r5', tipo: 'corazon', fecha: HOY, hora: '11:45:30' }),
];

// ───────────────── Registro ─────────────────

test('la pantalla Registro muestra los tres pines y la barra inferior', async () => {
  const contexto = await nuevoContexto();
  const p = await abrir(contexto);

  await p.getByRole('button', { name: 'Registrar corazón' }).waitFor();
  for (const etiqueta of ['CORAZÓN', 'GASOLINERA', 'CUENTO']) {
    await p.getByText(etiqueta, { exact: true }).waitFor();
  }
  assert.equal(await p.locator('.barra a').count(), 3);
  assert.equal(await p.locator('.barra a[aria-current="page"]').innerText(), 'Registro');
  assert.deepEqual(p.errores, []);
  await contexto.close();
});

test('tocar un pin guarda fecha, hora y ubicación, y muestra la confirmación', async () => {
  const contexto = await nuevoContexto();
  const p = await abrir(contexto);

  await p.getByRole('button', { name: 'Registrar corazón' }).click();
  const aviso = p.locator('#capa-avisos .aviso-ok');
  await aviso.waitFor();
  assert.match(await aviso.innerText(), /Corazón registrado/);
  assert.match(await aviso.innerText(), /Ubicación\s+Guardada/);
  assert.doesNotMatch(await aviso.innerText(), /Temperatura/);

  const datos = await leerRegistros(p);
  assert.equal(datos.length, 1);
  const [r] = datos;
  assert.equal(r.tipo, 'corazon');
  assert.deepEqual(r.ubicacion, { lat: -31.4201, lon: -64.1888 });
  assert.match(r.id, /^[0-9a-f-]{36}$/);
  assert.match(r.hora, /^\d{2}:\d{2}:\d{2}$/);
  assert.equal(r.fecha, HOY, 'fecha local del dispositivo');
  assert.ok(!Number.isNaN(Date.parse(r.creadoEn)));
  assert.deepEqual(Object.keys(r).sort(), ['creadoEn', 'fecha', 'hora', 'id', 'tipo', 'ubicacion']);
  assert.deepEqual(p.errores, []);
  await contexto.close();
});

test('un toque accidental doble registra una sola vez', async () => {
  const contexto = await nuevoContexto();
  const p = await abrir(contexto);
  const pin = p.getByRole('button', { name: 'Registrar gasolinera' });

  await pin.click();
  await pin.click({ delay: 0 });
  await p.locator('#capa-avisos .aviso-ok').waitFor();
  await p.waitForTimeout(300);

  assert.equal((await leerRegistros(p)).length, 1);
  // El toque repetido no tapa la confirmación del registro real.
  assert.match(await p.locator('#capa-avisos').innerText(), /Gasolinera registrado/);
  await contexto.close();
});

test('sin permiso de ubicación se guarda igual, sin ubicación, indicándolo', async () => {
  const contexto = await nuevoContexto({ ubicacion: false });
  const p = await abrir(contexto);
  // Simula el rechazo del permiso de ubicación del sistema.
  await p.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (_ok, fail) => fail({ code: 1, message: 'denied' });
  });

  await p.getByRole('button', { name: 'Registrar cuento' }).click();
  const aviso = p.locator('#capa-avisos .aviso-ok');
  await aviso.waitFor();
  assert.match(await aviso.innerText(), /No disponible · Sin permiso de ubicación/);

  const [r] = await leerRegistros(p);
  assert.equal(r.tipo, 'cuento');
  assert.equal(r.ubicacion, null);
  await contexto.close();
});

test('el registro persiste al cerrar y reabrir la app', async () => {
  const contexto = await nuevoContexto();
  const p = await abrir(contexto);
  await p.getByRole('button', { name: 'Registrar cuento' }).click();
  await p.locator('#capa-avisos .aviso-ok').waitFor();
  await p.close();

  const otra = await abrir(contexto, '#/historial');
  await otra.locator('.evento').first().waitFor();
  assert.equal(await otra.locator('.evento').count(), 1);
  await contexto.close();
});

// ───────────────── Dashboard ─────────────────

test('el Dashboard muestra total, categorías y último evento', async () => {
  const contexto = await nuevoContexto();
  const p = await abrir(contexto);
  await sembrar(p, DATOS_BASE);

  await p.getByRole('link', { name: 'Dashboard' }).click();
  await p.locator('.total-numero').waitFor();
  assert.equal(await p.locator('.total-numero').innerText(), '5');

  const leyenda = await p.locator('.leyenda-item').allInnerTexts();
  assert.match(leyenda[0], /Corazón\s+3 · 60%/);
  assert.match(leyenda[1], /Gasolinera\s+1 · 20%/);
  assert.match(leyenda[2], /Cuento\s+1 · 20%/);

  // Último evento: el de hoy a las 11:45 (Corazón)
  const ultimo = await p.locator('.pagina-dashboard .ultimo').innerText();
  assert.match(ultimo, /Corazón/);
  assert.match(ultimo, /11:45/);
  assert.equal(await p.locator('.pagina-dashboard').getByText(/temperatura/i).count(), 0);
  assert.deepEqual(p.errores, []);
  await contexto.close();
});

test('los filtros de período recalculan los indicadores', async () => {
  const contexto = await nuevoContexto();
  const p = await abrir(contexto);
  await sembrar(p, DATOS_BASE);
  await p.getByRole('link', { name: 'Dashboard' }).click();
  await p.locator('.total-numero').waitFor();

  const total = async () => p.locator('.total-numero').innerText();
  await p.getByRole('button', { name: 'Hoy', exact: true }).click();
  assert.equal(await total(), '2');
  await p.getByRole('button', { name: '7 días', exact: true }).click();
  assert.equal(await total(), '3');
  await p.getByRole('button', { name: '30 días', exact: true }).click();
  assert.equal(await total(), '4');
  await p.getByRole('button', { name: 'Todo', exact: true }).click();
  assert.equal(await total(), '5');
  await contexto.close();
});

test('el Dashboard se actualiza solo al registrar un evento (también desde otra pestaña)', async () => {
  const contexto = await nuevoContexto();
  const dashboard = await abrir(contexto, '#/dashboard');
  await sembrar(dashboard, DATOS_BASE);
  await dashboard.locator('.total-numero').waitFor();
  assert.equal(await dashboard.locator('.total-numero').innerText(), '5');

  const registro = await abrir(contexto);
  await registro.getByRole('button', { name: 'Registrar gasolinera' }).click();
  await registro.locator('#capa-avisos .aviso-ok').waitFor();

  await dashboard.waitForFunction(() => document.querySelector('.total-numero')?.textContent === '6', null, { timeout: 5000 });
  assert.equal(await dashboard.locator('.total-numero').innerText(), '6');
  await contexto.close();
});

test('el Dashboard sin registros muestra un estado vacío', async () => {
  const contexto = await nuevoContexto();
  const p = await abrir(contexto, '#/dashboard');
  await p.getByText('Todavía no hay registros').waitFor();
  assert.equal(await p.locator('.total-numero').innerText(), '0');
  await contexto.close();
});

// ───────────────── Historial ─────────────────

test('el Historial lista del más reciente al más antiguo con icono, fecha y hora', async () => {
  const contexto = await nuevoContexto();
  const p = await abrir(contexto);
  await sembrar(p, DATOS_BASE);
  await p.getByRole('link', { name: 'Historial' }).click();
  await p.locator('.evento').first().waitFor();

  const ids = await p.locator('.evento').evaluateAll((els) => els.map((e) => e.dataset.id));
  assert.deepEqual(ids, ['r5', 'r4', 'r3', 'r2', 'r1']);

  const primera = await p.locator('.evento').first().innerText();
  assert.match(primera, /Corazón/);
  assert.match(primera, /11:45/);
  assert.doesNotMatch(primera, /°C/);
  await contexto.close();
});

test('el Historial filtra por categoría y por fecha', async () => {
  const contexto = await nuevoContexto();
  const p = await abrir(contexto);
  await sembrar(p, DATOS_BASE);
  await p.getByRole('link', { name: 'Historial' }).click();
  await p.locator('.evento').first().waitFor();

  await p.getByRole('button', { name: /Corazón/ }).click();
  assert.equal(await p.locator('.evento').count(), 3);
  await p.getByRole('button', { name: 'Todos', exact: true }).click();
  assert.equal(await p.locator('.evento').count(), 5);

  await p.locator('input[type="date"]').fill(AYER);
  assert.equal(await p.locator('.evento').count(), 1);
  assert.match(await p.locator('.evento').first().innerText(), /Gasolinera/);

  await p.locator('input[type="date"]').fill(HACE_40);
  assert.equal(await p.locator('.evento').count(), 1);

  await p.getByRole('button', { name: 'Ver todas las fechas' }).click();
  assert.equal(await p.locator('.evento').count(), 5);
  await contexto.close();
});

test('eliminar pide confirmación; cancelar no borra y confirmar sí', async () => {
  const contexto = await nuevoContexto();
  const p = await abrir(contexto);
  await sembrar(p, DATOS_BASE);
  await p.getByRole('link', { name: 'Historial' }).click();
  await p.locator('.evento').first().waitFor();

  await p.locator('.evento-borrar').first().click();
  const dialogo = p.getByRole('alertdialog');
  await dialogo.waitFor();
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  assert.equal(await p.locator('.evento').count(), 5);
  assert.equal((await leerRegistros(p)).length, 5);

  await p.locator('.evento-borrar').first().click();
  await p.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.evento').length === 4);
  const restantes = await leerRegistros(p);
  assert.equal(restantes.length, 4);
  assert.ok(!restantes.some((r) => r.id === 'r5'));
  await contexto.close();
});

test('exportar CSV descarga un archivo con encabezado y los registros filtrados', async () => {
  const contexto = await nuevoContexto();
  const p = await abrir(contexto);
  await sembrar(p, DATOS_BASE);
  await p.getByRole('link', { name: 'Historial' }).click();
  await p.locator('.evento').first().waitFor();
  await p.getByRole('button', { name: /Corazón/ }).click();

  const [descarga] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Exportar CSV/ }).click()]);
  assert.equal(descarga.suggestedFilename(), `registro-eventos-${HOY}.csv`);
  const texto = fs.readFileSync(await descarga.path(), 'utf8');
  const lineas = texto.replace(/^﻿/, '').trimEnd().split('\r\n');
  assert.equal(lineas[0], 'id,tipo,fecha,hora,latitud,longitud,creado_en');
  assert.equal(lineas.length, 4, 'encabezado + 3 corazones');
  assert.ok(lineas.every((l) => l.includes('corazon') || l.startsWith('id,')));
  await contexto.close();
});

test('el Historial vacío muestra un mensaje y deshabilita exportar', async () => {
  const contexto = await nuevoContexto();
  const p = await abrir(contexto, '#/historial');
  await p.getByText('Todavía no hay registros.').waitFor();
  assert.equal(await p.getByRole('button', { name: /Exportar CSV/ }).isDisabled(), true);
  await contexto.close();
});

// ───────────────── Estructura, móvil y PWA ─────────────────

test('en celular no hay scroll horizontal y la barra inferior queda pegada al borde', async () => {
  const contexto = await nuevoContexto();
  const p = await abrir(contexto);
  await sembrar(p, DATOS_BASE);

  for (const ruta of ['#/registro', '#/dashboard', '#/historial']) {
    await p.goto(`${base}registro-eventos/${ruta}`);
    await p.locator('.barra').waitFor();
    await p.waitForTimeout(300);
    const medidas = await p.evaluate(() => ({
      anchoPagina: document.documentElement.scrollWidth,
      anchoVentana: window.innerWidth,
      barraBottom: document.querySelector('.barra').getBoundingClientRect().bottom,
      alturaVentana: window.innerHeight,
    }));
    assert.ok(medidas.anchoPagina <= medidas.anchoVentana, `${ruta}: scroll horizontal ${medidas.anchoPagina}>${medidas.anchoVentana}`);
    assert.ok(Math.abs(medidas.barraBottom - medidas.alturaVentana) < 1, `${ruta}: barra no pegada abajo`);
  }
  await contexto.close();
});

test('los pines tienen área táctil grande (≥ 96 px) en celular', async () => {
  const contexto = await nuevoContexto();
  const p = await abrir(contexto);
  for (const nombre of ['corazón', 'gasolinera', 'cuento']) {
    const caja = await p.getByRole('button', { name: `Registrar ${nombre}` }).boundingBox();
    assert.ok(caja.width >= 96 && caja.height >= 96, `${nombre}: ${caja.width}x${caja.height}`);
  }
  await contexto.close();
});

test('se registra un service worker con alcance propio y el manifiesto es instalable', async () => {
  const contexto = await nuevoContexto({ serviceWorkers: 'allow' });
  const p = await abrir(contexto);
  const scope = await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.scope;
  });
  assert.match(scope, /\/registro-eventos\/$/);
  assert.equal(await p.locator('link[rel="manifest"]').getAttribute('href'), 'manifest.webmanifest');

  const manifest = await p.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  await contexto.close();
});

test('si el navegador no permite guardar, se muestra el aviso de persistencia', async () => {
  const contexto = await nuevoContexto();
  await contexto.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('bloqueado', 'SecurityError');
      },
    });
  });
  const p = await abrir(contexto);
  await p.locator('#aviso-persistencia').waitFor({ state: 'visible' });
  assert.match(await p.locator('#aviso-persistencia').innerText(), /se perderán/);
  // La app sigue funcionando: el pin registra en memoria.
  await p.getByRole('button', { name: 'Registrar cuento' }).click();
  await p.locator('#capa-avisos .aviso-ok').waitFor();
  assert.deepEqual(p.errores, []);
  await contexto.close();
});

test('capturas visuales de cada pantalla (si CAPTURAS_DIR está definido)', async () => {
  if (!CAPTURAS) return;
  const contexto = await nuevoContexto();
  const p = await abrir(contexto);
  await sembrar(p, DATOS_BASE);
  await p.getByRole('button', { name: 'Registrar corazón' }).waitFor();
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(CAPTURAS, '1-registro.png') });
  await p.getByRole('button', { name: 'Registrar cuento' }).click();
  await p.locator('#capa-avisos .aviso-ok').waitFor();
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(CAPTURAS, '2-registro-confirmado.png') });
  await p.getByRole('link', { name: 'Dashboard' }).click();
  await p.locator('.total-numero').waitFor();
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(CAPTURAS, '3-dashboard.png'), fullPage: true });
  await p.getByRole('link', { name: 'Historial' }).click();
  await p.locator('.evento').first().waitFor();
  await p.getByRole('button', { name: /Corazón/ }).click();
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(CAPTURAS, '4-historial.png'), fullPage: true });
  await contexto.close();
});
