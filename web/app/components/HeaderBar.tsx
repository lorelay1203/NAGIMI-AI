"use client";

import { useState } from "react";
import type { CompanyInfo } from "@/lib/types";
import { pct, px } from "../format";

export default function HeaderBar({
  ticker,
  company,
  busy,
  onSearch,
  onHome,
}: {
  ticker: string | null;
  company: CompanyInfo | null;
  busy: boolean;
  onSearch: (t: string) => void;
  onHome?: () => void;
}) {
  const [q, setQ] = useState("");

  const submit = () => {
    const t = q.trim().toUpperCase();
    if (!t || busy) return;
    setQ("");
    onSearch(t);
  };

  return (
    <div className="hb">
      <div className="hb-brand" onClick={() => onHome?.()} style={{ cursor: onHome ? "pointer" : "default" }} title="Ir al inicio">
        <div className="hb-logo">N</div>
        <div className="hb-name">Nagimi AI</div>
        <div className="hb-chip">AI Options Agent</div>
      </div>
      <input
        className="hb-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="Buscar ticker…"
        spellCheck={false}
      />
      <div className="hb-right">
        {company && (
          <>
            <div className="hb-ticker-name">{company.name ?? company.ticker}</div>
            {company.price != null && <div className="hb-price">${px.format(company.price)}</div>}
            {company.changePercent != null && (
              <div className="hb-chg" style={{ color: company.changePercent >= 0 ? "#12b76a" : "#f04438" }}>
                {pct.format(company.changePercent)}%
              </div>
            )}
          </>
        )}
        <a className="hb-link" href="/bienvenida" title="Portada de presentación">✨ Portada</a>
        <a className="hb-link" href="/" title="Volver al inicio">🏠 Inicio</a>
        <a className="hb-link" href="/cookie" title="Renovar cookie de MarketSnack">🍪 Cookie</a>
        <a className="hb-link" href="/watchlist" title="Tu lista de seguimiento">⭐ Watchlist</a>
      </div>
    </div>
  );
}
