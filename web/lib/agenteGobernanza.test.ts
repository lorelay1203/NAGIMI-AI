import { describe, expect, it } from "vitest";
import {
  eventos8K, lecturaGobernanza, nombreBonito, resumenInsiders,
  type Filing, type TransaccionInsider,
} from "./agenteGobernanza";

const HOY = new Date("2026-09-29T15:00:00Z");

function tx(o: Partial<TransaccionInsider> = {}): TransaccionInsider {
  return { name: "TAN LIP BU", change: 105263, transactionCode: "P", transactionPrice: 95, transactionDate: "2026-08-11", ...o };
}

describe("resumenInsiders", () => {
  it("cuenta la compra del director de Intel (~$10 millones)", () => {
    const r = resumenInsiders([tx()], HOY);
    expect(r.compras.n).toBe(1);
    expect(r.compras.valor).toBeCloseTo(9_999_985, 0);
    expect(r.compras.mayor?.name).toBe("TAN LIP BU");
  });
  it("separa ventas y lo demás (premios, ejercicio, impuestos)", () => {
    const r = resumenInsiders([
      tx({ transactionCode: "S", change: -1000, transactionPrice: 100 }),
      tx({ transactionCode: "M", change: 5000 }), tx({ transactionCode: "F", change: -300 }), tx({ transactionCode: "A", change: 2000 }),
    ], HOY);
    expect(r.ventas).toEqual({ n: 1, valor: 100_000, personas: ["TAN LIP BU"] });
    expect(r.otras).toBe(3);
    expect(r.compras.n).toBe(0);
  });
  it("ignora lo viejo y los derivados", () => {
    const r = resumenInsiders([tx({ transactionDate: "2026-01-01" }), tx({ isDerivative: true })], HOY);
    expect(r.compras.n).toBe(0);
  });
  it("una persona que compra dos veces cuenta como una persona", () => {
    const r = resumenInsiders([tx(), tx({ change: 1000 })], HOY);
    expect(r.compras.personas).toEqual(["TAN LIP BU"]);
    expect(r.compras.n).toBe(2);
  });
});

function f(o: Partial<Filing> = {}): Filing {
  return { form: "8-K", filingDate: "2026-09-03", items: "8.01", url: "https://sec.gov/x", ...o };
}

describe("eventos8K", () => {
  it("traduce los items y marca los serios", () => {
    const e = eventos8K([f({ items: "4.02,9.01" }), f({ items: "5.02", filingDate: "2026-07-02" }), f({ items: "2.02,9.01", filingDate: "2026-08-26" })], HOY);
    expect(e.map((x) => x.gravedad)).toEqual(["roja", "info", "amarilla"]);
    expect(e[0].cosas[0].texto).toMatch(/ya no son confiables/);
  });
  it("solo 8-K y de los últimos 4 meses", () => {
    expect(eventos8K([f({ form: "10-Q" }), f({ filingDate: "2026-01-02" })], HOY)).toEqual([]);
  });
  it("un 8-K con solo anexos (9.01) no cuenta como evento", () => {
    expect(eventos8K([f({ items: "9.01" })], HOY)).toEqual([]);
  });
});

describe("nombreBonito", () => {
  it("pone mayúscula solo al principio de cada nombre", () => {
    expect(nombreBonito("TAN LIP BU")).toBe("Tan Lip Bu");
  });
});

describe("lecturaGobernanza", () => {
  it("compra grande de un directivo → 'Directivos comprando', a favor", () => {
    const l = lecturaGobernanza({ ticker: "INTC", insiders: resumenInsiders([tx()], HOY), eventos: [], demandas: null });
    expect(l.senal).toBe("Directivos comprando");
    expect(l.tono).toBe("up");
    expect(l.viendo).toBe("1 directivo compró $10.0 millones en acciones con su propio dinero (últimos 90 días).");
    expect(l.detalles[0]).toContain("Tan Lip Bu, 105,263 acciones a $95.00");
    expect(l.detalles).not.toContain(l.viendo);
  });

  it("un evento rojo manda por encima de todo", () => {
    const l = lecturaGobernanza({
      ticker: "X", insiders: resumenInsiders([tx()], HOY),
      eventos: eventos8K([f({ items: "4.02" })], HOY), demandas: null,
    });
    expect(l.senal).toBe("Alerta roja");
    expect(l.empuje).toMatch(/lee el aviso/);
    expect(l.fuentes.some((s) => s.url === "https://sec.gov/x")).toBe(true);
  });

  it("las ventas de directivos se explican como algo que pesa poco", () => {
    const l = lecturaGobernanza({
      ticker: "X", insiders: resumenInsiders([tx({ transactionCode: "S", change: -1000 })], HOY), eventos: [], demandas: null,
    });
    expect(l.detalles.join(" ")).toMatch(/planes automáticos/);
  });

  it("ventas grandes sin ninguna compra → 'Directivos vendiendo', explicado sin asustar", () => {
    const l = lecturaGobernanza({
      ticker: "NVDA", eventos: [], demandas: null,
      insiders: resumenInsiders([tx({ transactionCode: "S", change: -5_000_000, transactionPrice: 190 })], HOY),
    });
    expect(l.senal).toBe("Directivos vendiendo");
    expect(l.empuje).toMatch(/planificadas/);
  });

  it("dinero para demandas que sube mucho resta", () => {
    const l = lecturaGobernanza({
      ticker: "X", insiders: null, eventos: [],
      demandas: { apartadoAhora: 3e9, apartadoAntes: 1e9, fecha: "2026-07-26", avisos: [{ fecha: "2026-09-01", url: "https://sec.gov/d" }] },
    });
    expect(l.detalles.join(" ")).toContain("$3.0 mil millones apartados para demandas");
    expect(l.detalles.join(" ")).toContain("bastante más que hace un año");
    expect(l.tono).toBe("down");
  });

  it("sin nada raro lo dice", () => {
    const l = lecturaGobernanza({ ticker: "X", insiders: resumenInsiders([], HOY), eventos: [], demandas: null });
    expect(l.senal).toBe("Sin nada raro");
    expect(l.detalles.join(" ")).toMatch(/Ningún directivo/);
  });
});
