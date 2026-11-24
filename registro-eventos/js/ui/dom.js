// Helpers mínimos para crear el DOM sin frameworks.
// El texto de los datos SIEMPRE entra como textContent (evita inyección de HTML).
// La propiedad `html` solo debe usarse con iconos estáticos del propio código.

/**
 * h('button', { class: 'x', onclick: fn }, 'Texto', elementoHijo)
 */
export function h(etiqueta, propiedades = {}, ...hijos) {
  const el = document.createElement(etiqueta);

  for (const [clave, valor] of Object.entries(propiedades ?? {})) {
    if (valor === null || valor === undefined || valor === false) continue;

    if (clave === 'class') {
      el.className = valor;
    } else if (clave === 'style' && typeof valor === 'object') {
      // Las variables CSS (--c) solo se asignan con setProperty.
      for (const [prop, val] of Object.entries(valor)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    } else if (clave === 'dataset') {
      Object.assign(el.dataset, valor);
    } else if (clave === 'html') {
      el.innerHTML = valor;
    } else if (clave.startsWith('on') && typeof valor === 'function') {
      el.addEventListener(clave.slice(2).toLowerCase(), valor);
    } else {
      el.setAttribute(clave, valor === true ? '' : String(valor));
    }
  }

  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

export const $ = (selector, raiz = document) => raiz.querySelector(selector);
