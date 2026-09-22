import { describe, expect, it } from "vitest";
import { rangoCanal } from "./rangoCanal";

describe("rangoCanal", () => {
  it("precio dentro del canal: el punto cae en su lugar y el imán también", () => {
    const r = rangoCanal(771, 770, 772, 771.5)!;
    expect(r.suelo).toBe(770);
    expect(r.techo).toBe(772);
    expect(r.precioPct).toBeCloseTo(50, 5);
    expect(r.imanPct).toBeCloseTo(75, 5);
    expect(r.fuera).toBeNull();
  });

  it("caso real SPY 21-sep: precio arriba del techo → punto en el borde y lo dice", () => {
    const r = rangoCanal(773.83, 770, 772, 780)!;
    expect(r.fuera).toBe("arriba");
    expect(r.precioPct).toBe(100);
    // El imán (780) cae fuera del canal: no se marca en la barra.
    expect(r.imanPct).toBeNull();
    expect(r.iman).toBe(780);
  });

  it("precio debajo del suelo → punto en 0 y 'abajo'", () => {
    const r = rangoCanal(95, 100, 110, null)!;
    expect(r.fuera).toBe("abajo");
    expect(r.precioPct).toBe(0);
  });

  it("si los muros vienen al revés, igual dibuja de menor a mayor", () => {
    const r = rangoCanal(105, 110, 100, null)!;
    expect(r.suelo).toBe(100);
    expect(r.techo).toBe(110);
    expect(r.precioPct).toBeCloseTo(50, 5);
  });

  it("sin un muro, o con los dos iguales, no hay canal que dibujar", () => {
    expect(rangoCanal(100, null, 110, null)).toBeNull();
    expect(rangoCanal(100, 100, null, null)).toBeNull();
    expect(rangoCanal(100, 105, 105, null)).toBeNull();
    expect(rangoCanal(0, 100, 110, null)).toBeNull();
  });
});
