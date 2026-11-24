// Identificador único de registro (UUID v4).
// Usa crypto.randomUUID cuando existe (contextos seguros) y cae a
// getRandomValues en el resto, para que funcione también en http local.

export function generarId() {
  const cripto = globalThis.crypto;
  if (cripto?.randomUUID) return cripto.randomUUID();

  const bytes = new Uint8Array(16);
  cripto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
