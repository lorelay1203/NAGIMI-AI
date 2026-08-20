"use client";

// Tarjeta de PAPER TRADING — trades simulados con P/L en vivo y marcador de aciertos.
// Sirve para probar si el motor gana ANTES de arriesgar dinero real. Sin ejecución.

import { Fragment, useCallback, useEffect, useState } from "react";
import { money0, px } from "../format";
import type { PaperTrade, PaperLeg } from "@/lib/paper";
import type { OrderLegInput } from "@/lib/tastytrade";
import SendToTastytrade from "./SendToTastytrade";

// Precio en vivo de una pata vía /api/quote (mismo endpoint que usa Mis Posiciones).
async function legQuote(ticker: string, l: PaperLeg): Promise<number | null> {
  if (l.type === "stock") {
    const q = await fetch(`/api/quote?ticker=${ticker}`).then((r) => r.json()).catch(() => null);
    return q?.price ?? q?.mid ?? null;
  }
  const url = `/api/quote?ticker=${ticker}&type=${l.type}&strike=${l.strike}&expiration=${l.expiration}`;
  const q = await fetch(url).then((r) => r.json()).catch(() => null);
  return q?.mid ?? q?.price ?? null;
}

// Valor neto actual de la estructura (suma de patas, respetando compra/venta).
async function liveNet(t: PaperTrade): Promise<number | null> {
  let net = 0;
  for (const l of t.legs) {
    const pxNow = await legQuote(t.ticker, l);
    if (pxNow == null) return null;
    net += (l.side === "buy" ? 1 : -1) * pxNow * l.qty;
  }
  return net;
}

interface Enriched extends PaperTrade { live: number | null }

/**
 * Panel para LLEVAR A REAL un trade en ganancia: editas contratos y precio límite,
 * y lo mandas a Tastytrade (semi-automático — tú das el clic final). Reusa el mismo
 * componente de envío con dry-run del Order Builder.
 */
