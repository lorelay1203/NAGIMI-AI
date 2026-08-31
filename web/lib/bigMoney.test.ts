import { describe, expect, it } from "vitest";
import { INVESTORS, GROUP_LABEL, parseInfoTable, normalizeUnits, normName, normSorted, decodeEntities } from "./bigMoney";

/** Fila de 13F, con o sin espacio de nombres (ambos existen en la SEC real). */
function infoTable(o: { ns?: string; name: string; cusip: string; value: number; shares: number }) {
  const p = o.ns ? `${o.ns}:` : "";
  return `<${p}infoTable>
    <${p}nameOfIssuer>${o.name}</${p}nameOfIssuer>
    <${p}cusip>${o.cusip}</${p}cusip>
    <${p}value>${o.value}</${p}value>
    <${p}shrsOrPrnAmt><${p}sshPrnamt>${o.shares}</${p}sshPrnamt></${p}shrsOrPrnAmt>
  </${p}infoTable>`;
}

describe("parseInfoTable", () => {
  it("lee etiquetas sin espacio de nombres", () => {
    const xml = [
      infoTable({ name: "APPLE INC", cusip: "037833100", value: 5_000_000_000, shares: 20_000_000 }),
      infoTable({ name: "COCA COLA CO", cusip: "191216100", value: 2_000_000_000, shares: 30_000_000 }),
      infoTable({ name: "CHEVRON CORP", cusip: "166764100", value: 1_000_000_000, shares: 6_000_000 }),
    ].join("\n");
    const h = parseInfoTable(xml);
    expect(h).toHaveLength(3);
    expect(h[0]).toMatchObject({ name: "APPLE INC", cusip: "037833100", value: 5e9, shares: 2e7 });
  });

  // Este era el bug: Baupost usa <ns1:infoTable> y solo se leía 1 posición.
  it("lee etiquetas CON espacio de nombres (ns1:)", () => {
    const xml = [
      infoTable({ ns: "ns1", name: "ALPHABET INC", cusip: "02079K107", value: 484_744_000, shares: 1_371_931 }),
      infoTable({ ns: "ns1", name: "AMAZON COM INC", cusip: "023135106", value: 300_000_000, shares: 1_200_000 }),
      infoTable({ ns: "ns1", name: "META PLATFORMS INC", cusip: "30303M102", value: 200_000_000, shares: 300_000 }),
    ].join("\n");
    const h = parseInfoTable(xml);
    expect(h).toHaveLength(3);
    expect(h.map((x) => x.name)).toEqual(["ALPHABET INC", "AMAZON COM INC", "META PLATFORMS INC"]);
  });

  it("suma varias filas del mismo CUSIP (clases o gestores distintos)", () => {
    const xml = [
      infoTable({ name: "APPLE INC", cusip: "037833100", value: 1_000_000_000, shares: 4_000_000 }),
      infoTable({ name: "APPLE INC", cusip: "037833100", value: 500_000_000, shares: 2_000_000 }),
      infoTable({ name: "COCA COLA CO", cusip: "191216100", value: 900_000_000, shares: 14_000_000 }),
    ].join("\n");
    const h = parseInfoTable(xml);
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ value: 1.5e9, shares: 6e6 });
  });

  it("XML vacío o sin posiciones devuelve lista vacía", () => {
    expect(parseInfoTable("")).toEqual([]);
    expect(parseInfoTable("<xml><otraCosa>1</otraCosa></xml>")).toEqual([]);
  });
});

