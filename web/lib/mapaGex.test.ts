import { describe, expect, it } from "vitest";
import { mapaGex, metaTexto, murosEnDireccion, nivelClave, textoAmbiente, type BarraGex, type MapaInput } from "./mapaGex";

// El ejemplo de la comunidad: QQQ en 710.08, nivel clave 712, techos 713–714,
// 715–716 y 720–722; max pain 708; suelos 706–705 y 700. Día de rango.
function barras(): BarraGex[] {
  const b: BarraGex[] = [];
  for (let k = 695; k <= 725; k++) b.push({ strike: k, callGex: 1, putGex: 1 });
  const set = (k: number, c: number, p: number) => {
    const x = b.find((y) => y.strike === k)!;
    x.callGex = c; x.putGex = p;
  };
  set(712, 90, 80);                       // la concentración más grande, al lado del precio
  set(713, 60, 5); set(714, 55, 5);
  set(715, 40, 5); set(716, 45, 5);
  set(720, 35, 3); set(721, 30, 3); set(722, 38, 3);
  set(706, 5, 60); set(705, 5, 70);
  set(700, 5, 50);
  return b;
}

const QQQ: MapaInput = {
  ticker: "QQQ", spot: 710.08, regime: "positive",
  callWall: 713, putWall: 705, magnet: 712, gammaFlip: 704, maxPain: 708,
  bars: barras(), flujoAlcista: 0.5,
  macro: { bonos5d: 1.2, dolar5d: 0.1, vix: 15.5, vix5d: -6 },
};

describe("nivelClave", () => {
  it("es el precio con más dinero apilado cerca del precio actual", () => {
    expect(nivelClave(QQQ)).toBe(712);
  });
  it("sin perfil por precio, usa el muro más cercano", () => {
    expect(nivelClave({ ...QQQ, bars: [] })).toBe(712);
    expect(nivelClave({ ...QQQ, bars: [], magnet: null })).toBe(713);
  });
});

describe("murosEnDireccion", () => {
  it("junta los muros pegados en rangos, del más cercano al más lejano", () => {
    const t = murosEnDireccion(QQQ.bars, 712, "arriba").map(metaTexto);
    // 713, 714, 715 y 716 están seguidos: es una sola zona de techo.
    expect(t).toEqual(["$713–$716", "$720–$722"]);
  });
  it("hacia abajo va de arriba hacia abajo", () => {
    const s = murosEnDireccion(QQQ.bars, 710.08, "abajo").map(metaTexto);
    expect(s).toEqual(["$705–$706", "$700"]);
  });
  it("sin barras no inventa muros", () => {
    expect(murosEnDireccion([], 700, "arriba")).toEqual([]);
  });
});

describe("mapaGex con el ejemplo de QQQ", () => {
  const m = mapaGex(QQQ);
  const [alc, baj, rango] = m.escenarios;

  it("el nivel clave es $712", () => {
    expect(m.nivelClave).toBe(712);
    expect(m.lectura).toContain("$712");
    expect(m.lectura).toContain("día de rango");
  });

  it("escenario alcista: romper $712 y buscar los techos", () => {
    expect(alc.condicion).toContain("rompa y se sostenga arriba de $712");
    expect(alc.metas.map(metaTexto)).toEqual(["$713–$716", "$720–$722"]);
  });

  it("escenario bajista: rechazo en $712 → max pain $708 → $706–$705 → $700", () => {
    expect(baj.condicion).toContain("rechace");
    expect(baj.metas.map(metaTexto)).toEqual([
      "$708 (el precio que menos le duele a Wall Street)", "$705–$706", "$700",
    ]);
  });

  it("escenario de rango entre $708 y $712, muy posible con dinero repartido", () => {
    expect(rango.metas.map(metaTexto)).toEqual(["$708–$712"]);
    expect(rango.texto).toMatch(/muy posible/);
  });

  it("el ambiente se lee en palabras simples", () => {
    expect(m.ambiente).toMatch(/tasas de interés están bajando/);
    expect(m.ambiente).toMatch(/VIX\) está bajo, en 15.5 y bajando/);
    expect(m.ambiente).toMatch(/no confirma una subida/);
  });

  it("trae las dos reglas de confirmación y la regla de no perseguir", () => {
    expect(m.confirmaciones[0]).toMatch(/^Arriba de \$712 \+ dinero comprando/);
    expect(m.confirmaciones[1]).toMatch(/^Rechazo en \$712 \+ dinero vendiendo/);
    expect(m.regla).toMatch(/No perseguir/);
  });

  it("no usa siglas de la jerga", () => {
    const todo = [m.lectura, ...m.escenarios.map((e) => e.texto), m.ambiente, ...m.confirmaciones, m.regla].join(" ");
    for (const s of ["GEX", "CVD", "dealers", "Long Gamma", "Call Wall", "Max Pain", "pinning"]) {
      expect(todo).not.toContain(s);
    }
  });
});

describe("mapaGex en otros casos", () => {
  it("precio encima del nivel clave: bajista = perderlo", () => {
    const m = mapaGex({ ...QQQ, spot: 712.6 });
    expect(m.escenarios[1].condicion).toContain("pierda $712");
    expect(m.confirmaciones[1]).toMatch(/^Pierde \$712/);
  });

  it("día de empujón: el rango es menos probable", () => {
    const m = mapaGex({ ...QQQ, regime: "negative" });
    expect(m.escenarios[2].texto).toMatch(/menos probable/);
    expect(m.lectura).toContain("día de empujón");
  });

  it("sin flujo lo dice, sin inventar dirección", () => {
    const m = mapaGex({ ...QQQ, flujoAlcista: null });
    expect(m.lectura).toMatch(/No se pudo leer hacia dónde/);
  });

  it("sin macro no hay párrafo de ambiente", () => {
    expect(mapaGex({ ...QQQ, macro: undefined }).ambiente).toBeNull();
    expect(textoAmbiente({ bonos5d: null, dolar5d: null, vix: null, vix5d: null })).toBeNull();
  });

  it("avisa si el punto de cambio del día está cerca", () => {
    const m = mapaGex({ ...QQQ, gammaFlip: 709 });
    expect(m.confirmaciones.some((c) => c.includes("cambia el tipo de día"))).toBe(true);
  });
});
