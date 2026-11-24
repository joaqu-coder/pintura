// Captura de contexto al registrar un evento: ubicación del dispositivo y
// temperatura ambiente actual.
//
// Reglas:
//  - La ubicación se pide SOLO al tocar un pin (no al abrir la app).
//  - Nunca lanza errores: si algo falla devuelve temperatura null y un motivo.
//  - No inventa valores: la temperatura viene exclusivamente de la API.
//  - Servicio: Open-Meteo (gratuito, sin API key).

export const ENDPOINT_CLIMA = 'https://api.open-meteo.com/v1/forecast';
// En PC (Windows/Wi-Fi) y en el primer uso la ubicación puede tardar bastante.
export const TIMEOUT_UBICACION_MS = 20000;
export const TIMEOUT_CLIMA_MS = 6000;

/** Textos para mostrar al usuario según el motivo por el que no hay temperatura. */
export const MOTIVOS_TEXTO = Object.freeze({
  sin_permiso: 'Sin permiso de ubicación',
  sin_ubicacion: 'Ubicación no disponible',
  timeout_ubicacion: 'La ubicación tardó demasiado',
  sin_soporte_ubicacion: 'El dispositivo no tiene ubicación',
  sin_conexion: 'Sin conexión para consultar el clima',
  timeout_clima: 'El servicio de clima no respondió',
  error_servicio: 'El servicio de clima devolvió un error',
  respuesta_invalida: 'Respuesta de clima inválida',
});

// Redondeo simétrico (también para negativos: -2.5 -> -3, no -2).
const redondear = (valor, decimales) => {
  const factor = 10 ** decimales;
  return Math.sign(valor) * (Math.round(Math.abs(valor) * factor) / factor);
};

function obtenerPosicion(geolocalizacion, timeoutMs) {
  return new Promise((resolver) => {
    if (!geolocalizacion) {
      resolver({ ok: false, motivo: 'sin_soporte_ubicacion' });
      return;
    }

    const respaldo = setTimeout(() => resolver({ ok: false, motivo: 'timeout_ubicacion' }), timeoutMs + 1000);

    geolocalizacion.getCurrentPosition(
      (posicion) => {
        clearTimeout(respaldo);
        resolver({ ok: true, posicion });
      },
      (error) => {
        clearTimeout(respaldo);
        // Código 1 = permiso denegado; 2 = no disponible; 3 = tiempo agotado.
        if (error?.code === 1) resolver({ ok: false, motivo: 'sin_permiso' });
        else if (error?.code === 3) resolver({ ok: false, motivo: 'timeout_ubicacion' });
        else resolver({ ok: false, motivo: 'sin_ubicacion' });
      },
      // Se acepta una ubicación de hasta 5 min de antigüedad para no consultar de más.
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60 * 1000 },
    );
  });
}

async function obtenerTemperatura({ lat, lon, fetchFn, endpoint, timeoutMs }) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const url = `${endpoint}?latitude=${lat}&longitude=${lon}&current=temperature_2m`;
    const respuesta = await fetchFn(url, { signal: controlador.signal, cache: 'no-store' });
    if (!respuesta.ok) return { ok: false, motivo: 'error_servicio' };

    const datos = await respuesta.json();
    const temperatura = datos?.current?.temperature_2m;
    if (typeof temperatura !== 'number' || !Number.isFinite(temperatura)) {
      return { ok: false, motivo: 'respuesta_invalida' };
    }
    return { ok: true, temperatura: redondear(temperatura, 1) };
  } catch (error) {
    return { ok: false, motivo: error?.name === 'AbortError' ? 'timeout_clima' : 'sin_conexion' };
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * @returns {Promise<{ temperatura: number|null, ubicacion: {lat:number, lon:number}|null, motivo: string|null }>}
 */
export async function obtenerContextoClima({
  geolocalizacion = globalThis.navigator?.geolocation,
  fetchFn = (...args) => globalThis.fetch(...args),
  endpoint = ENDPOINT_CLIMA,
  timeoutUbicacionMs = TIMEOUT_UBICACION_MS,
  timeoutClimaMs = TIMEOUT_CLIMA_MS,
} = {}) {
  const posicion = await obtenerPosicion(geolocalizacion, timeoutUbicacionMs);
  if (!posicion.ok) {
    return { temperatura: null, ubicacion: null, motivo: posicion.motivo };
  }

  const ubicacion = {
    lat: redondear(posicion.posicion.coords.latitude, 4),
    lon: redondear(posicion.posicion.coords.longitude, 4),
  };

  if (globalThis.navigator?.onLine === false) {
    return { temperatura: null, ubicacion, motivo: 'sin_conexion' };
  }

  const clima = await obtenerTemperatura({
    ...ubicacion,
    fetchFn,
    endpoint,
    timeoutMs: timeoutClimaMs,
  });

  if (!clima.ok) {
    return { temperatura: null, ubicacion, motivo: clima.motivo };
  }
  return { temperatura: clima.temperatura, ubicacion, motivo: null };
}