describe("normalizeUnits", () => {
  // Baupost reporta en miles: $484.744 para 1,37M acciones de Alphabet daría
  // $0,35 por acción, imposible. Hay que multiplicar por 1000.
  it("convierte a dólares cuando el fondo reporta en miles", () => {
    const h = normalizeUnits([
      { name: "ALPHABET", cusip: "A", value: 484_744, shares: 1_371_931 },
      { name: "AMAZON", cusip: "B", value: 300_000, shares: 1_200_000 },
      { name: "META", cusip: "C", value: 200_000, shares: 300_000 },
    ]);
    expect(h[0].value).toBe(484_744_000);
    expect(h[0].value / h[0].shares).toBeGreaterThan(100); // precio por acción creíble
  });

  it("deja igual lo que ya viene en dólares", () => {
    const h = normalizeUnits([
      { name: "APPLE", cusip: "A", value: 5_000_000_000, shares: 20_000_000 },
      { name: "COCA COLA", cusip: "B", value: 2_000_000_000, shares: 30_000_000 },
      { name: "CHEVRON", cusip: "C", value: 1_000_000_000, shares: 6_000_000 },
    ]);
    expect(h[0].value).toBe(5_000_000_000);
  });

  it("con muy pocas posiciones no adivina", () => {
    const one = [{ name: "X", cusip: "A", value: 100, shares: 1_000_000 }];
    expect(normalizeUnits([...one])[0].value).toBe(100);
  });
});

describe("lista de inversores", () => {
  it("todos tienen id único", () => {
    const ids = INVESTORS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todos tienen CIK numérico y grupo conocido", () => {
    for (const i of INVESTORS) {
      expect(i.cik, i.id).toMatch(/^\d+$/);
      expect(Object.keys(GROUP_LABEL), i.id).toContain(i.group);
    }
  });

  it("hay variedad: todos los grupos tienen al menos 3", () => {
    for (const g of Object.keys(GROUP_LABEL)) {
      expect(INVESTORS.filter((i) => i.group === g).length, g).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("normName / normSorted (mapeo nombre → ticker)", () => {
  it("quita el estado de incorporación /DE/", () => {
    expect(normName("BANK OF AMERICA CORP /DE/")).toBe("BANK AMERICA");
  });

  it("expande abreviaturas del 13F", () => {
    expect(normName("BK OF AMERICA CORP")).toBe("BANK AMERICA");
    expect(normName("AXALTA COATING SYS LTD")).toBe("AXALTA COATING SYSTEMS");
    expect(normName("OCCIDENTAL PETE CORP")).toBe("OCCIDENTAL PETROLEUM");
  });

  it("no parte los apóstrofes", () => {
    expect(normName("Macy's, Inc.")).toBe("MACYS");
    expect(normName("MACYS INC")).toBe("MACYS");
  });

  it("casa nombres con el orden invertido", () => {
    // El 13F dice "D R HORTON INC"; la SEC registra "HORTON D R INC /DE/".
    expect(normSorted("D R HORTON INC")).toBe(normSorted("HORTON D R INC /DE/"));
  });

  it("empresas distintas NO se confunden", () => {
    expect(normSorted("APPLE INC")).not.toBe(normSorted("APPLE HOSPITALITY REIT INC"));
    expect(normName("DELTA AIR LINES INC")).not.toBe(normName("DELTA APPAREL INC"));
  });
});

describe("entidades HTML del XML", () => {
  it("decodifica &amp; en nombres de empresa", () => {
    expect(decodeEntities("S&amp;P GLOBAL INC")).toBe("S&P GLOBAL INC");
    expect(decodeEntities("BLOCK H &amp; R INC")).toBe("BLOCK H & R INC");
  });

  it("el nombre mostrado sale limpio, no con &amp;", () => {
    const xml = `<infoTable><nameOfIssuer>S&amp;P GLOBAL INC</nameOfIssuer>
      <cusip>78409V104</cusip><value>1000000</value>
      <shrsOrPrnAmt><sshPrnamt>2000</sshPrnamt></shrsOrPrnAmt></infoTable>`;
    expect(parseInfoTable(xml)[0].name).toBe("S&P GLOBAL INC");
  });

  it("13F y SEC coinciden aunque uno traiga la entidad", () => {
    expect(normName("S&amp;P GLOBAL INC")).toBe(normName("S&P Global Inc."));
  });

  it("quita el sufijo de estado sin barra final (/CA)", () => {
    expect(normName("VERISIGN INC/CA")).toBe(normName("VERISIGN INC"));
  });
});
