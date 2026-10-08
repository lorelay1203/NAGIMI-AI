"use client";

// 🧱 "Niveles por vencimiento" — cuántas veces se repite cada muro.
//
// El resto de Nagimi dice "el techo está en $230". Esta tarjeta dice además en
// cuántos vencimientos aparece ese techo, que es lo que decide si aguanta:
// tres bloques de dinero defendiendo el mismo precio no es lo mismo que uno.
//
// Cómo se pinta (para que se entienda de un vistazo):
//   · Si el mismo precio es techo en unos vencimientos y suelo en otros, sale
//     UNA fila de "zona de pelea" en vez de dos filas que se contradicen.
//   · Un techo que quedó por debajo del precio (o un suelo por encima) ya fue
//     cruzado: se marca así, en gris, en vez de llamarlo techo o suelo a secas.
//   · La explicación va debajo de cada fila, no en una columna que se sale.
//
// Todo el cálculo vive en lib/nivelesConfirmados.ts (puro, con pruebas). Aquí
// solo se pinta.

import { useMemo } from "react";
import type { GexHeatmap } from "@/lib/gexHeatmap";
import { nivelesConfirmados } from "@/lib/nivelesConfirmados";
import { filasNivel, type ClaseNivel, type FilaNivel as FilaNivelDatos } from "@/lib/planNiveles";

const px = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

type Clase = ClaseNivel;
type Fila = FilaNivelDatos;

const NOMBRE: Record<Clase, string> = {
  techo: "Techo",
  suelo: "Suelo",
  pelea: "Techo y suelo",
  "techo-roto": "Techo ya cruzado",
  "suelo-roto": "Suelo ya cruzado",
};

function FilaNivel({ f }: { f: Fila }) {
  return (
    <div className={`nvc-fila nvc-${f.clase}`}>
      <div className="nvc-precio">{px(f.strike)}</div>
      <div><span className={`nvc-badge nvc-badge-${f.clase}`}>{NOMBRE[f.clase]}</span></div>
      <div className="nvc-num">{pct(f.distanciaPct)}</div>
      <div className="nvc-veces" title={f.vencimientos.join(" · ")}>
        <b>{f.veces}</b> {f.veces === 1 ? "vencimiento" : "vencimientos"}
        <span className="nvc-dtes">{f.etiqueta}</span>
      </div>
      <div className="nvc-num">{f.probTocar == null ? "—" : `${Math.round(f.probTocar * 100)}%`}</div>
      <div className="nvc-lectura">{f.lectura}</div>
    </div>
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

  const filas = filasNivel([...datos.techos, ...datos.suelos]);
  const spot = heat!.spot;
  const arriba = filas.filter((f) => f.strike > spot);
  const abajo = filas.filter((f) => f.strike <= spot);
  const masFuerte = filas
    .filter((f) => f.clase !== "techo-roto" && f.clase !== "suelo-roto")
    .reduce<Fila | null>((m, f) => (!m || f.veces > m.veces ? f : m), null);

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

      <div className="nvc-tabla">
        <div className="nvc-fila nvc-cabeza">
          <div>Precio</div><div>Qué es</div><div className="nvc-num">Distancia</div>
          <div>Se repite en</div><div className="nvc-num">Prob. de tocarlo</div><div />
        </div>
        {arriba.map((f) => <FilaNivel key={f.strike} f={f} />)}
        <div className="nvc-precio-ahora">
          <span className="lvl-spot-line" aria-hidden="true" /> Precio ahora · <b>{px(spot)}</b> <span className="lvl-spot-line" aria-hidden="true" />
        </div>
        {abajo.map((f) => <FilaNivel key={f.strike} f={f} />)}
        {filas.length === 0 && <div className="research-muted" style={{ padding: 12 }}>Ningún vencimiento dejó un muro claro hoy.</div>}
      </div>

      <div className="research-foot">
        {masFuerte
          ? <>El más fuerte de hoy es {masFuerte.clase === "pelea" ? "la zona de pelea" : `el ${NOMBRE[masFuerte.clase].toLowerCase()}`} de <b>{px(masFuerte.strike)}</b>, que se repite en{" "}
              {masFuerte.veces} de {datos.vencimientosMirados} vencimientos. La probabilidad es de que el precio
              lo <b>toque</b> antes de su último vencimiento — no de que se quede ahí.</>
          : "Sin muros claros hoy: el dinero está repartido y ningún precio manda."}
      </div>
    </section>
  );
}
