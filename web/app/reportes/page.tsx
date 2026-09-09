"use client";

// 📓 Reportes — la bitácora de Nagimi.
//
// FinAnalista tiene un "research log" que lista lo que analizaste. Este lista
// lo mismo Y además dice si acertó: cada predicción guardada se contrasta con
// lo que el precio hizo de verdad después. Es la parte incómoda y la más útil.

import { useEffect, useState } from "react";
import type { ReportRow, ReportsIndex } from "@/lib/reportsIndex";

const px = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 })}`;

const DIR: Record<string, { txt: string; color: string }> = {
  up: { txt: "▲ Subida", color: "var(--green)" },
  down: { txt: "▼ Bajada", color: "var(--red-soft)" },
  flat: { txt: "– Lateral", color: "var(--muted)" },
};

/** Color del acierto: verde si va bien, ámbar si regular, rojo si va mal. */
const colorAcierto = (p: number) => (p >= 60 ? "var(--green)" : p >= 40 ? "var(--amber-text)" : "var(--red-soft)");

export default function ReportesPage() {
  const [data, setData] = useState<ReportsIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reportes")
      .then((r) => r.json())
      .then((d: ReportsIndex & { error?: string }) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("No se pudo leer la bitácora."));
  }, []);

  const sinDatos = data?.filas.filter((f) => f.sinDatos) ?? [];

  return (
    <main className="wrap page-stack" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div className="eyebrow">Bitácora</div>
        <h1>📓 Reportes</h1>
        <p>
          Cada análisis que Nagimi guardó, contrastado con lo que el precio hizo después.
          No es para presumir: es para saber cuánto puedes confiar en él.
        </p>
      </div>

      {error && <div className="error">⚠ {error}</div>}
      {!data && !error && <div className="card" style={{ color: "var(--muted)" }}>Revisando tus reportes contra el mercado…</div>}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Tile label="Reportes guardados" value={String(data.totalReportes)} sub={`${data.filas.length} tickers`} />
            <Tile label="Ya se pueden medir" value={String(data.totalVencidas)} sub="cumplieron su plazo" />
            <Tile
              label="Acertó la dirección"
              value={data.aciertoGlobal == null ? "—" : `${data.aciertoGlobal.toFixed(0)}%`}
              sub={data.totalVencidas > 0 ? `de ${data.totalVencidas} medidas` : "aún no hay ninguna medida"}
              color={data.aciertoGlobal == null ? undefined : colorAcierto(data.aciertoGlobal)}
            />
          </div>

          {/* Lo que el número significa, dicho sin adornos. */}
          {data.aciertoGlobal != null && (
            <div className="card" style={{ gap: 6, borderColor: data.aciertoGlobal < 50 ? "var(--amber-border)" : "var(--border)" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {data.aciertoGlobal >= 60
                  ? "Nagimi va acertando la dirección más veces de las que falla."
                  : data.aciertoGlobal >= 45
                  ? "Nagimi acierta la dirección más o menos la mitad de las veces."
                  : "Nagimi está fallando la dirección más veces de las que acierta."}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
                {data.aciertoGlobal < 50 ? (
                  <>
                    Con {data.aciertoGlobal.toFixed(0)}% de acierto sobre {data.totalVencidas} predicciones, la
                    <b> dirección por sí sola no es motivo suficiente para entrar</b>. Lo que sí sirve son los
                    niveles: los muros de gamma y el imán aciertan mucho más que la flecha. Úsalo para saber
                    <i> dónde</i> puede frenar el precio, no <i>hacia dónde</i> va a ir.
                  </>
                ) : (
                  <>
                    Sobre {data.totalVencidas} predicciones ya vencidas. Aun así, la dirección es solo una parte:
                    los niveles (muros e imán) son la señal más fiable.
                  </>
                )}
              </div>
            </div>
          )}

          <div className="card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="research-table" style={{ minWidth: 780 }}>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Última</th>
                    <th className="num">Reportes</th>
                    <th className="num">Medidas</th>
                    <th>Dijo</th>
                    <th className="num">Bajista / Base / Alcista</th>
                    <th className="num">Acertó</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.filas.map((f) => <Fila key={f.ticker} f={f} />)}
                </tbody>
              </table>
            </div>
          </div>

          {sinDatos.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55 }}>
              ⚠️ De {sinDatos.map((f) => f.ticker).join(", ")} no se pudieron bajar los precios históricos ahora
              mismo, así que sus reportes <b>no entran</b> en el porcentaje de arriba. No es que fallaran — es que
              no se pudieron medir. Vuelve a entrar en un rato y seguramente ya estén.
            </div>
          )}
        </>
      )}

      <div className="disclaimer">
        Una predicción se puede medir cuando pasa su plazo (normalmente 20 días). Material de estudio, no consejo financiero.
      </div>
    </main>
  );
}

function Fila({ f }: { f: ReportRow }) {
  const dir = DIR[f.direction] ?? DIR.flat;
  return (
    <tr className="research-row" onClick={() => { window.location.href = `/?ticker=${encodeURIComponent(f.ticker)}`; }}>
      <td className="tk">{f.ticker}</td>
      <td style={{ color: "var(--muted)", fontSize: 12 }}>{f.ultimaFecha}</td>
      <td className="num">{f.total}</td>
      <td className="num" style={{ color: f.vencidas === 0 ? "var(--muted)" : undefined }}>{f.vencidas}</td>
      <td style={{ color: dir.color, fontWeight: 700, fontSize: 12.5 }}>{dir.txt}</td>
      <td className="num" style={{ fontSize: 12 }}>
        <span style={{ color: "var(--red-soft)" }}>{px(f.bear)}</span>
        {" · "}
        <b>{px(f.base)}</b>
        {" · "}
        <span style={{ color: "var(--green)" }}>{px(f.bull)}</span>
      </td>
      <td className="num" style={{ fontWeight: 700, color: f.aciertoDireccion == null ? "var(--muted)" : colorAcierto(f.aciertoDireccion) }}>
        {f.sinDatos ? "sin medir" : f.aciertoDireccion == null ? "aún no" : `${f.aciertoDireccion.toFixed(0)}%`}
      </td>
      <td className="num research-go">→</td>
    </tr>
  );
}

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
      <div className="eyebrow">{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, letterSpacing: "-0.02em", color }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