function SendPaperPanel({ t }: { t: PaperTrade }) {
  const opts = t.legs.filter((l) => l.type !== "stock" && l.strike != null);
  const expiration = opts.find((l) => l.expiration)?.expiration ?? "";
  const [contracts, setContracts] = useState(Math.max(1, t.qtyContracts || 1));
  // entryNet por contrato: <0 = crédito recibido, >0 = débito pagado.
  const [price, setPrice] = useState(Math.abs(Math.round(t.entryNet * 100) / 100) || 0.05);
  const priceEffect: "Credit" | "Debit" = t.entryNet <= 0 ? "Credit" : "Debit";

  const legs: OrderLegInput[] = opts.map((l) => ({
    side: l.side,
    optionType: l.type as "call" | "put",
    strike: l.strike as number,
    quantity: l.qty * Math.max(1, contracts),
  }));

  return (
    <div style={{ background: "var(--panel-2)", border: "1px solid var(--accent)", borderRadius: 10, padding: "12px 14px", marginTop: 6, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700 }}>💵 Llevar este trade a real (Tastytrade)</div>
      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
        Ajusta lo que quieras y revisa antes de enviar. Nagimi <b>no ejecuta sola</b>: hace la prueba (dry-run) y
        tú das el clic final. Con tu cuenta chica puede que Tastytrade lo rechace por poco poder de compra — el
        dry-run te lo dirá sin arriesgar nada.
      </div>

      {/* Editar a tu manera: contratos + precio límite */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>
          Nº de contratos
          <div>
            <input type="number" min={1} value={contracts || ""} onChange={(e) => setContracts(Number(e.target.value))}
              style={{ marginTop: 4, width: 70, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "5px 8px", fontSize: 13, fontWeight: 700 }} />
          </div>
        </label>
        <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>
          Precio límite neto ({priceEffect === "Credit" ? "recibes" : "pagas"})
          <div>
            <input type="number" step="0.01" min={0} value={price || ""} onChange={(e) => setPrice(Number(e.target.value))}
              style={{ marginTop: 4, width: 90, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "5px 8px", fontSize: 13, fontWeight: 700 }} />
          </div>
        </label>
      </div>

      {/* Patas resultantes */}
      <div style={{ fontSize: 11.5, color: "var(--text)" }}>
        {legs.map((l, i) => (
          <div key={i} style={{ color: l.side === "buy" ? "#4ad991" : "#ff8a82" }}>
            • {l.side === "buy" ? "Compra" : "Vende"} {l.quantity}× {l.optionType.toUpperCase()} ${l.strike}
          </div>
        ))}
        <div style={{ color: "var(--muted)", marginTop: 2 }}>Vence {expiration || "—"}</div>
      </div>

      {legs.length > 0 && expiration ? (
        <SendToTastytrade ticker={t.ticker} expiration={expiration} legs={legs} price={price} priceEffect={priceEffect} />
      ) : (
        <div style={{ fontSize: 11.5, color: "#ff9b94" }}>Este trade no se puede enviar (faltan datos de las patas).</div>
      )}
    </div>
  );
}

// Traduce una pata a lenguaje llano: "Vende PUT 740 vence 2026-09-18".
function legText(l: PaperLeg): string {
  const verbo = l.side === "buy" ? "Compra" : "Vende";
  if (l.type === "stock") return `${verbo} ${l.qty}× acciones`;
  return `${verbo} ${l.type.toUpperCase()} ${l.strike}${l.expiration ? ` · vence ${l.expiration}` : ""}`;
}

// Panel de detalle: por qué el motor eligió el trade + sus patas.
function TradeDetail({ t, entry }: { t: PaperTrade; entry?: EntryInfo }) {
  const maxP = maxProfitOf(t);
  return (
    <div style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "12px 14px", marginTop: 6, display: "flex", flexDirection: "column", gap: 10 }}>
      {entry && (
        <div style={{ background: "var(--panel)", border: `1px solid ${entry.color}55`, borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: entry.color, marginBottom: 3 }}>
            {entry.emoji} ¿Puedo entrar a este trade? — {entry.label}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text)" }}>{entry.tip}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
            El <b>P/L</b> que ves es la ganancia <b>en papel desde que Nagimi encontró la idea</b> — no es lo que ganarías entrando hoy.
            {maxP != null && <> En este crédito lo <b>máximo</b> que se puede ganar son <b>${px.format(maxP)}</b> (la prima). Nunca más que eso.</>}
          </div>
        </div>
      )}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 4 }}>Las patas de la orden</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {t.legs.map((l, i) => (
            <div key={i} style={{ fontSize: 12.5, color: l.side === "buy" ? "#4ad991" : "#ff8a82" }}>
              • {legText(l)}
            </div>
          ))}
        </div>
      </div>

      {t.rationale ? (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 4 }}>📌 ¿Por qué el motor eligió este trade?</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap", color: "var(--text)" }}>{t.rationale}</div>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
          {t.note ? t.note : "Este trade se registró a mano, sin explicación automática del motor."}
        </div>
      )}

      {t.entrySpot != null && (
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
          Precio del subyacente al entrar: <b style={{ color: "var(--text)" }}>${px.format(t.entrySpot)}</b>
          {" · "}Registrado por: <b style={{ color: "var(--text)" }}>{t.source === "motor" ? "🤖 motor automático" : "✍️ manual"}</b>
        </div>
      )}
    </div>
  );
}

// Datos extra que viven en el `note` del trade (para columnas y orden).
const popOf = (t: PaperTrade): number | null => { const m = /POP (\d+)/.exec(t.note ?? ""); return m ? Number(m[1]) : null; };
const riskOf = (t: PaperTrade): number | null => { const m = /riesgo \$?(\d+)/.exec(t.note ?? ""); return m ? Number(m[1]) : null; };
// Fecha de vencimiento: de las patas (o del label como respaldo).
const expOf = (t: PaperTrade): string => {
  const leg = t.legs.find((l) => l.expiration);
  if (leg?.expiration) return leg.expiration;
  const m = /(\d{4}-\d{2}-\d{2})/.exec(t.label);
  return m ? m[1] : "";
};
// Nombre del trade SIN la fecha (para no duplicarla con la columna Vence).
const labelNoDate = (label: string): string => label.replace(/\s*·\s*\d{4}-\d{2}-\d{2}\s*$/, "").trim();

