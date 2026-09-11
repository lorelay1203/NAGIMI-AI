import { describe, expect, it } from "vitest";
import { analogia } from "./analogia";

describe("analogia", () => {
  it("gamma positiva → canica en el tazón (vuelve al centro)", () => {
    const s = analogia("up", "positive", 60);
    expect(s).toContain("tazón");
    expect(s).toContain("centro");
  });

  it("gamma negativa → canica en la loma (se acelera), manda sobre la dirección", () => {
    const s = analogia("up", "negative", 80); // alcista fuerte, pero el régimen manda
    expect(s).toContain("loma");
    expect(s).toContain("aceleran");
  });

  it("sin régimen + alcista con confianza → todos remando arriba", () => {
    const s = analogia("up", undefined, 60);
    expect(s).toContain("arriba");
    expect(s).toContain("reman");
  });

  it("sin régimen + bajista → remando abajo", () => {
    expect(analogia("down", undefined, 60)).toContain("abajo");
  });

  it("sin régimen + lateral o confianza baja → semáforo en amarillo", () => {
    expect(analogia("flat", undefined, 60)).toContain("amarillo");
    expect(analogia("up", undefined, 20)).toContain("amarillo");
  });
});
