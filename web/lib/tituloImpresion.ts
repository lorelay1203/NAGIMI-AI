// ============================================================================
// Títulos para guardar el análisis en PDF.
//
// El navegador propone el nombre del archivo a partir de `document.title`. Si
// no se toca, TODOS los análisis se guardan como "Nagimi AI.pdf" y en la
// carpeta de Descargas no se distingue uno de otro. Por eso se arma un título
// con el ticker y la fecha antes de imprimir.
//
// Van dos formatos distintos a propósito:
//   · el del ARCHIVO, con la fecha al revés (2026-09-23) para que los PDF se
//     ordenen solos por fecha en la carpeta, y sin acentos ni signos raros
//     porque algunos navegadores los cambian por guiones bajos al guardar;
//   · el de la CABECERA impresa, en español normal, porque eso lo lee ella.
//
// Puro y testable: recibe la fecha, no la busca. Así la prueba no depende del
// día en que se corra.
// ============================================================================

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Fecha en español llano: "23 de septiembre de 2026". */
export function fechaLarga(fecha: Date): string {
  return `${fecha.getDate()} de ${MESES[fecha.getMonth()]} de ${fecha.getFullYear()}`;
}

/** Fecha al revés para nombre de archivo: "2026-09-23" (se ordena sola). */
export function fechaArchivo(fecha: Date): string {
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mm}-${dd}`;
}

/** Fecha válida o no. Una fecha rota no se maquilla: se dice "sin fecha". */
function fechaOk(fecha: unknown): fecha is Date {
  return fecha instanceof Date && !Number.isNaN(fecha.getTime());
}

/** Ticker limpio en mayúsculas, o null si no hay ninguno. Nunca se inventa. */
function limpiaTicker(ticker: string | null | undefined): string | null {
  if (typeof ticker !== "string") return null;
  const t = ticker.trim().toUpperCase();
  return t.length > 0 ? t : null;
}

/**
 * Nombre que el navegador le propone al PDF.
 * Sin ticker queda "Nagimi AI - Analisis - 2026-09-23": no se rellena con un
 * ticker falso solo para que se vea bonito.
 */
export function tituloImpresion(ticker: string | null | undefined, fecha: Date): string {
  const t = limpiaTicker(ticker);
  const f = fechaOk(fecha) ? fechaArchivo(fecha) : "sin fecha";
  return `Nagimi AI - ${t ?? "Analisis"} - ${f}`;
}

/**
 * Línea que sale arriba en el papel. El PDF viaja solo (se manda por correo, se
 * guarda meses): sin ticker y fecha impresos no hay forma de saber de qué es.
 */
export function encabezadoImpresion(ticker: string | null | undefined, fecha: Date): string {
  const t = limpiaTicker(ticker);
  const f = fechaOk(fecha) ? fechaLarga(fecha) : "sin fecha";
  return t ? `Nagimi AI · ${t} · ${f}` : `Nagimi AI · ${f}`;
}