// Días que faltan para el vencimiento (según el reloj de la compu).
const dteOf = (t: PaperTrade): number | null => {
  const exp = expOf(t);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(exp);
  if (!m) return null;
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end.getTime() - today.getTime()) / 86400000);
};
// Ganancia MÁXIMA posible de un crédito ≈ prima recibida (entryNet<0) × 100 × contratos.
const maxProfitOf = (t: PaperTrade): number | null =>
  t.entryNet < 0 ? Math.abs(t.entryNet) * 100 * t.qtyContracts : null;

// ¿Todavía se puede ENTRAR a este trade hoy? Semáforo en lenguaje llano.
interface EntryInfo { emoji: string; label: string; color: string; tip: string }
function entryStatus(t: PaperTrade, pl: number | null): EntryInfo {
  const dte = dteOf(t);
  if (dte != null && dte < 0)
    return { emoji: "🔴", label: "Venció", color: "#f04438", tip: "Ya pasó la fecha de vencimiento. No se puede entrar — usa 🗑 para quitarlo." };
  if (dte === 0)
    return { emoji: "🔴", label: "Vence hoy", color: "#f04438", tip: "Vence hoy: no es momento de abrir esta posición." };
  const maxP = maxProfitOf(t);
  if (maxP != null && pl != null && pl >= 0.7 * maxP)
    return { emoji: "🟡", label: "Ya corrió", color: "#e0a800", tip: "La idea ya casi tocó su ganancia máxima. Si entras ahora recibes MUY poca prima — lo bueno ya pasó. Mejor busca una fresca." };
  if (dte != null && dte >= 1)
    return { emoji: "🟢", label: "Se puede", color: "#12b76a", tip: `Quedan ${dte} día${dte === 1 ? "" : "s"}. Todavía puedes entrar, pero recibirás algo menos de prima que cuando Nagimi la encontró.` };
  return { emoji: "⚪", label: "—", color: "var(--muted)", tip: "Sin fecha de vencimiento clara." };
}

const pth: React.CSSProperties = { textAlign: "right", padding: "8px 10px", fontSize: 11, color: "var(--muted)", fontWeight: 700, whiteSpace: "nowrap", borderBottom: "1px solid var(--border)", userSelect: "none" };
const ptd: React.CSSProperties = { textAlign: "right", padding: "9px 10px", fontSize: 12.5, whiteSpace: "nowrap", borderBottom: "1px solid var(--border-soft)" };

