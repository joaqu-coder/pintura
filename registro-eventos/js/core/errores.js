// Errores propios de la aplicación. Permiten distinguir en la UI
// un dato inválido de un problema de almacenamiento.

export class ErrorValidacion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorValidacion';
  }
}

export class ErrorAlmacenamiento extends Error {
  constructor(mensaje, opciones) {
    super(mensaje, opciones);
    this.name = 'ErrorAlmacenamiento';
  }
}
