import { describe, expect, it } from "vitest";
import { estimateNextEarnings, resolverEarnings } from "./earnings";
import { scoreCandidate, type ScoreInput } from "./wheel";

describe("estimateNextEarnings", () => {
  it("avanza de 91 en 91 días desde el último reporte hasta pasar hoy", () => {
    // Último reporte 2026-05-20 → +91 = 2026-08-19 (ya pasó) → +91 = 2026-11-18.
    const d = estimateNextEarnings(["2026-02-18", "2026-05-20"], new Date("2026-09-14T12:00:00Z"));
    expect(d).toBe("2026-11-18");
  });

  it("sin reportes pasados (ETF) no inventa", () => {
    expect(estimateNextEarnings([], new Date("2026-09-14T12:00:00Z"))).toBeNull();
  });
});

describe("resolverEarnings", () => {
  const real = (date: string, hour: string | null = "amc") => ({ real: { date, hour }, estimada: null });

  it("fecha real después del vencimiento → fuera", () => {
    expect(resolverEarnings(real("2026-11-17"), "2026-10-16"))
      .toEqual({ flag: "fuera", fecha: "2026-11-17", fuente: "real" });
  });

  it("fecha real antes del vencimiento → castigo completo (no es estimado)", () => {
    expect(resolverEarnings(real("2026-10-08"), "2026-10-16").flag).toBe("dentro_confirmado");
  });

  it("reporta el MISMO día que vence pero después del cierre → no le toca", () => {
    expect(resolverEarnings(real("2026-10-16", "amc"), "2026-10-16").flag).toBe("fuera");
  });

  it("reporta el mismo día que vence ANTES de abrir → sí le toca", () => {
    expect(resolverEarnings(real("2026-10-16", "bmo"), "2026-10-16").flag).toBe("dentro_confirmado");
  });

  it("el mismo reporte le cae a un vencimiento largo y no a uno corto", () => {
    const datos = real("2026-10-08");
    expect(resolverEarnings(datos, "2026-09-25").flag).toBe("fuera");
    expect(resolverEarnings(datos, "2026-10-30").flag).toBe("dentro_confirmado");
  });

  it("sin fecha real usa el estimado y lo dice", () => {
    const datos = { real: null, estimada: "2026-10-08" };
    expect(resolverEarnings(datos, "2026-10-16")).toEqual({ flag: "dentro", fecha: "2026-10-08", fuente: "estimada" });
    expect(resolverEarnings(datos, "2026-09-25").flag).toBe("fuera");
  });

  it("sin fecha real ni estimado → no aplica", () => {
    expect(resolverEarnings({ real: null, estimada: null }, "2026-10-16"))
      .toEqual({ flag: "no_aplica", fecha: null, fuente: null });
  });
});

describe("puntaje de earnings en el Wheel", () => {
  const base: ScoreInput = {
    annualizedPct: 30, ivRank: 50, strike: 95, spot: 100, cushionPct: 5,
    supports: [], openInterest: 1000, spreadPct: 2, earnings: "fuera",
  };

  it("con fecha real dentro: 0 puntos y dice la fecha en llano", () => {
    const s = scoreCandidate({ ...base, earnings: "dentro_confirmado", earningsFecha: "2026-11-17", earningsFuente: "real" });
    expect(s.earnings.points).toBe(0);
    expect(s.earnings.band).toBe("dentro, fecha real");
    expect(s.earnings.why).toContain("17 de noviembre");
    expect(s.earnings.why).toContain("ANTES de que vence");
  });

  it("con estimado dentro: castigo parcial y pide verificar", () => {
    const s = scoreCandidate({ ...base, earnings: "dentro", earningsFecha: "2026-10-08", earningsFuente: "estimada" });
    expect(s.earnings.points).toBe(3);
    expect(s.earnings.why).toContain("verifícala");
    expect(s.earnings.why).toContain("8 de octubre");
  });

  it("con fecha real fuera: puntaje completo y dice que no le toca", () => {
    const s = scoreCandidate({ ...base, earnings: "fuera", earningsFecha: "2026-11-17", earningsFuente: "real" });
    expect(s.earnings.points).toBe(10);
    expect(s.earnings.band).toBe("fuera, fecha real");
    expect(s.earnings.why).toContain("no te toca");
  });

  it("sin fecha (llamadas viejas) sigue funcionando", () => {
    const s = scoreCandidate(base);
    expect(s.earnings.points).toBe(10);
    expect(s.earnings.why).toBe("El reporte cae después del vencimiento.");
  });
});
