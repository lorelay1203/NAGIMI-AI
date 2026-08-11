"use client";

// Order Builder + Vista Previa — elige una ESTRATEGIA (single, vertical, crédito,
// butterfly, condor, iron condor); arma las patas y te dice qué colocar.
// NO ejecuta nada: tú las pones en tu broker.

import { useEffect, useMemo, useState } from "react";
import { occSymbol, legNet, generateLegs, STRATEGIES, type OrderDraft, type Strategy, type Side } from "@/lib/orderBuilder";
import { analyzeStrategy, strategyBias, adjustPop, type PayoffLeg } from "@/lib/payoff";
import GreeksPanel from "./GreeksPanel";
import PayoffChart from "./PayoffChart";
import SendToTastytrade from "./SendToTastytrade";
import { px } from "../format";

const money = (n: number) => "$" + px.format(Math.abs(n));

export interface OrderPrefill {
  spot: number | null;
  direction: "up" | "down" | "flat" | null;
  confidence: number | null;
  callWall: number | null;
  putWall: number | null;
}

interface Leg {
  side: Side;
  optionType: "call" | "put";
  strike: number;
  quantity: number;
  limitPrice: number;
  quote: { bid: number; ask: number; mid: number; iv?: number | null } | null;
}

const field: React.CSSProperties = {
  background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8,
  color: "var(--text)", padding: "8px 10px", fontSize: 13, width: "100%",
};
const statLbl: React.CSSProperties = { fontSize: 10.5, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em" };
const statVal: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "var(--text)", marginTop: 2 };

