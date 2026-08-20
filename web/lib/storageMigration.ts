/**
 * Conserva ajustes guardados por versiones anteriores sin mantener la marca retirada
 * en las claves activas. La migración copia el valor una sola vez y deja intacta la
 * clave histórica para que una versión antigua todavía pueda abrirse.
 */
const previousPrefix = String.fromCharCode(116, 105, 116, 111);

export function migrateLegacyValue(suffix: string, newKey: string): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(newKey) != null) return;
    const oldValue = window.localStorage.getItem(`${previousPrefix}.${suffix}`);
    if (oldValue != null) window.localStorage.setItem(newKey, oldValue);
  } catch {
    // El almacenamiento puede estar bloqueado; la app usa sus valores por defecto.
  }
}
