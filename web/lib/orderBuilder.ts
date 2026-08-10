// Order Builder — arma y describe órdenes/estrategias (NO ejecuta nada, no llama a brokers).
// Funciones puras: símbolo OCC, costo/crédito, y las patas de cada estrategia.

export type Side = "buy" | "sell";

export interface OrderDraft {
  underlying: string;
  optionType: "call" | "put";
  strike: number;
  expiration: string; // YYYY-MM-DD
  side: Side;
  quantity: number;
  limitPrice: number; // por contrato
}

export type Strategy = "single" | "vertical" | "credit" | "butterfly" | "condor" | "iron_condor";

export const STRATEGIES: { id: Strategy; label: string; legs: number }[] = [
  { id: "single", label: "Single (una pata)", legs: 1 },
  { id: "vertical", label: "Vertical (débito)", legs: 2 },
  { id: "credit", label: "Venta de prima (crédito)", legs: 2 },
  { id: "butterfly", label: "Butterfly", legs: 3 },
  { id: "condor", label: "Condor", legs: 4 },
  { id: "iron_condor", label: "Iron Condor", legs: 4 },
];

/** Símbolo OCC formato Schwab/estándar: 6 root + AAMMDD + C/P + 8 dígitos de strike. */
export function occSymbol(underlying: string, expiration: string, type: "call" | "put", strike: number): string {
  const root = underlying.trim().toUpperCase().padEnd(6, " ");
  const [y = "", m = "", d = ""] = expiration.split("-");
  const cp = type === "call" ? "C" : "P";
  const k = String(Math.round(strike * 1000)).padStart(8, "0");
  return `${root}${y.slice(2)}${m.padStart(2, "0")}${d.padStart(2, "0")}${cp}${k}`;
}

/** Débito/crédito con signo de una pata: compra = +, venta = −. */
export function legNet(d: OrderDraft): number {
  return (d.side === "buy" ? 1 : -1) * d.limitPrice * 100 * d.quantity;
}

export function orderSentence(d: OrderDraft): string {
  const verbo = d.side === "buy" ? "COMPRAR" : "VENDER";
  const tipo = d.optionType === "call" ? "CALL" : "PUT";
  return `${verbo} ${d.quantity} ${tipo} $${d.strike} · vence ${d.expiration} · a $${d.limitPrice.toFixed(2)}`;
}

export interface GenLeg { side: Side; optionType: "call" | "put"; strike: number; quantity: number }

/** Genera las patas de una estrategia alrededor de `center` con ancho `width`. */
export function generateLegs(strategy: Strategy, optionType: "call" | "put", center: number, width: number): GenLeg[] {
  const t = optionType;
  const w = width > 0 ? width : 5;
  switch (strategy) {
    case "single":
      return [{ side: "buy", optionType: t, strike: center, quantity: 1 }];
    case "vertical": // débito, en la dirección de la opción
      return t === "call"
        ? [{ side: "buy", optionType: "call", strike: center, quantity: 1 }, { side: "sell", optionType: "call", strike: center + w, quantity: 1 }]
        : [{ side: "buy", optionType: "put", strike: center, quantity: 1 }, { side: "sell", optionType: "put", strike: center - w, quantity: 1 }];
    case "credit": // venta de prima: vende cerca del precio, compra protección más lejos
      return t === "call"
        ? [{ side: "sell", optionType: "call", strike: center, quantity: 1 }, { side: "buy", optionType: "call", strike: center + w, quantity: 1 }]
        : [{ side: "sell", optionType: "put", strike: center, quantity: 1 }, { side: "buy", optionType: "put", strike: center - w, quantity: 1 }];
    case "butterfly":
      return [
        { side: "buy", optionType: t, strike: center - w, quantity: 1 },
        { side: "sell", optionType: t, strike: center, quantity: 2 },
        { side: "buy", optionType: t, strike: center + w, quantity: 1 },
      ];
    case "condor":
      return [
        { side: "buy", optionType: t, strike: center - 2 * w, quantity: 1 },
        { side: "sell", optionType: t, strike: center - w, quantity: 1 },
        { side: "sell", optionType: t, strike: center + w, quantity: 1 },
        { side: "buy", optionType: t, strike: center + 2 * w, quantity: 1 },
      ];
    case "iron_condor":
      return [
        { side: "buy", optionType: "put", strike: center - 2 * w, quantity: 1 },
        { side: "sell", optionType: "put", strike: center - w, quantity: 1 },
        { side: "sell", optionType: "call", strike: center + w, quantity: 1 },
        { side: "buy", optionType: "call", strike: center + 2 * w, quantity: 1 },
      ];
  }
}
