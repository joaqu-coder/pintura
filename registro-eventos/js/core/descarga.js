// Descarga de un archivo de texto desde el navegador (CSV, etc.).
// Se antepone BOM UTF-8 para que Excel reconozca tildes y ñ.

export function descargarTexto(nombreArchivo, contenido, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿', contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.style.display = 'none';
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  // Dar tiempo al navegador a iniciar la descarga antes de liberar la URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
