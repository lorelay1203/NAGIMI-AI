"use client";

// 🧱 "Niveles por vencimiento" — cuántas veces se repite cada muro.
//
// El resto de Nagimi dice "el techo está en $230". Esta tarjeta dice además en
// cuántos vencimientos aparece ese techo, que es lo que decide si aguanta:
// tres bloques de dinero defendiendo el mismo precio no es lo mismo que uno.
//
// Todo el cálculo vive en lib/nivelesConfirmados.ts (puro, con pruebas). Aquí
// solo se pinta.

import { useMemo } from "react";
import type { GexHeatmap } from "@/lib/gexHeatmap";
import { nivelesConfirmados, type NivelConfirmado } from "@/lib/nivelesConfirmados";

const px = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

function Fila({ n }: { n: NivelConfirmado }) {
  const esTecho = n.lado === "techo";
  return (
    <tr className="research-row">
      <td className="num" style={{ fontWeight: 800, color: esTecho ? "var(--red-soft)" : "var(--green)" }}>
        {px(n.strike)}
      </td>
      <td>
        <span className={`sig-pill ${esTecho ? "down" : "up"}`}>
          {esTecho ? "Techo" : "Suelo"}
        </span>
      </td>
      <td className="num" style={{ color: "var(--muted)" }}>{pct(n.distanciaPct)}</td>
      <td>
        <span className="nv-veces" title={n.vencimientos.join(" · ")}>
          {n.veces} {n.veces === 1 ? "vencimiento" : "vencimientos"}
          <span className="nv-dtes">{n.etiqueta}</span>
        </span>
      </td>
      <td className="num">
        {n.probTocar == null ? "—" : `${Math.round(n.probTocar * 100)}%`}
      </td>
      <td className="nv-lectura">{n.lectura}</td>
    </tr>
  );
}

export default function NivelesConfirmadosCard({
  ticker,
  heat,
}: {
  ticker: string;
  /** El mapa de calor que el Panel ya calcula. Si falta, la tarjeta lo dice. */
  heat: GexHeatmap | null;
}) {
  const datos = useMemo(() => {
    if (!heat || heat.cells.length === 0 || !(heat.spot > 0)) return null;
    return nivelesConfirmados({
      celdas: heat.cells.map((c) => ({
        strike: c.strike, expiration: c.expiration, callGex: c.callGex, putGex: c.putGex,
      })),
      vencimientos: heat.expirations.map((e) => ({ expiration: e.expiration, dte: e.dte })),
      spot: heat.spot,
      iv: heat.iv,
    });
  }, [heat]);

  if (!datos) {
    return (
      <section className="card">
        <div className="card-title">Niveles por vencimiento</div>
        <div className="research-muted">
          No se pudo leer la cadena de {ticker} por vencimiento ahora mismo, así que no se puede
          decir cuántas veces se repite cada muro.
        </div>
      </section>
    );
  }

  const filas = [...datos.techos, ...datos.suelos].sort((a, b) => b.strike - a.strike);
  const masFuerte = filas.reduce<NivelConfirmado | null>(
    (mejor, n) => (!mejor || n.veces > mejor.veces ? n : mejor), null,
  );

  return (
    <section className="card research" style={{ gap: 0 }}>
      <div className="research-head">
        <div>
          <div className="research-title">
            Niveles <em>por vencimiento</em>
          </div>
          <div className="card-sub">
            El mismo muro repetido en varios vencimientos aguanta más. Se miraron los{" "}
            {datos.vencimientosMirados} vencimientos más cercanos de {ticker}.
          </div>
        </div>
      </div>

      <div className="research-scroll">
        <table className="research-table" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th className="num">Precio</th>
              <th>Qué es</th>
              <th className="num">Distancia</th>
              <th>Confirmado en</th>
              <th className="num">Prob. de tocarlo</th>
              <th>Qué significa</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((n) => <Fila key={`${n.lado}-${n.strike}`} n={n} />)}
            {filas.length === 0 && (
              <tr><td colSpan={6} className="research-muted">Ningún vencimiento dejó un muro claro hoy.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="research-foot">
        {masFuerte
          ? <>El más fuerte de hoy es el {masFuerte.lado} de <b>{px(masFuerte.strike)}</b>, que sale en{" "}
              {masFuerte.veces} de {datos.vencimientosMirados} vencimientos. La probabilidad es de que el precio
              lo <b>toque</b> antes de su último vencimiento — no de que se quede ahí.</>
          : "Sin muros claros hoy: la gamma está repartida y ningún precio manda."}
      </div>
    </section>
  );
}
