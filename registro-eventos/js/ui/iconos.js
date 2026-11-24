// Iconos SVG estáticos (trazo, heredan el color del texto con currentColor).

const base = (contenido) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${contenido}</svg>`;

export const ICONOS = Object.freeze({
  registro: base('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  dashboard: base('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  historial: base('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
  check: base('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  alerta: base('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>'),
  info: base('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>'),
  papelera: base('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>'),
  descargar: base('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>'),
  cerrar: base('<path d="M6 6l12 12M18 6L6 18"/>'),
  calendario: base('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  termometro: base('<path d="M14 14.5V5a2 2 0 10-4 0v9.5a4 4 0 104 0z"/>'),
});
