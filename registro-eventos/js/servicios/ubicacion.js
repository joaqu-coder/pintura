// Captura opcional de la ubicación del dispositivo al tocar un pin.
//
// Reglas:
//  - La ubicación se pide SOLO al tocar un pin (no al abrir la app).
//  - Nunca lanza errores: si algo falla devuelve ubicación null y un motivo.
//  - Si no hay ubicación, el registro se guarda igual.

export const TIMEOUT_UBICACION_MS = 20000;

/** Textos para mostrar al usuario según el motivo por el que no hay ubicación. */
export const MOTIVOS_TEXTO = Object.freeze({
  sin_permiso: 'Sin permiso de ubicación',
  sin_ubicacion: 'Ubicación no disponible',
  timeout_ubicacion: 'La ubicación tardó demasiado',
  sin_soporte_ubicacion: 'El dispositivo no tiene ubicación',
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

/**
 * @returns {Promise<{ ubicacion: {lat:number, lon:number}|null, motivo: string|null }>}
 */
export async function obtenerContextoUbicacion({
  geolocalizacion = globalThis.navigator?.geolocation,
  timeoutUbicacionMs = TIMEOUT_UBICACION_MS,
} = {}) {
  const posicion = await obtenerPosicion(geolocalizacion, timeoutUbicacionMs);
  if (!posicion.ok) {
    return { ubicacion: null, motivo: posicion.motivo };
  }
  return {
    ubicacion: {
      lat: redondear(posicion.posicion.coords.latitude, 4),
      lon: redondear(posicion.posicion.coords.longitude, 4),
    },
    motivo: null,
  };
}
