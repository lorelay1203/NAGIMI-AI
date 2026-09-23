import { describe, expect, it } from "vitest";
import { nivelesConfirmados, type CeldaNivel, type VencimientoDte } from "./nivelesConfirmados";

const VENCS: VencimientoDte[] = [
  { expiration: "2026-10-09", dte: 16 },
  { expiration: "2026-10-16", dte: 23 },
  { expiration: "2026-10-23", dte: 30 },
];

/** Celda corta: por defecto sin gamma, se pone la del lado que interesa. */
const celda = (o: Partial<CeldaNivel> & { strike: number; expiration: string }): CeldaNivel =>
  ({ callGex: 0, putGex: 0, ...o });

describe("nivelesConfirmados", () => {
  it("cuenta en cuántos vencimientos se repite el mismo muro", () => {
    // El techo de 230 sale en los tres; el suelo de 220 también.
    const celdas = VENCS.flatMap((v) => [
      celda({ strike: 230, expiration: v.expiration, callGex: 900 }),
      celda({ strike: 235, expiration: v.expiration, callGex: 400 }),
      celda({ strike: 220, expiration: v.expiration, putGex: 800 }),
    ]);
    const r = nivelesConfirmados({ celdas, vencimientos: VENCS, spot: 225 });

    expect(r.techos[0].strike).toBe(230);
    expect(r.techos[0].veces).toBe(3);
    expect(r.techos[0].etiqueta).toBe("16d/23d/30d");
    expect(r.suelos[0].strike).toBe(220);
    expect(r.suelos[0].veces).toBe(3);
    expect(r.vencimientosMirados).toBe(3);
  });

  it("pone primero el que se repite más veces, aunque el otro tenga más gamma", () => {
    const celdas = [
      // 230 es el muro en dos vencimientos, con gamma modesta.
      celda({ strike: 230, expiration: "2026-10-09", callGex: 300 }),
      celda({ strike: 230, expiration: "2026-10-16", callGex: 300 }),
      // 240 tiene muchísima gamma pero solo en el tercero.
      celda({ strike: 240, expiration: "2026-10-23", callGex: 5000 }),
    ];
    const r = nivelesConfirmados({ celdas, vencimientos: VENCS, spot: 225 });
    expect(r.techos[0].strike).toBe(230);
    expect(r.techos[0].veces).toBe(2);
    expect(r.techos[1].strike).toBe(240);
    expect(r.techos[1].veces).toBe(1);
  });

  it("lo dice en llano: tres vencimientos aguantan, uno se rompe primero", () => {
    // En cada vencimiento gana UN solo techo, así que para tener un nivel de
    // una sola vez hace falta un vencimiento donde ese otro strike sea el mayor.
    const cuatro = [...VENCS, { expiration: "2026-10-30", dte: 37 }];
    const celdas = [
      ...VENCS.map((v) => celda({ strike: 230, expiration: v.expiration, callGex: 900 })),
      celda({ strike: 245, expiration: "2026-10-30", callGex: 100 }),
    ];
    const r = nivelesConfirmados({ celdas, vencimientos: cuatro, spot: 225 });
    expect(r.techos[0].strike).toBe(230);
    expect(r.techos[0].lectura).toContain("3 vencimientos seguidos");
    expect(r.techos[1].strike).toBe(245);
    expect(r.techos[1].lectura).toContain("se rompe primero");
  });

  it("con IV calcula la probabilidad de tocarlo; sin IV la deja en null", () => {
    const celdas = VENCS.map((v) => celda({ strike: 230, expiration: v.expiration, callGex: 500 }));
    const conIv = nivelesConfirmados({ celdas, vencimientos: VENCS, spot: 225, iv: 0.45 });
    const sinIv = nivelesConfirmados({ celdas, vencimientos: VENCS, spot: 225 });
    expect(conIv.techos[0].probTocar).toBeGreaterThan(0);
    expect(conIv.techos[0].probTocar).toBeLessThanOrEqual(1);
    expect(sinIv.techos[0].probTocar).toBeNull();
  });

  it("un strike puede ser techo y suelo a la vez sin mezclarse", () => {
    const celdas = [
      celda({ strike: 230, expiration: "2026-10-09", callGex: 700 }),
      celda({ strike: 230, expiration: "2026-10-09", putGex: 600 }),
    ];
    const r = nivelesConfirmados({ celdas, vencimientos: VENCS, spot: 225 });
    expect(r.techos[0].strike).toBe(230);
    expect(r.suelos[0].strike).toBe(230);
    expect(r.techos[0].lado).toBe("techo");
    expect(r.suelos[0].lado).toBe("suelo");
  });

  it("solo mira los vencimientos más cercanos (los lejanos no son la sesión)", () => {
    const largos: VencimientoDte[] = [
      ...VENCS,
      { expiration: "2027-01-15", dte: 114 },
      { expiration: "2027-06-18", dte: 268 },
    ];
    const celdas = largos.map((v) => celda({ strike: 230, expiration: v.expiration, callGex: 500 }));
    const r = nivelesConfirmados({ celdas, vencimientos: largos, spot: 225, max: 3 });
    expect(r.vencimientosMirados).toBe(3);
    expect(r.techos[0].veces).toBe(3);
    expect(r.techos[0].dtes).toEqual([16, 23, 30]);
  });

  it("los DTE salen ordenados de menor a mayor aunque lleguen al revés", () => {
    const alReves = [...VENCS].reverse();
    const celdas = alReves.map((v) => celda({ strike: 220, expiration: v.expiration, putGex: 400 }));
    const r = nivelesConfirmados({ celdas, vencimientos: alReves, spot: 225 });
    expect(r.suelos[0].etiqueta).toBe("16d/23d/30d");
  });

  it("la distancia al precio va firmada: el techo arriba, el suelo abajo", () => {
    const celdas = [
      celda({ strike: 230, expiration: "2026-10-09", callGex: 500 }),
      celda({ strike: 220, expiration: "2026-10-09", putGex: 500 }),
    ];
    const r = nivelesConfirmados({ celdas, vencimientos: VENCS, spot: 225 });
    expect(r.techos[0].distanciaPct).toBeCloseTo(2.22, 1);
    expect(r.suelos[0].distanciaPct).toBeCloseTo(-2.22, 1);
  });

  it("sin datos no inventa nada", () => {
    expect(nivelesConfirmados({ celdas: [], vencimientos: VENCS, spot: 225 })).toEqual({
      techos: [], suelos: [], vencimientosMirados: 0,
    });
    const celdas = [celda({ strike: 230, expiration: "2026-10-09", callGex: 500 })];
    expect(nivelesConfirmados({ celdas, vencimientos: [], spot: 225 }).techos).toEqual([]);
    expect(nivelesConfirmados({ celdas, vencimientos: VENCS, spot: 0 }).techos).toEqual([]);
  });

  it("un vencimiento sin gamma de un lado no inventa muro de ese lado", () => {
    // Solo hay calls: no debe salir ningún suelo.
    const celdas = VENCS.map((v) => celda({ strike: 230, expiration: v.expiration, callGex: 500 }));
    const r = nivelesConfirmados({ celdas, vencimientos: VENCS, spot: 225 });
    expect(r.techos).toHaveLength(1);
    expect(r.suelos).toHaveLength(0);
  });
});
