// Genera un indicador de TradingView (Pine Script v5) con los niveles de Nagimi
// ya escritos adentro. TradingView NO puede llamar a nuestra API (Pine no tiene
// acceso a internet), así que el puente es este: la app escribe el script y la
// usuaria lo pega. Los niveles quedan como `input.float` para que pueda ajustarlos
// a mano en TradingView sin regenerar nada.

export interface PineGexInput {
  callWall: number | null;
  putWall: number | null;
  magnet: number | null;
  maxPain: number | null;
  gammaFlip: number | null;
  netGex: number | null;
  regime: "positive" | "negative" | null;
}

export interface PineLevel {
  price: number;
  strength: number;
  why: string;
}

export interface PineInput {
  ticker: string;
  spot: number | null;
  /** Fecha legible, la pasa el cliente (el server no debe inventar la hora local). */
  generatedAt: string;
  gex: PineGexInput;
  supports: PineLevel[];
  resistances: PineLevel[];
}

/** Pine usa comillas dobles; limpiamos lo que rompería el string. */
function safe(s: string): string {
  return s.replace(/["\\]/g, "").replace(/[\r\n]+/g, " ").trim();
}

function num(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Nombre de variable Pine válido a partir de un prefijo + índice. */
function id(prefix: string, i: number): string {
  return `${prefix}${i + 1}`;
}

const MAX_LEVELS = 6;

export function buildPineScript(input: PineInput): string {
  const t = input.ticker.trim().toUpperCase() || "TICKER";
  const g = input.gex;

  // ---- muros de GEX (los 5 fijos) ----
  const walls: { key: string; label: string; price: number | null; color: string; style: string; show: boolean }[] = [
    { key: "cw", label: "Call Wall (resistencia)", price: g.callWall, color: "#ef5350", style: "line.style_solid", show: true },
    { key: "pw", label: "Put Wall (soporte)", price: g.putWall, color: "#26a69a", style: "line.style_solid", show: true },
    { key: "mg", label: "Iman / Magnet", price: g.magnet, color: "#ffb300", style: "line.style_dashed", show: true },
    { key: "gf", label: "Gamma Flip", price: g.gammaFlip, color: "#ab47bc", style: "line.style_dashed", show: true },
    { key: "mp", label: "Max Pain", price: g.maxPain, color: "#78909c", style: "line.style_dotted", show: false },
  ];

  const wallInputs = walls
    .map((w) => {
      const p = w.price != null && w.price > 0 ? num(w.price) : "0.0";
      return [
        `show_${w.key} = input.bool(${w.show ? "true" : "false"}, "${w.label}", group = G_GEX)`,
        `px_${w.key}   = input.float(${p}, "    precio", group = G_GEX)`,
      ].join("\n");
    })
    .join("\n");

  const wallDraws = walls
    .map((w) => `    drawLevel(px_${w.key}, show_${w.key}, "${safe(w.label)}", color.new(#${w.color.slice(1)}, 0), ${w.style})`)
    .join("\n");

  // ---- soportes y resistencias del motor de niveles ----
  const sup = input.supports.filter((l) => l.price > 0).slice(0, MAX_LEVELS);
  const res = input.resistances.filter((l) => l.price > 0).slice(0, MAX_LEVELS);

  const levelInputs = (list: PineLevel[], prefix: string, group: string, defaultOn: number) =>
    list
      .map((l, i) => {
        const v = id(prefix, i);
        const on = i < defaultOn ? "true" : "false";
        return [
          `show_${v} = input.bool(${on}, "${prefix === "s" ? "Soporte" : "Resistencia"} ${i + 1} — fuerza ${l.strength}/100", group = ${group})`,
          `px_${v}   = input.float(${num(l.price)}, "    precio", group = ${group})`,
        ].join("\n");
      })
      .join("\n") || `// (sin ${prefix === "s" ? "soportes" : "resistencias"} detectados)`;

  const levelDraws = (list: PineLevel[], prefix: string, colorExpr: string) =>
    list
      .map((l, i) => {
        const v = id(prefix, i);
        const name = `${prefix === "s" ? "S" : "R"}${i + 1} (${l.strength}) ${safe(l.why).slice(0, 48)}`;
        return `    drawLevel(px_${v}, show_${v}, "${name}", ${colorExpr}, line.style_dotted)`;
      })
      .join("\n") || "    // sin niveles";

  // Régimen: usa el que venga; si falta, lo deduce del signo del Net GEX
  // (positivo = dealers estabilizan; negativo = amplifican).
  const regime: "positive" | "negative" | null =
    g.regime ?? (g.netGex != null ? (g.netGex >= 0 ? "positive" : "negative") : null);

  const regimeTxt =
    regime === "positive"
      ? "Gamma POSITIVA — los dealers frenan el movimiento (rangos, mean reversion)"
      : regime === "negative"
        ? "Gamma NEGATIVA — los dealers amplifican el movimiento (tendencia, mas volatil)"
        : "Regimen de gamma no disponible";

  const netGexTxt = g.netGex != null ? `${(g.netGex / 1e9).toFixed(2)}B` : "n/d";
  const spotTxt = input.spot != null && input.spot > 0 ? `$${num(input.spot)}` : "n/d";

  const noPriceLevels = sup.length === 0 && res.length === 0
    ? "//\n//  NOTA: no hubo historico de precio para calcular soportes/resistencias\n//  de pivotes. Se dibujan solo los muros de GEX (que no dependen del historico)."
    : "";

  return `//@version=5
// ==============================================================
//  NAGIMI AI  ·  Niveles GEX + Soportes / Resistencias
//  Ticker      : ${t}
//  Generado    : ${safe(input.generatedAt)}
//  Precio ref. : ${spotTxt}
//  Regimen     : ${safe(regimeTxt)}
//  Net GEX     : ${netGexTxt}
//
//  COMO USARLO
//   1. En TradingView abre el grafico de ${t}.
//   2. Abajo: pestana "Pine Editor" -> pega esto -> "Save" -> "Add to chart".
//   3. Los precios quedan editables en el engranaje del indicador.
//
//  ATENCION: estos niveles son una FOTO del momento de generarlos.
//  El GEX se mueve durante el dia. Vuelve a generarlo en Nagimi y
//  pega el script nuevo cuando quieras refrescarlo.
${noPriceLevels}
// ==============================================================
indicator("Nagimi GEX · ${t}", overlay = true, max_lines_count = 60, max_labels_count = 60)

G_GEX = "1 · Muros de GEX"
G_RES = "2 · Resistencias (motor de niveles)"
G_SUP = "3 · Soportes (motor de niveles)"
G_VIS = "4 · Apariencia"

// ---------- Muros de GEX ----------
${wallInputs}

// ---------- Resistencias ----------
${levelInputs(res, "r", "G_RES", 3)}

// ---------- Soportes ----------
${levelInputs(sup, "s", "G_SUP", 3)}

// ---------- Apariencia ----------
largo    = input.int(120, "Largo de la linea (velas)", minval = 10, maxval = 500, group = G_VIS)
adelanto = input.int(12, "Espacio a la derecha (velas)", minval = 0, maxval = 100, group = G_VIS)
verTexto = input.bool(true, "Mostrar etiquetas", group = G_VIS)
verTabla = input.bool(true, "Mostrar resumen arriba a la derecha", group = G_VIS)

// ---------- Dibujo ----------
var line[]  lineas    = array.new_line()
var label[] etiquetas = array.new_label()
var table   tb        = table.new(position.top_right, 2, 4, border_width = 1)

drawLevel(_px, _show, _txt, _col, _style) =>
    if _show and _px > 0
        ln = line.new(bar_index - largo, _px, bar_index + adelanto, _px, xloc = xloc.bar_index, color = _col, width = 2, style = _style)
        array.push(lineas, ln)
        if verTexto
            lb = label.new(bar_index + adelanto, _px, _txt + "  " + str.tostring(_px, format.mintick), xloc = xloc.bar_index, style = label.style_label_left, color = color.new(_col, 80), textcolor = _col, size = size.small)
            array.push(etiquetas, lb)

if barstate.islast
    // Limpiar el dibujo anterior para no acumular lineas en cada tick.
    while array.size(lineas) > 0
        line.delete(array.pop(lineas))
    while array.size(etiquetas) > 0
        label.delete(array.pop(etiquetas))

${wallDraws}

${levelDraws(res, "r", "color.new(#ef9a9a, 0)")}

${levelDraws(sup, "s", "color.new(#80cbc4, 0)")}

    if verTabla
        table.cell(tb, 0, 0, "NAGIMI · ${t}", text_color = color.white, bgcolor = color.new(color.blue, 30), text_size = size.small)
        table.cell(tb, 1, 0, "${safe(input.generatedAt)}", text_color = color.white, bgcolor = color.new(color.blue, 30), text_size = size.small)
        table.cell(tb, 0, 1, "Regimen", text_color = color.gray, text_size = size.small)
        table.cell(tb, 1, 1, "${regime === "positive" ? "Gamma +" : regime === "negative" ? "Gamma −" : "n/d"}", text_color = ${regime === "negative" ? "color.orange" : "color.teal"}, text_size = size.small)
        table.cell(tb, 0, 2, "Net GEX", text_color = color.gray, text_size = size.small)
        table.cell(tb, 1, 2, "${netGexTxt}", text_color = color.white, text_size = size.small)
        table.cell(tb, 0, 3, "Precio ref.", text_color = color.gray, text_size = size.small)
        table.cell(tb, 1, 3, "${spotTxt}", text_color = color.white, text_size = size.small)

// ---------- Alertas ----------
alertcondition(ta.crossover(close, px_cw),  "Rompe el Call Wall",  "${t}: el precio ROMPIO el Call Wall hacia arriba.")
alertcondition(ta.crossunder(close, px_pw), "Pierde el Put Wall",  "${t}: el precio PERDIO el Put Wall hacia abajo.")
alertcondition(ta.cross(close, px_gf),      "Cruza el Gamma Flip", "${t}: el precio cruzo el Gamma Flip — cambia el regimen de volatilidad.")
`;
}