export default function PaperTradingCard() {
  const [trades, setTrades] = useState<Enriched[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null); // trade abierto en detalle
  const [sendId, setSendId] = useState<string | null>(null);  // trade que se está llevando a real
  const [sortKey, setSortKey] = useState("pl");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetch("/api/paper").then((r) => r.json()).catch(() => ({ trades: [] }));
    const base: PaperTrade[] = d.trades ?? [];
    // Marca a mercado solo los abiertos.
    const enriched = await Promise.all(
      base.map(async (t) => ({ ...t, live: t.status === "open" ? await liveNet(t) : null }))
    );
    setTrades(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function close(t: Enriched) {
    if (t.live == null) return;
    await fetch("/api/paper", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close", id: t.id, exitNet: t.live, exitTime: new Date().toISOString() }),
    });
    load();
  }
  async function del(id: string) {
    await fetch("/api/paper", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    load();
  }
  // Borrar con confirmación (para los trades viejos que ya no tienen precio en vivo).
  function delConfirm(t: Enriched) {
    if (window.confirm(`¿Borrar este trade de la lista?\n\n${t.ticker} · ${labelNoDate(t.label)}\n\nSe quita del papel para siempre. No afecta dinero real.`)) {
      del(t.id);
    }
  }

  // P/L de un trade por contrato × 100 (multiplicador de opciones) × nº de estructuras.
  const plOf = (t: Enriched): number | null => {
    const exit = t.status === "closed" ? t.exitNet : t.live;
    if (exit == null) return null;
    // Débito: pagas entryNet, vale exit → ganas (exit - entryNet).
    let pl = (exit - t.entryNet) * 100 * t.qtyContracts;
    // Techo/piso REALES de un crédito: nunca ganas más que la prima recibida, ni
    // pierdes más que el riesgo. Sin esto, una opción vencida cotiza mal e infla el
    // P/L a números imposibles (p.ej. $173 en un spread cuyo máximo era $20).
    const maxProfit = maxProfitOf(t);
    if (maxProfit != null && pl > maxProfit) pl = maxProfit;
    const risk = riskOf(t);
    if (risk != null && pl < -risk * t.qtyContracts) pl = -risk * t.qtyContracts;
    return pl;
  };

  // Marcador: solo cuenta trades con P/L conocido.
  const scored = (trades ?? []).map(plOf).filter((x): x is number => x != null);
  const wins = scored.filter((x) => x > 0).length;
  const totalPL = scored.reduce((a, b) => a + b, 0);
  const winRate = scored.length ? Math.round((wins / scored.length) * 100) : null;

  const open = (trades ?? []).filter((t) => t.status === "open");
  const closed = (trades ?? []).filter((t) => t.status === "closed");

  // Orden de las tablas (clic en encabezado → invierte / ordena por él).
  const sortBy = (k: string) => {
    if (k === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir(k === "ticker" ? "asc" : "desc"); }
  };
  const arrow = (k: string) => (sortKey === k ? (sortDir === "desc" ? " ▼" : " ▲") : "");
  const valOf = (t: Enriched, k: string): number | string => {
    if (k === "ticker") return t.ticker;
    if (k === "pl") return plOf(t) ?? -1e12;
    if (k === "entrada") return t.entryNet;
    if (k === "riesgo") return riskOf(t) ?? 0;
    if (k === "pop") return popOf(t) ?? 0;
    if (k === "vence") return expOf(t);
    return 0;
  };
  const sortRows = (arr: Enriched[]) => [...arr].sort((a, b) => {
    const va = valOf(a, sortKey), vb = valOf(b, sortKey);
    const cmp = typeof va === "string" ? String(va).localeCompare(String(vb)) : (va as number) - (vb as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <section className="card" style={{ gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="card-title">📝 Paper Trading</div>
          <div className="card-sub">Trades simulados · prueba si el motor gana · sin dinero real</div>
        </div>
        <button type="button" onClick={load} disabled={loading}
          style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>
          {loading ? "…" : "↻"}
        </button>
      </div>

      {/* Marcador */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 90, background: "var(--panel-2)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Aciertos</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{winRate == null ? "—" : `${winRate}%`}</div>
        </div>
        <div style={{ flex: 1, minWidth: 90, background: "var(--panel-2)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>P/L total</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: totalPL >= 0 ? "#12b76a" : "#f04438" }}>
            {money0.format(totalPL)}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 90, background: "var(--panel-2)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Trades</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{scored.length}</div>
        </div>
      </div>

      {trades == null ? (
        <div className="feed-empty">Cargando…</div>
      ) : trades.length === 0 ? (
        <div className="feed-empty">
          Aún no hay trades en papel. Cuando el motor recomiende una idea, la registras aquí
          y Nagimi la sigue con precios reales para medir si gana. (El botón «Registrar» se
          añade en Recomendaciones en el siguiente paso.)
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <div>
              <div className="news-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Abiertos ({open.length})</span>
                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}>toca un encabezado para ordenar ▲▼</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
                Columna <b>¿Entrar?</b>: <span style={{ color: "#12b76a", fontWeight: 700 }}>🟢 Se puede</span> = aún da tiempo ·
                {" "}<span style={{ color: "#e0a800", fontWeight: 700 }}>🟡 Ya corrió</span> = la idea ya casi ganó todo, entrar ahora deja poco ·
                {" "}<span style={{ color: "#f04438", fontWeight: 700 }}>🔴 Venció</span> = fuera de tiempo, bórralo con 🗑. Pasa el mouse por encima para el detalle.
              </div>
              <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12, marginTop: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--panel)" }}>
                  <thead><tr>
                    <th style={{ ...pth, textAlign: "left", cursor: "pointer" }} onClick={() => sortBy("ticker")}>Trade{arrow("ticker")}</th>
                    <th style={{ ...pth, cursor: "pointer" }} onClick={() => sortBy("vence")}>📅 Vence{arrow("vence")}</th>
                    <th style={{ ...pth, cursor: "pointer" }} onClick={() => sortBy("pop")}>POP{arrow("pop")}</th>
                    <th style={{ ...pth, cursor: "pointer" }} onClick={() => sortBy("pl")}>P/L{arrow("pl")}</th>
                    <th style={{ ...pth, cursor: "pointer" }} onClick={() => sortBy("entrada")}>Entrada{arrow("entrada")}</th>
                    <th style={{ ...pth, cursor: "pointer" }} onClick={() => sortBy("riesgo")}>Riesgo{arrow("riesgo")}</th>
                    <th style={pth}>Fuente</th>
                    <th style={{ ...pth, textAlign: "center" }}>¿Entrar?</th>
                    <th style={pth}>Acciones</th>
                  </tr></thead>
                  <tbody>
                    {sortRows(open).map((t) => {
                      const pl = plOf(t);
                      const isOpen = openId === t.id;
                      const pop = popOf(t); const risk = riskOf(t);
                      const inProfit = pl != null && pl > 0;
                      return (
                        <Fragment key={t.id}>
                          <tr style={{ borderTop: "1px solid var(--border-soft)", background: isOpen || sendId === t.id ? "var(--panel-2)" : "transparent" }}>
                            <td style={{ ...ptd, textAlign: "left", cursor: "pointer", maxWidth: 260, whiteSpace: "normal" }} onClick={() => setOpenId(isOpen ? null : t.id)} title="Toca para ver el detalle y el porqué">
                              <span style={{ color: "var(--accent)", marginRight: 4 }}>{isOpen ? "▾" : "▸"}</span>
                              <b>{t.ticker}</b> <span style={{ color: "var(--muted)", fontSize: 12 }}>{labelNoDate(t.label)}</span>
                            </td>
                            <td style={ptd}>{expOf(t) || "—"}</td>
                            <td style={ptd}>{pop != null ? `${pop}%` : "—"}</td>
                            <td style={{ ...ptd, color: pl == null ? "var(--muted)" : pl >= 0 ? "#12b76a" : "#f04438", fontWeight: 700 }}>{pl == null ? "sin precio" : money0.format(pl)}</td>
                            <td style={ptd}>${px.format(t.entryNet)}</td>
                            <td style={ptd}>{risk != null ? `$${risk}` : "—"}</td>
                            <td style={{ ...ptd, textAlign: "center" }}>{t.source === "motor" ? "🤖" : "✍️"}</td>
                            <td style={{ ...ptd, textAlign: "center" }}>
                              {(() => { const e = entryStatus(t, pl); return (
                                <span title={e.tip} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700, color: e.color, border: `1px solid ${e.color}55`, borderRadius: 999, padding: "2px 8px", cursor: "help", whiteSpace: "nowrap" }}>
                                  {e.emoji} {e.label}
                                </span>
                              ); })()}
                            </td>
                            <td style={ptd}>
                              <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                                <button type="button" onClick={() => setSendId(sendId === t.id ? null : t.id)}
                                  title={inProfit ? "¡En ganancia!" : "Ejecutar si quieres"}
                                  style={{ fontSize: 11, background: sendId === t.id ? "var(--accent)" : (inProfit ? "#12b76a" : "transparent"), color: sendId === t.id || inProfit ? "#fff" : "var(--text)", border: sendId === t.id || inProfit ? "none" : "1px solid var(--accent)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontWeight: 700 }}>
                                  💵 Ejecutar
                                </button>
                                <button type="button" onClick={() => close(t)} disabled={t.live == null}
                                  title={t.live == null ? "Sin precio en vivo (la opción ya venció) — usa 🗑 para quitarlo" : "Cerrar a precio actual y pasar a Cerrados"}
                                  style={{ fontSize: 11, background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: t.live == null ? "var(--muted)" : "var(--text)", padding: "3px 8px", cursor: t.live == null ? "not-allowed" : "pointer", opacity: t.live == null ? 0.5 : 1 }}>
                                  Cerrar
                                </button>
                                <button type="button" onClick={() => delConfirm(t)}
                                  title="Borrar este trade de la lista (para los viejos)"
                                  style={{ fontSize: 11, background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--muted)", padding: "3px 8px", cursor: "pointer" }}>
                                  🗑
                                </button>
                              </div>
                            </td>
                          </tr>
                          {(sendId === t.id || isOpen) && (
                            <tr>
                              <td colSpan={9} style={{ padding: "0 10px 10px", background: "var(--panel-2)", borderBottom: "1px solid var(--border-soft)" }}>
                                {sendId === t.id && <SendPaperPanel t={t} />}
                                {isOpen && <TradeDetail t={t} entry={entryStatus(t, pl)} />}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {closed.length > 0 && (
            <div>
              <div className="news-head">Cerrados ({closed.length})</div>
              <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12, marginTop: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--panel)" }}>
                  <thead><tr>
                    <th style={{ ...pth, textAlign: "left", cursor: "pointer" }} onClick={() => sortBy("ticker")}>Trade{arrow("ticker")}</th>
                    <th style={{ ...pth, cursor: "pointer" }} onClick={() => sortBy("vence")}>📅 Vence{arrow("vence")}</th>
                    <th style={{ ...pth, cursor: "pointer" }} onClick={() => sortBy("pl")}>P/L{arrow("pl")}</th>
                    <th style={pth}>Fuente</th>
                    <th style={pth}></th>
                  </tr></thead>
                  <tbody>
                    {sortRows(closed).map((t) => {
                      const pl = plOf(t);
                      const isOpen = openId === t.id;
                      return (
                        <Fragment key={t.id}>
                          <tr style={{ borderTop: "1px solid var(--border-soft)", background: isOpen ? "var(--panel-2)" : "transparent" }}>
                            <td style={{ ...ptd, textAlign: "left", cursor: "pointer", maxWidth: 260, whiteSpace: "normal" }} onClick={() => setOpenId(isOpen ? null : t.id)}>
                              <span style={{ color: "var(--accent)", marginRight: 4 }}>{isOpen ? "▾" : "▸"}</span>
                              <b>{t.ticker}</b> <span style={{ color: "var(--muted)", fontSize: 12 }}>{labelNoDate(t.label)}</span>
                            </td>
                            <td style={ptd}>{expOf(t) || "—"}</td>
                            <td style={{ ...ptd, color: pl != null && pl >= 0 ? "#12b76a" : "#f04438", fontWeight: 700 }}>{pl == null ? "—" : money0.format(pl)}</td>
                            <td style={{ ...ptd, textAlign: "center" }}>{t.source === "motor" ? "🤖" : "✍️"}</td>
                            <td style={{ ...ptd, textAlign: "center" }}>
                              <button type="button" onClick={() => del(t.id)} title="Borrar"
                                style={{ fontSize: 12, background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer" }}>✕</button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr><td colSpan={5} style={{ padding: "0 10px 10px", background: "var(--panel-2)", borderBottom: "1px solid var(--border-soft)" }}><TradeDetail t={t} /></td></tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="disclaimer">Simulación con fines de estudio. No es dinero real ni consejo financiero.</div>
    </section>
  );
}
