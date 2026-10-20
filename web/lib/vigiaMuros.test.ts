import { describe, expect, it } from "vitest";
import { armarAviso, cambiosMuros, enHorarioMercado, temaAleatorio, type FotoMuros } from "./vigiaMuros";

const base: FotoMuros = {
  ticker: "SPY", fecha: "2026-10-20", spot: 770, callWall: 772, putWall: 765, magnet: 772,
  gammaFlip: 768, regime: "positive", linea: "NAGIMI v1|t=SPY|d=2026-10-20",
};

describe("vigía de muros", () => {
  it("la primera foto del día siempre avisa", () => {
    expect(cambiosMuros(null, base)).toEqual(["primera foto del día"]);
    expect(cambiosMuros({ ...base, fecha: "2026-10-19" }, base)).toEqual(["primera foto del día"]);
  });

  it("si nada se movió, no molesta", () => {
    expect(cambiosMuros(base, { ...base, callWall: 772.1, gammaFlip: 768.5 })).toEqual([]);
  });

  it("avisa cuando se mueve un muro, el imán o el tipo de día", () => {
    const c = cambiosMuros(base, { ...base, putWall: 762, magnet: 775, regime: "negative" });
    expect(c).toContain("Put wall: 765 → 762");
    expect(c).toContain("Imán: 772 → 775");
    expect(c.some((x) => x.includes("EMPUJÓN"))).toBe(true);
  });

  it("el flip solo cuenta si se mueve más de 0.2%", () => {
    expect(cambiosMuros(base, { ...base, gammaFlip: 769 })).toEqual([]);
    expect(cambiosMuros(base, { ...base, gammaFlip: 771 })).toEqual(["Flip: 768 → 771"]);
  });

  it("horario: lunes a viernes de 9:30 a 4:00 de Nueva York", () => {
    expect(enHorarioMercado(new Date("2026-10-20T15:00:00Z"))).toBe(true);   // martes 11 AM
    expect(enHorarioMercado(new Date("2026-10-20T13:00:00Z"))).toBe(false);  // 9 AM
    expect(enHorarioMercado(new Date("2026-10-20T20:30:00Z"))).toBe(false);  // 4:30 PM
    expect(enHorarioMercado(new Date("2026-10-24T15:00:00Z"))).toBe(false);  // sábado
  });

  it("el aviso lleva la línea para copiarla", () => {
    const a = armarAviso(base, ["Put wall: 765 → 762"]);
    expect(a.titulo).toBe("Cambiaron los muros de SPY");
    expect(a.mensaje).toContain("Put wall: 765 → 762");
    expect(a.mensaje.endsWith(base.linea)).toBe(true);
    expect(armarAviso(base, ["primera foto del día"]).titulo).toBe("Muros de hoy · SPY");
  });

  it("tema difícil de adivinar", () => {
    const t = temaAleatorio();
    expect(t).toMatch(/^nagimi-[a-z2-9]{18}$/);
    expect(temaAleatorio()).not.toBe(t);
  });
});
