// Diálogo de confirmación accesible (hoja inferior). Devuelve una Promise<boolean>.

import { h } from './dom.js';

export function confirmar({ titulo, mensaje, textoAceptar = 'Confirmar', textoCancelar = 'Cancelar', peligroso = false }) {
  return new Promise((resolver) => {
    const capa = document.getElementById('capa-dialogo');
    const enFoco = document.activeElement;
    let cerrado = false;

    const terminar = (valor) => {
      if (cerrado) return;
      cerrado = true;
      document.removeEventListener('keydown', alTeclear);
      capa.replaceChildren();
      enFoco?.focus?.();
      resolver(valor);
    };

    const alTeclear = (evento) => {
      if (evento.key === 'Escape') terminar(false);
    };

    const botonCancelar = h('button', { type: 'button', class: 'btn btn-secundario', onclick: () => terminar(false) }, textoCancelar);
    const botonAceptar = h(
      'button',
      { type: 'button', class: `btn ${peligroso ? 'btn-peligro' : 'btn-primario'}`, onclick: () => terminar(true) },
      textoAceptar,
    );

    const dialogo = h(
      'div',
      { class: 'dialogo-fondo', onclick: (e) => e.target === e.currentTarget && terminar(false) },
      h(
        'div',
        { class: 'dialogo', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dialogo-titulo', 'aria-describedby': 'dialogo-mensaje' },
        h('h2', { id: 'dialogo-titulo', class: 'dialogo-titulo' }, titulo),
        h('p', { id: 'dialogo-mensaje', class: 'dialogo-mensaje' }, mensaje),
        h('div', { class: 'dialogo-acciones' }, botonCancelar, botonAceptar),
      ),
    );

    capa.replaceChildren(dialogo);
    document.addEventListener('keydown', alTeclear);
    botonCancelar.focus();
  });
}