export default function OrderBuilder({ ticker, prefill }: { ticker: string; prefill: OrderPrefill }) {
  const [strategy, setStrategy] = useState<Strategy>("single");
  const [baseType, setBaseType] = useState<"call" | "put">("call");
  const [center, setCenter] = useState<number>(0);
  const [width, setWidth] = useState<number>(5);
  const [expiration, setExpiration] = useState<string>("");
  const [accountSize, setAccountSize] = useState<number>(0);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function build(strat: Strategy, type: "call" | "put", c: number, w: number) {
    if (!(c > 0)) { setLegs([]); return; }
    setLegs(generateLegs(strat, type, c, w).map((g) => ({ ...g, limitPrice: 0, quote: null })));
    setMsg(null);
  }

  // Sembrar con el análisis al cambiar de ticker.
  useEffect(() => {
    const type: "call" | "put" = prefill.direction === "down" ? "put" : "call";
    const wall = type === "call" ? prefill.callWall : prefill.putWall;
    const c = wall ?? (prefill.spot ? Math.round(prefill.spot) : 0);
    setBaseType(type); setCenter(c); setStrategy("single"); setExpiration("");
    setLegs(generateLegs("single", type, c, 5).map((g) => ({ ...g, limitPrice: 0, quote: null })));
  }, [ticker, prefill]);

  const patch = (i: number, p: Partial<Leg>) => setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...p } : l)));

  // Trae el precio (mid) real de una lista de patas para un vencimiento.
  async function priceLegs(legList: Leg[], exp: string): Promise<Leg[]> {
    return Promise.all(legList.map(async (l) => {
      const url = `/api/quote?ticker=${encodeURIComponent(ticker)}&type=${l.optionType}&strike=${l.strike}&expiration=${encodeURIComponent(exp)}`;
      const q = await fetch(url).then((x) => x.json()).catch(() => null);
      if (q && !q.error) return { ...l, limitPrice: Math.round(q.mid * 100) / 100, quote: { bid: q.bid, ask: q.ask, mid: q.mid, iv: q.iv } };
      return l;
    }));
  }

  async function fetchPrices() {
    if (!expiration) { setMsg("Pon el vencimiento primero."); return; }
    if (legs.length === 0) { setMsg("Genera la estrategia primero."); return; }
    setLoading(true); setMsg(null);
    const updated = await priceLegs(legs, expiration);
    setLegs(updated);
    setLoading(false);
    if (updated.every((l) => !l.quote)) setMsg("No se encontraron precios (revisa vencimiento/strikes).");
  }

  // Sugiere strike central + ancho + vencimiento que quepan en tu cuenta, y trae precios.
  async function suggestFit() {
    if (!ticker) return;
    setLoading(true); setMsg(null);
    const url = `/api/suggest-strategy?ticker=${encodeURIComponent(ticker)}&strategy=${strategy}&type=${baseType}&budget=${accountSize || 0}`;
    const r = await fetch(url).then((x) => x.json()).catch(() => ({ error: "Fallo de red" }));
    if (r.error) { setLoading(false); setMsg("⚠ " + r.error); return; }
    const newLegs: Leg[] = generateLegs(strategy, baseType, r.center, r.width).map((g) => ({ ...g, limitPrice: 0, quote: null }));
    setCenter(r.center); setWidth(r.width); setExpiration(r.expiration);
    const pricedLegs = await priceLegs(newLegs, r.expiration);
    setLegs(pricedLegs);
    setLoading(false);
  }

  const draftOf = (l: Leg): OrderDraft => ({ underlying: ticker, optionType: l.optionType, strike: l.strike, expiration, side: l.side, quantity: l.quantity, limitPrice: l.limitPrice });
  const priced = legs.length > 0 && legs.every((l) => l.limitPrice > 0) && !!expiration;
  const net = legs.reduce((s, l) => s + legNet(draftOf(l)), 0); // >0 débito (pagas), <0 crédito (recibes)
  const isDebit = net >= 0;

  // Referencia estable: si cambia, el panel de envío invalida su revisión previa.
  const orderLegs = useMemo(
    () => legs.map((l) => ({ side: l.side, optionType: l.optionType, strike: l.strike, quantity: l.quantity })),
    [legs],
  );

  const spot = prefill.spot ?? 0;
  const daysToExp = expiration ? Math.max(1, Math.round((new Date(expiration + "T00:00:00").getTime() - Date.now()) / 86_400_000)) : 0;
  const ivs = legs.map((l) => l.quote?.iv).filter((x): x is number => typeof x === "number" && x > 0 && x < 5);
  const avgIV = ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : 0;
  const payoffLegs: PayoffLeg[] = legs.map((l) => ({ side: l.side, optionType: l.optionType, strike: l.strike, quantity: l.quantity, limitPrice: l.limitPrice }));
  const payoff = priced && spot > 0 && daysToExp > 0 ? analyzeStrategy(payoffLegs, spot, avgIV, daysToExp) : null;
  const bias = strategyBias(strategy, baseType);
  const adjPop = payoff ? adjustPop(payoff.pop, bias, prefill.direction, prefill.confidence) : 0;
  const aligned = prefill.direction != null ? (bias === prefill.direction || (bias === "flat" && prefill.direction === "flat")) : null;
  const lossAmt = payoff ? Math.abs(payoff.maxLoss) : 0;
  const over = accountSize > 0 && lossAmt > accountSize;
  const pct = accountSize > 0 ? (lossAmt / accountSize) * 100 : 0;

  return (
    <section className="card" style={{ gap: 14 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>🧾 Order Builder + Estrategias · {ticker}</div>
        <div className="card-sub">
          Elige una estrategia, arma las patas y trae los precios reales. Nagimi la revisa en Tastytrade,
          pero <b>el envío lo confirmas tú</b>.
        </div>
      </div>

      {/* Selector de estrategia */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {STRATEGIES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => { setStrategy(s.id); build(s.id, baseType, center, width); }}
            style={{
              padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
              border: strategy === s.id ? "1px solid var(--accent)" : "1px solid var(--border)",
              background: strategy === s.id ? "var(--accent)" : "transparent", color: strategy === s.id ? "#fff" : "var(--text)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Parámetros */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {strategy !== "iron_condor" && (
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Tipo</label>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              {(["call", "put"] as const).map((t) => (
                <button key={t} type="button" onClick={() => { setBaseType(t); build(strategy, t, center, width); }}
                  style={{ padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600, border: baseType === t ? "1px solid var(--accent)" : "1px solid var(--border)", background: baseType === t ? "var(--accent)" : "transparent", color: baseType === t ? "#fff" : "var(--text)" }}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Strike central ($)</label>
          <input type="number" style={{ ...field, marginTop: 4 }} value={center || ""} onChange={(e) => { const v = Number(e.target.value); setCenter(v); build(strategy, baseType, v, width); }} />
        </div>
        {strategy !== "single" && (
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Ancho ($ entre strikes)</label>
            <input type="number" style={{ ...field, marginTop: 4 }} value={width || ""} onChange={(e) => { const v = Number(e.target.value); setWidth(v); build(strategy, baseType, center, v); }} />
          </div>
        )}
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Vencimiento</label>
          <input type="date" style={{ ...field, marginTop: 4 }} value={expiration} onChange={(e) => setExpiration(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Tamaño de tu cuenta ($)</label>
          <input type="number" style={{ ...field, marginTop: 4 }} placeholder="para el %" value={accountSize || ""} onChange={(e) => setAccountSize(Number(e.target.value))} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={suggestFit} disabled={loading} style={{ background: "#2ec77f", color: "#062", border: "none", borderRadius: 8, padding: "9px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
          {loading ? "Calculando…" : "🎯 Sugerir según mi cuenta"}
        </button>
        <button type="button" onClick={fetchPrices} disabled={loading} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
          {loading ? "Trayendo precios…" : "💲 Traer precios reales (mid)"}
        </button>
        {msg && <span style={{ fontSize: 12, color: "var(--amber-text)" }}>{msg}</span>}
      </div>

      {/* Patas */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {legs.map((l, i) => {
          const sym = l.strike > 0 && expiration ? occSymbol(ticker, expiration, l.optionType, l.strike) : "—";
          return (
            <div key={i} style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, color: l.side === "buy" ? "#4ad991" : "#ff8a82", border: `1px solid ${l.side === "buy" ? "#2ec77f" : "#ff5d52"}` }}>
                {l.side === "buy" ? "COMPRAR" : "VENDER"}
              </span>
              <span style={{ fontWeight: 600, color: l.optionType === "call" ? "#4ad991" : "#ff8a82" }}>{l.quantity}× {l.optionType.toUpperCase()} ${l.strike}</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                Límite $<input type="number" step="0.01" value={l.limitPrice || ""} onChange={(e) => patch(i, { limitPrice: Number(e.target.value) })} style={{ width: 64, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "3px 6px", fontSize: 12 }} />
                {l.quote && <span> · bid ${l.quote.bid.toFixed(2)} / ask ${l.quote.ask.toFixed(2)}</span>}
              </span>
              <code style={{ marginLeft: "auto", background: "var(--panel)", padding: "1px 6px", borderRadius: 5, fontSize: 11, color: "var(--muted)" }}>{sym}</code>
            </div>
          );
        })}
      </div>

      {/* Resumen */}
      <div style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        {priced ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: isDebit ? "#ff8a82" : "#4ad991" }}>
              {isDebit ? `Débito neto: ${money(net)} (PAGAS)` : `Crédito neto: ${money(net)} (RECIBES)`}
            </div>
            {payoff ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 10 }}>
                  <div><div style={statLbl}>🟢 Ganancia máxima</div><div style={{ ...statVal, color: "#4ad991" }}>{payoff.unbounded ? "≈ ilimitada" : money(payoff.maxGain)}</div></div>
                  <div><div style={statLbl}>🔴 Pérdida máxima</div><div style={{ ...statVal, color: "#ff8a82" }}>{money(lossAmt)}</div></div>
                  <div><div style={statLbl}>Prob. ganancia (por IV)</div><div style={statVal}>{Math.round(payoff.pop * 100)}%</div></div>
                  <div>
                    <div style={statLbl}>Prob. ganancia (ajustada)</div>
                    <div style={statVal}>{Math.round(adjPop * 100)}%</div>
                    {aligned != null && <div style={{ fontSize: 10.5, color: aligned ? "#4ad991" : "#f5c451" }}>{aligned ? "✓ coincide con el análisis" : "⚠ va contra el análisis"}</div>}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Prob. pérdida ≈ <b style={{ color: "var(--text)" }}>{Math.round((1 - adjPop) * 100)}%</b>
                  {payoff.breakevens.length > 0 && <> · Break-even {payoff.breakevens.map((b) => "$" + b).join(" / ")}</>}
                  {accountSize > 0 && <> · Pérdida máx = <b style={{ color: over ? "#ff8a82" : "var(--text)" }}>{pct.toFixed(1)}%</b> de tu cuenta</>}
                </div>
                {over && (
                  <div style={{ padding: "8px 10px", borderRadius: 8, background: "var(--red-bg)", border: "1px solid rgba(255,93,82,0.4)", color: "#ff9b94", fontWeight: 600, fontSize: 13 }}>
                    ⚠️ La pérdida máxima ({money(lossAmt)}) supera tu cuenta ({money(accountSize)}).
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  La prob. &quot;por IV&quot; es estadística (lognormal · IV {(avgIV * 100).toFixed(0)}% · {daysToExp}d). La &quot;ajustada&quot; la mueve ±15% según dirección y confianza de los agentes. No es garantía.
                </div>
                <PayoffChart legs={payoffLegs} spot={spot} breakevens={payoff.breakevens} />
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Faltan datos (precio del subyacente o IV) para la ganancia/probabilidad. Pulsa <b>Traer precios</b>.</div>
            )}
          </>
        ) : (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Pon el vencimiento y pulsa <b>Traer precios</b> (o escribe los límites) para ver el análisis completo.</div>
        )}
      </div>

      {/* Griegos + volumen + OI por pata (datos reales para corroborar) */}
      {expiration && legs.length > 0 && (
        <GreeksPanel
          ticker={ticker}
          expiration={expiration}
          legs={orderLegs}
        />
      )}

      {priced && (
        <SendToTastytrade
          ticker={ticker}
          expiration={expiration}
          legs={orderLegs}
          price={Math.abs(net) / 100}
          priceEffect={isDebit ? "Debit" : "Credit"}
        />
      )}

      <div className="disclaimer">Nagimi prepara la estrategia y la revisa en tu broker. El envío lo confirmas TÚ. No es consejo financiero.</div>
    </section>
  );
}
