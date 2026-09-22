import { describe, expect, it } from "vitest";
import { contarPorFiltro, estadoDe, pasaFiltro, type FilaMedible } from "./reportesEstado";

const fila = (o: Partial<FilaMedible>): FilaMedible =>
  ({ aciertoDireccion: null, vencidas: 0, sinDatos: false, ...o });

describe("estadoDe", () => {
  it("60% o más: acertando", () => {
    expect(estadoDe(fila({ aciertoDireccion: 60, vencidas: 5 })).clave).toBe("acertando");
    expect(estadoDe(fila({ aciertoDireccion: 88, vencidas: 8 })).txt).toBe("acertando");
  });

  it("entre 40 y 60: a medias, y lo dice como es (casi una moneda al aire)", () => {
    const e = estadoDe(fila({ aciertoDireccion: 42.9, vencidas: 7 }));
    expect(e.clave).toBe("medias");
    expect(e.porQue).toContain("moneda");
  });

  it("menos de 40: fallando", () => {
    expect(estadoDe(fila({ aciertoDireccion: 20, vencidas: 5 })).clave).toBe("fallando");
  });

  it("dice el plural bien: 1 predicción, no '1 predicciones'", () => {
    expect(estadoDe(fila({ aciertoDireccion: 100, vencidas: 1 })).porQue).toContain("1 predicción ya");
    expect(estadoDe(fila({ aciertoDireccion: 0, vencidas: 1 })).porQue).toContain("1 predicción vencida");
    expect(estadoDe(fila({ aciertoDireccion: 25, vencidas: 12 })).porQue).toContain("12 predicciones");
  });

  it("sin predicciones vencidas: madurando, no fallando", () => {
    expect(estadoDe(fila({ vencidas: 0 })).clave).toBe("madurando");
  });

  it("si no se pudieron bajar los precios NO cuenta como fallo", () => {
    // Manda sobre cualquier otra cosa: un 0% con sinDatos sería una mentira.
    const e = estadoDe(fila({ aciertoDireccion: 0, vencidas: 4, sinDatos: true }));
    expect(e.clave).toBe("sinDatos");
    expect(e.txt).toBe("sin medir");
  });
});

describe("pasaFiltro", () => {
  const buena = fila({ aciertoDireccion: 70, vencidas: 10 });
  const mala = fila({ aciertoDireccion: 10, vencidas: 10 });
  const nueva = fila({ vencidas: 0 });
  const rota = fila({ sinDatos: true, vencidas: 3, aciertoDireccion: 50 });

  it("todos deja pasar todo", () => {
    for (const f of [buena, mala, nueva, rota]) expect(pasaFiltro(f, "todos")).toBe(true);
  });

  it("cada filtro solo deja lo suyo", () => {
    expect(pasaFiltro(buena, "acertando")).toBe(true);
    expect(pasaFiltro(mala, "acertando")).toBe(false);
    expect(pasaFiltro(mala, "fallando")).toBe(true);
  });

  it("'sin medir' junta lo que madura y lo que no se pudo leer", () => {
    expect(pasaFiltro(nueva, "pendientes")).toBe(true);
    expect(pasaFiltro(rota, "pendientes")).toBe(true);
    expect(pasaFiltro(buena, "pendientes")).toBe(false);
  });
});

describe("contarPorFiltro", () => {
  it("cuenta cada grupo y el total", () => {
    const c = contarPorFiltro([
      fila({ aciertoDireccion: 70, vencidas: 4 }),
      fila({ aciertoDireccion: 50, vencidas: 4 }),
      fila({ aciertoDireccion: 10, vencidas: 4 }),
      fila({ vencidas: 0 }),
      fila({ sinDatos: true }),
    ]);
    expect(c).toEqual({ todos: 5, acertando: 1, medias: 1, fallando: 1, pendientes: 2 });
  });
});
