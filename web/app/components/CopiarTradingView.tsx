"use client";

/**
 * 📋 Copiar para TradingView: arma la línea con los muros de GEX y el flow de
 * hoy (/api/tradingview/linea) y la copia, para pegarla en el script
 * "Nagimi Flow Pro" de TradingView (Ajustes → "Línea de Nagimi").
 */
import { useState } from "react";

export default function CopiarTradingView({ ticker }: { ticker: string }) {
  const [linea, setLinea] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const armar = async () => {
    setCargando(true); setNota(null); setCopiado(false);
    try {
      const r = await fetch(`/api/tradingview/linea?ticker=${encodeURIComponent(ticker)}`).then((x) => x.json());
      if (r.error) { setNota(r.error); setLinea(null); return; }
      setLinea(r.linea);
      setNota(r.espejoDe ? `Muros del ${r.espejoDe} pasados a ${ticker}.` : (r.avisoEspejo ?? null));
      await navigator.clipboard?.writeText(r.linea).then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }).catch(() => { /* sin permiso: se puede copiar a mano del recuadro */ });
    } catch {
      setNota("No se pudo armar la línea.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="ctv">
      <div className="ctv-fila">
        <div>
          <b>📈 TradingView</b>
          <span className="ctv-gris"> — los muros de GEX y el flow de hoy de {ticker}, para el script Nagimi Flow Pro</span>
        </div>
        <button type="button" className="ctv-btn" onClick={armar} disabled={cargando}>
          {cargando ? "Armando…" : copiado ? "✓ Copiada" : "📋 Copiar para TradingView"}
        </button>
      </div>
      {linea && (
        <>
          <textarea className="ctv-texto" readOnly value={linea} rows={2} onFocus={(e) => e.currentTarget.select()} />
          <div className="ctv-gris">
            En TradingView: abre los Ajustes del indicador → pega en <b>“Línea de Nagimi”</b> → Aceptar.
            Vuelve a copiarla si los muros se mueven durante el día.
            {nota && <> · {nota}</>}
          </div>
        </>
      )}
      {!linea && nota && <div className="ctv-gris" style={{ color: "var(--red-soft)" }}>{nota}</div>}
    </div>
  );
}
