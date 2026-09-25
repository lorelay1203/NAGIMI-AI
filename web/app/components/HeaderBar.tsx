"use client";

// Barra de arriba, con el orden de FinAnalista: dónde estás a la izquierda y
// un buscador a la derecha que te lleva a un ticker O a una página ("wheel",
// "prima", "reportes"…). Ctrl+K (⌘K en Mac) lo enfoca desde cualquier lado.
//
// No se copiaron la campanita ni el botón de panel de agentes: en FinAnalista
// no hacen nada todavía, y en Nagimi no se pone nada que no funcione.

import { useCallback, useEffect, useRef, useState } from "react";
import PanelAgentes, { type NotasAgentes } from "./PanelAgentes";
import type { CompanyInfo } from "@/lib/types";
import { pct, px } from "../format";

/** Palabras que llevan a una página en vez de analizar un ticker. */
const PAGINAS: [RegExp, string][] = [
  [/^(panel|inicio)$/i, "/"],
  [/^day ?trades?$/i, "/daytrades"],
  [/^flujo$/i, "/flow"],
  [/^(grandes|sigue a los grandes)$/i, "/grandes"],
  [/^ideas$/i, "/ideas"],
  [/^wheel$/i, "/wheel"],
  [/^(prima|venta de prima)$/i, "/prima"],
  [/^watchlist$/i, "/watchlist"],
  [/^reportes?$/i, "/reportes"],
  [/^(conexiones|schwab)$/i, "/schwab"],
  [/^(marketsnack|cookie)$/i, "/cookie"],
  [/^(glosario|diccionario)$/i, "/glosario"],
  [/^(mapa|mapa gex|gex map)$/i, "/mapa"],
  [/^gu[ií]a$/i, "/guia"],
];

export default function HeaderBar({
  ticker,
  company,
  busy,
  onSearch,
  onHome,
  notasAgentes,
}: {
  ticker: string | null;
  company: CompanyInfo | null;
  busy: boolean;
  onSearch: (t: string) => void;
  onHome?: () => void;
  /** Notas 0-10 de los seis agentes que puntúan (del análisis completo). */
  notasAgentes?: NotasAgentes;
}) {
  const [agentesAbierto, setAgentesAbierto] = useState(false);
  const cerrarAgentes = useCallback(() => setAgentesAbierto(false), []);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    const texto = q.trim();
    if (!texto) return;
    const pagina = PAGINAS.find(([re]) => re.test(texto));
    if (pagina) {
      window.location.href = pagina[1];
      return;
    }
    if (busy) return;
    setQ("");
    onSearch(texto.toUpperCase());
  };

  return (
    <div className="hb">
      {ticker && onHome ? (
        <button type="button" className="hb-back" onClick={onHome} title="Volver al panel">
          ← Panel
        </button>
      ) : (
        <div className="hb-crumb">Panel</div>
      )}

      {company && (
        <div className="hb-right hb-mid">
          <div className="hb-ticker-name">{company.name ?? company.ticker}</div>
          {company.price != null && <div className="hb-price">${px.format(company.price)}</div>}
          {company.changePercent != null && (
            <div className="hb-chg" style={{ color: company.changePercent >= 0 ? "#12b76a" : "#f04438" }}>
              {pct.format(company.changePercent)}%
            </div>
          )}
        </div>
      )}

      <div className="hb-cmd">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={input}
          className="hb-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Ve a un ticker o a una página…"
          aria-label="Buscar un ticker o una página"
          spellCheck={false}
        />
        <kbd>Ctrl K</kbd>
      </div>

      <button
        type="button"
        className={`hb-agentes ${agentesAbierto ? "on" : ""}`}
        onClick={() => setAgentesAbierto((v) => !v)}
        aria-expanded={agentesAbierto}
        title="Ver qué está mirando cada agente"
      >
        👥 Agentes
      </button>

      <PanelAgentes abierto={agentesAbierto} onCerrar={cerrarAgentes} ticker={ticker} notas={notasAgentes} analizando={busy} />
    </div>
  );
}
