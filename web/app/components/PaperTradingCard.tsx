"use client";

// Tarjeta de PAPER TRADING — trades simulados con P/L en vivo y marcador de aciertos.
// Sirve para probar si el motor gana ANTES de arriesgar dinero real. Sin ejecución.

import { useCallback, useEffect, useState } from "react";
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
function TradeDetail({ t }: { t: PaperTrade }) {
  return (
    <div style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "12px 14px", marginTop: 6, display: "flex", flexDirection: "column", gap: 10 }}>
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

export default function PaperTradingCard() {
  const [trades, setTrades] = useState<Enriched[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null); // trade abierto en detalle
  const [sendId, setSendId] = useState<string | null>(null);  // trade que se está llevando a real

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

  // P/L de un trade por contrato × 100 (multiplicador de opciones) × nº de estructuras.
  const plOf = (t: Enriched): number | null => {
    const exit = t.status === "closed" ? t.exitNet : t.live;
    if (exit == null) return null;
    // Débito: pagas entryNet, vale exit → ganas (exit - entryNet).
    return (exit - t.entryNet) * 100 * t.qtyContracts;
  };

  // Marcador: solo cuenta trades con P/L conocido.
  const scored = (trades ?? []).map(plOf).filter((x): x is number => x != null);
  const wins = scored.filter((x) => x > 0).length;
  const totalPL = scored.reduce((a, b) => a + b, 0);
  const winRate = scored.length ? Math.round((wins / scored.length) * 100) : null;

  const open = (trades ?? []).filter((t) => t.status === "open");
  const closed = (trades ?? []).filter((t) => t.status === "closed");

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
              <div className="news-head">Abiertos ({open.length})</div>
              {open.map((t) => {
                const pl = plOf(t);
                const isOpen = openId === t.id;
                return (
                  <div key={t.id} style={{ borderTop: "1px solid var(--border-soft)", padding: "8px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div onClick={() => setOpenId(isOpen ? null : t.id)} style={{ cursor: "pointer", flex: 1 }}
                        title="Toca para ver por qué el motor eligió este trade">
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          <span style={{ color: "var(--accent)", marginRight: 4 }}>{isOpen ? "▾" : "▸"}</span>
                          {t.ticker} · {t.label}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                          entrada ${px.format(t.entryNet)} · {t.qtyContracts}x · {t.source === "motor" ? "🤖 motor" : "✍️ manual"} · <span style={{ color: "var(--accent)" }}>ver por qué</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, color: pl == null ? "var(--muted)" : pl >= 0 ? "#12b76a" : "#f04438" }}>
                          {pl == null ? "sin precio" : money0.format(pl)}
                        </div>
                        <div style={{ display: "flex", gap: 5, marginTop: 3, justifyContent: "flex-end" }}>
                          <button type="button" onClick={() => setSendId(sendId === t.id ? null : t.id)}
                            title={pl != null && pl > 0 ? "¡En ganancia!" : "Ejecutar este trade si quieres"}
                            style={{ fontSize: 11, background: sendId === t.id ? "var(--accent)" : (pl != null && pl > 0 ? "#12b76a" : "transparent"), color: sendId === t.id || (pl != null && pl > 0) ? "#fff" : "var(--text)", border: sendId === t.id || (pl != null && pl > 0) ? "none" : "1px solid var(--accent)", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontWeight: 700 }}>
                            💵 Ejecutar{pl != null && pl > 0 ? " (en ganancia)" : ""}
                          </button>
                          <button type="button" onClick={() => close(t)} disabled={t.live == null}
                            style={{ fontSize: 11, background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "2px 8px", cursor: "pointer" }}>
                            Cerrar
                          </button>
                        </div>
                      </div>
                    </div>
                    {sendId === t.id && <SendPaperPanel t={t} />}
                    {isOpen && <TradeDetail t={t} />}
                  </div>
                );
              })}
            </div>
          )}

          {closed.length > 0 && (
            <div>
              <div className="news-head">Cerrados ({closed.length})</div>
              {closed.map((t) => {
                const pl = plOf(t);
                const isOpen = openId === t.id;
                return (
                  <div key={t.id} style={{ borderTop: "1px solid var(--border-soft)", padding: "6px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div onClick={() => setOpenId(isOpen ? null : t.id)} style={{ cursor: "pointer", fontSize: 12.5, flex: 1 }}
                        title="Toca para ver por qué el motor eligió este trade">
                        <span style={{ color: "var(--accent)", marginRight: 4 }}>{isOpen ? "▾" : "▸"}</span>
                        {t.ticker} · {t.label}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, color: pl != null && pl >= 0 ? "#12b76a" : "#f04438" }}>
                          {pl == null ? "—" : money0.format(pl)}
                        </span>
                        <button type="button" onClick={() => del(t.id)}
                          style={{ fontSize: 11, background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                    {isOpen && <TradeDetail t={t} />}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="disclaimer">Simulación con fines de estudio. No es dinero real ni consejo financiero.</div>
    </section>
  );
}
