"use client";

// Puente Nagimi → TradingView. Pine Script no puede llamar a nuestra API, así que
// generamos el indicador con los niveles ya escritos adentro y ella lo pega.

import { useMemo, useState } from "react";
import { buildPineScript, type PineGexInput, type PineLevel } from "@/lib/pineScript";

export default function PineScriptCard({
  ticker, spot, gex, supports, resistances,
}: {
  ticker: string;
  spot: number | null;
  gex: PineGexInput;
  supports: PineLevel[];
  resistances: PineLevel[];
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  // Escala a futuros: /ES y /MES = el mismo S&P que SPY pero ×múltiplo (~10).
  const [scale, setScale] = useState<"base" | "es">("base");
  const [mult, setMult] = useState(10);

  // Solo tiene sentido escalar índices del S&P (SPY, y el propio SPX/ES).
  const scalable = ["SPY", "SPX", "ES", "MES", "/ES", "/MES"].includes(ticker.toUpperCase());
  const k = scale === "es" && mult > 0 ? mult : 1;
  const scaleNum = (n: number | null) => (n == null ? null : Math.round(n * k * 100) / 100);

  const script = useMemo(() => {
    const now = new Date();
    const generatedAt = `${now.toLocaleDateString("es-PR")} ${now.toLocaleTimeString("es-PR", { hour: "2-digit", minute: "2-digit" })}`;
    const scaled = scale === "es" && mult > 0;
    const g: PineGexInput = scaled
      ? {
          callWall: scaleNum(gex.callWall), putWall: scaleNum(gex.putWall),
          magnet: scaleNum(gex.magnet), maxPain: scaleNum(gex.maxPain),
          gammaFlip: scaleNum(gex.gammaFlip), netGex: gex.netGex, regime: gex.regime,
        }
      : gex;
    const sc = scaled
      ? supports.map((l) => ({ ...l, price: l.price * k }))
      : supports;
    const rc = scaled
      ? resistances.map((l) => ({ ...l, price: l.price * k }))
      : resistances;
    const label = scaled ? `${ticker}→/ES·/MES (×${mult})` : ticker;
    return buildPineScript({ ticker: label, spot: scaleNum(spot), generatedAt, gex: g, supports: sc, resistances: rc });
  }, [ticker, spot, gex, supports, resistances, scale, mult, k]);

  const hasWalls = gex.callWall != null || gex.putWall != null;
  const nLevels = supports.length + resistances.length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nagimi-gex-${ticker.toLowerCase()}.pine`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="card" style={{ gap: 12 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>📈 Ver estos niveles en TradingView · {ticker}</div>
        <div className="card-sub">
          Genera un indicador con tus muros de GEX, soportes y resistencias ya adentro.
          Lo copias y lo pegas en TradingView una sola vez.
        </div>
      </div>

      {!hasWalls && nLevels === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          Todavía no hay niveles calculados. Analiza el ticker primero.
        </div>
      ) : (
        <>
          {scalable && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "8px 10px", borderRadius: 8, background: "var(--panel-2)", border: "1px solid var(--border-soft)" }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Escala:</span>
              <button type="button" onClick={() => setScale("base")}
                style={{ padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600, border: scale === "base" ? "1px solid var(--accent)" : "1px solid var(--border)", background: scale === "base" ? "var(--accent)" : "transparent", color: scale === "base" ? "#fff" : "var(--text)" }}>
                {ticker} (acciones/ETF)
              </button>
              <button type="button" onClick={() => setScale("es")}
                style={{ padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600, border: scale === "es" ? "1px solid var(--accent)" : "1px solid var(--border)", background: scale === "es" ? "var(--accent)" : "transparent", color: scale === "es" ? "#fff" : "var(--text)" }}>
                /ES · /MES (futuros)
              </button>
              {scale === "es" && (
                <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
                  múltiplo (precio /ES ÷ precio SPY):
                  <input type="number" step="0.01" value={mult || ""} onChange={(e) => setMult(Number(e.target.value))}
                    style={{ width: 70, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "4px 6px", fontSize: 12 }} />
                </label>
              )}
              {scale === "es" && (
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                  Call Wall {scaleNum(gex.callWall) ?? "—"} · Put Wall {scaleNum(gex.putWall) ?? "—"} · sirve igual para /ES y /MES
                </span>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" onClick={copy}
              style={{ background: copied ? "#2ec77f" : "var(--accent)", color: copied ? "#062" : "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
              {copied ? "✓ Copiado — pégalo en el Pine Editor" : "📋 Copiar el script"}
            </button>
            <button type="button" onClick={download}
              style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 14px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              ⬇️ Descargar .pine
            </button>
            <button type="button" onClick={() => setOpen((v) => !v)}
              style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 14px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              {open ? "Ocultar código" : "Ver código"}
            </button>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {[gex.callWall != null && "Call Wall", gex.putWall != null && "Put Wall", gex.magnet != null && "Imán", gex.gammaFlip != null && "Gamma Flip"].filter(Boolean).join(" · ")}
              {nLevels > 0 && ` · ${resistances.length} resistencias · ${supports.length} soportes`}
            </span>
          </div>

          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
            <li>Abre el gráfico de <b style={{ color: "var(--text)" }}>{ticker}</b> en TradingView.</li>
            <li>Abajo del gráfico, pestaña <b style={{ color: "var(--text)" }}>Pine Editor</b>.</li>
            <li>Borra lo que haya, pega el script, dale <b style={{ color: "var(--text)" }}>Save</b> y luego <b style={{ color: "var(--text)" }}>Add to chart</b>.</li>
            <li>Para ajustar un precio a mano: engranaje ⚙ del indicador.</li>
          </ol>

          <div style={{ padding: "8px 10px", borderRadius: 8, background: "var(--amber-bg, rgba(245,196,81,0.08))", border: "1px solid rgba(245,196,81,0.35)", color: "var(--amber-text, #f5c451)", fontSize: 12.5 }}>
            ⚠️ Los niveles son una <b>foto de ahora mismo</b>. El GEX se mueve durante el día —
            vuelve aquí y genera el script otra vez cuando lo quieras al día.
          </div>

          {open && (
            <textarea
              readOnly
              value={script}
              spellCheck={false}
              style={{
                width: "100%", height: 320, background: "var(--panel-2)", border: "1px solid var(--border)",
                borderRadius: 8, color: "var(--text)", padding: 10, fontSize: 11.5,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", resize: "vertical",
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
