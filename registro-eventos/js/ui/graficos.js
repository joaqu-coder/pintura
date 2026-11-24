// Gráficos simples en SVG, sin librerías externas.

const NS = 'http://www.w3.org/2000/svg';

function el(nombre, atributos = {}) {
  const nodo = document.createElementNS(NS, nombre);
  for (const [k, v] of Object.entries(atributos)) nodo.setAttribute(k, String(v));
  return nodo;
}

/**
 * Gráfico de dona con texto central.
 * @param {{segmentos: Array<{valor:number, color:string, etiqueta:string}>, centro:string, subtitulo?:string, tamano?:number, grosor?:number}} opciones
 */
export function donut({ segmentos, centro, subtitulo = '', tamano = 168, grosor = 20 }) {
  const radio = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const total = segmentos.reduce((suma, s) => suma + s.valor, 0);

  const svg = el('svg', {
    viewBox: `0 0 ${tamano} ${tamano}`,
    width: tamano,
    height: tamano,
    role: 'img',
    'aria-label': `Distribución: ${segmentos.map((s) => `${s.etiqueta} ${s.valor}`).join(', ')}`,
  });

  svg.append(
    el('circle', {
      cx: tamano / 2,
      cy: tamano / 2,
      r: radio,
      fill: 'none',
      stroke: 'var(--track)',
      'stroke-width': grosor,
    }),
  );

  if (total > 0) {
    let acumulado = 0;
    for (const seg of segmentos) {
      if (seg.valor <= 0) continue;
      const largo = (seg.valor / total) * circunferencia;
      svg.append(
        el('circle', {
          cx: tamano / 2,
          cy: tamano / 2,
          r: radio,
          fill: 'none',
          stroke: seg.color,
          'stroke-width': grosor,
          'stroke-dasharray': `${largo} ${circunferencia - largo}`,
          'stroke-dashoffset': -acumulado,
          transform: `rotate(-90 ${tamano / 2} ${tamano / 2})`,
        }),
      );
      acumulado += largo;
    }
  }

  const textoCentro = el('text', {
    x: tamano / 2,
    y: subtitulo ? tamano / 2 - 2 : tamano / 2,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    class: 'donut-centro',
  });
  textoCentro.textContent = centro;
  svg.append(textoCentro);

  if (subtitulo) {
    const texto2 = el('text', {
      x: tamano / 2,
      y: tamano / 2 + 18,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      class: 'donut-subtitulo',
    });
    texto2.textContent = subtitulo;
    svg.append(texto2);
  }

  return svg;
}
