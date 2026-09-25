"use client";

/**
 * 🎟️ Ticket del día: la idea de los muros de dinero traducida a UN contrato
 * concreto — qué comprar, dónde tomar la ganancia, dónde salir si falla, cuánto
 * cuesta y si el dinero grande está comprando lo mismo.
 *
 * El diseño sigue el "GEX Ticket" que comparte la comunidad (la idea arriba,
 * el contrato en grande, tres cajas y una fila de datos), pero en palabras
 * simples y con lo que el original no dice: si cabe con tu regla de riesgo.
 * El texto para copiar sale de lib/ticketTexto.ts (con pruebas).
 */
import { useCallback, useEffect, useState } from "react";
import { cabeEnCuenta, cuandoVence, lineasTicket, ticketComoTexto, REGLA_RIESGO_PCT } from "@/lib/ticketTexto";
import { fraseBarridas, type Barridas } from "@/lib/barridas";

interface Ticket {
  strike: number; type: "call" | "put"; expiration: string | null; symbol: string | null;
  bid: number; ask: number; mid: number; delta: number; gamma: number; iv: number | null;
  volume: number; oi: number; spreadPct: number;
  targetPx: number; stopPx: number; rbOption: number;
  cost: number; risk: number; gain: number; gainPct: number; lossPct: number;
  riskPctOfCapital: number | null; costPctOfCapital: number | null;
  approxPop: number; warning: string | null;
}
interface Setup { direction: "long" | "short"; entry: number; target: number; stop: number; reason: string; rr: number }
interface Verdict { status: "ready" | "wait"; reason: string; rr: number }
interface Resp {
  error?: string;
  levels?: { spot: number; magnet: number | null; regime: string; source: string };
  setup?: Setup | null; verdict?: Verdict | null; ticket?: Ticket | null;
  ticketReason?: string | null; noSetup?: string; expiration?: string | null;
  chainSource?: string | null; simulated?: boolean; estrategia?: "iman" | "empujon";
  flujoRevisado?: boolean; flujoPremium?: number;
  flujoFuente?: string | null; flujoVelocidad?: number | null;
  barridas?: Barridas | null;
}

const d2 = (n: number) => `$${n.toFixed(2)}`;
const d0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const nivel = (n: number) => (n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toFixed(2));

export default function TicketCard({ ticker, capital = 100 }: { ticker: string; capital?: number }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [cap, setCap] = useState(capital);
  const [copiado, setCopiado] = useState(false);

  const load = useCallback(async (c: number) => {
    if (!ticker) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/ticket?ticker=${encodeURIComponent(ticker)}&capital=${c}`).then((x) => x.json());
      setData(r);
    } catch {
      setData({ error: "No se pudo cargar el ticket." });
    }
    setLoading(false);
  }, [ticker]);

  useEffect(() => { load(cap); }, [load, cap]);

  // Recuerda el capital entre visitas.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("nagimi.capitalDia"));
      if (saved > 0) setCap(saved);
    } catch { /* sin localStorage */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("nagimi.capitalDia", String(cap)); } catch { /* no-op */ }
  }, [cap]);

  const t = data?.ticket;
  const setup = data?.setup;
  const ready = data?.verdict?.status === "ready";
  const sube = setup?.direction === "long";
  const empujon = data?.estrategia === "empujon";
  const ahora = new Date();

  const copiar = () => {
    if (!t || !setup) return;
    const texto = ticketComoTexto(lineasTicket({
      ticker, setup, ticket: t, estrategia: data?.estrategia ?? "iman", capital: cap, ahora: new Date(),
    }));
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    }).catch(() => { /* sin permiso de portapapeles */ });
  };

  const cabe = t ? cabeEnCuenta(t.risk, cap) : null;
  const barrida = fraseBarridas(data?.barridas ?? null);
  const venceHoy = t ? cuandoVence(t.expiration, ahora) === "vence hoy" : false;

  return (
    <section className={`card tk ${setup ? (ready ? (sube ? "tk-up" : "tk-down") : "tk-wait") : ""}`}>
      <div className="tk-head">
        <div className="tk-titulo">
          🎟️ Ticket <span className="tk-titulo-sub">— contrato sugerido · {ticker}</span>
        </div>
        <div className="tk-head-der">
          {setup && (
            <span className={`tk-badge ${ready ? (sube ? "up" : "down") : "wait"}`}>
              {ready ? "COMPRA" : "ESPERA"}
            </span>
          )}
          <label className="tk-cuenta">
            Mi cuenta $
            <input type="number" min={20} step={10} value={cap}
              onChange={(e) => setCap(Math.max(20, Number(e.target.value) || 20))} />
          </label>
        </div>
      </div>

      {loading && <div className="tk-nota">Buscando el mejor contrato con los datos de ahora…</div>}
      {data?.error && <div className="tk-nota" style={{ color: "var(--red-soft)" }}>⚠️ {data.error}</div>}

      {data?.simulated && (
        <div className="tk-aviso">🧪 Escenario simulado — no es la situación real del mercado ahora mismo.</div>
      )}

      {/* No hay idea hoy: se explica por qué, en vez de callar. */}
      {!loading && data && !setup && !data.error && (
        <div className="tk-sin"><b>Hoy no hay entrada.</b> {data.noSetup}</div>
      )}

      {setup && (
        <div className="tk-tesis">
          La idea: <b style={{ color: sube ? "var(--green)" : "var(--red-soft)" }}>{sube ? "▲ que sube" : "▼ que baja"}</b>
          {" "}— {empujon ? "ir con el empujón" : "vuelta al imán"} hasta <b>{nivel(setup.target)}</b>
          {" "}· salir si {sube ? "baja" : "sube"} a <b>{nivel(setup.stop)}</b>
          {" "}<span className="tk-gris">({empujon ? "día de empujón" : "día de rango"} · {ticker} ahora en {nivel(setup.entry)})</span>
          {!ready && data?.verdict?.reason && <div className="tk-espera">⏳ {data.verdict.reason}</div>}
        </div>
      )}

      {/* El contrato concreto */}
      {setup && t && (
        <>
          <div className="tk-contrato">
            <span className={`tk-badge ${ready ? (t.type === "call" ? "up" : "down") : "wait"}`}>{ready ? "COMPRA" : "SI SE DA"}</span>
            <span className="tk-simbolo">{ticker} {nivel(t.strike)} {t.type === "call" ? "CALL" : "PUT"}</span>
            <span className="tk-a">a</span>
            <span className="tk-precio">{d2(t.mid)}</span>
            <span className="tk-gris">
              te pagan {d2(t.bid)} / te cobran {d2(t.ask)}{t.expiration ? ` · ${cuandoVence(t.expiration, ahora)}` : ""}
            </span>
          </div>
          <div className="tk-gris" style={{ marginTop: -4 }}>
            {t.type === "call" ? "Un CALL es una apuesta a que sube." : "Un PUT es una apuesta a que baja."}
          </div>

          <div className="tk-cajas">
            <div className="tk-caja">
              <div className="tk-caja-label">Meta — toma la ganancia</div>
              <div className="tk-caja-valor" style={{ color: "var(--green)" }}>{d2(t.targetPx)}</div>
              <div className="tk-caja-sub">{ticker} en {nivel(setup.target)} · <b style={{ color: "var(--green)" }}>+{Math.round(t.gainPct)}%</b></div>
            </div>
            <div className="tk-caja">
              <div className="tk-caja-label">Salida si falla</div>
              <div className="tk-caja-valor" style={{ color: "var(--red-soft)" }}>{d2(t.stopPx)}</div>
              <div className="tk-caja-sub">{ticker} en {nivel(setup.stop)} · <b style={{ color: "var(--red-soft)" }}>−{Math.round(t.lossPct)}%</b></div>
            </div>
            <div className="tk-caja">
              <div className="tk-caja-label">Ganas por cada $1 que arriesgas</div>
              <div className="tk-caja-valor">{t.rbOption.toFixed(1)}</div>
              <div className="tk-caja-sub">
                en la acción serían {setup.rr.toFixed(1)}; el contrato {t.rbOption >= setup.rr ? "lo sube porque acelera" : "lo baja porque se mueve menos"} cuando el precio va a tu favor
              </div>
            </div>
          </div>

          <div className="tk-chips">
            <span className="tk-chip">se mueve <b>{Math.round(t.delta * 100)}%</b> de lo que se mueva {ticker}</span>
            {t.iv != null && <span className="tk-chip">nerviosismo <b>{Math.round(t.iv * 100)}%</b></span>}
            <span className="tk-chip">negociados hoy <b>{t.volume.toLocaleString("en-US")}</b></span>
            <span className="tk-chip">contratos abiertos <b>{t.oi.toLocaleString("en-US")}</b></span>
            <span className="tk-chip">diferencia compra/venta <b>{(t.spreadPct * 100).toFixed(1)}%</b></span>
            <span className="tk-chip">cuesta <b>{d0(t.cost)}</b></span>
            <span className="tk-chip">arriesgas <b>{d0(t.risk)}</b>/contrato</span>
            <span className="tk-chip">prob. de ganar ≈ <b>{Math.round(t.approxPop)}%</b></span>
            {barrida && <span className={`tk-chip tk-chip-${barrida.tono}`}>{barrida.texto}</span>}
          </div>

          {cabe && (
            cabe.contratos >= 1
              ? <div className="tk-regla ok">✅ Con tu regla del {REGLA_RIESGO_PCT}% ({d0(cabe.permitido)} de pérdida máxima) te {cabe.contratos === 1 ? "cabe 1 contrato" : `caben ${cabe.contratos} contratos`}.</div>
              : <div className="tk-regla no">⛔ No cabe en tu regla del {REGLA_RIESGO_PCT}%: puedes perder hasta {d0(cabe.permitido)} y este contrato arriesga {d0(t.risk)}. Míralo para aprender, pero no lo tomes con esta cuenta.</div>
          )}

          {t.warning && <div className="tk-aviso">⚠️ {t.warning}</div>}

          <div className="tk-pie">
            {venceHoy
              ? "⏱ Ojo con el tiempo: este contrato se acaba hoy. Si el movimiento es lento, cada minuto que pasa se come la ganancia — llega a la meta a tiempo o sal. "
              : "⏱ Cada día que pasa el contrato pierde un poco de valor aunque el precio no se mueva. "}
            Es un cálculo a partir de dónde está apilado el dinero, no un consejo: tú decides y ejecutas.
          </div>

          <button type="button" className="tk-copiar" onClick={copiar}>
            {copiado ? "✓ Copiado" : "📋 Copiar ticket"}
          </button>
        </>
      )}

      {setup && !t && data?.ticketReason && (
        <div className="tk-sin"><b>Sin contrato que te sirva todavía.</b> {data.ticketReason}</div>
      )}

      {/* De dónde salió la dirección */}
      {setup && data?.flujoRevisado === false && (
        <div className="tk-nota" style={{ color: "#e0a800" }}>
          ⚠️ No se pudo revisar hacia dónde va el dinero hoy (falta conectar MarketSnack): esto solo comprueba
          que la ganancia compense el riesgo, no si el dinero va en contra.
        </div>
      )}
      {setup && data?.flujoRevisado && (
        <div className="tk-nota">
          ✓ Se revisó hacia dónde va el dinero hoy{data.flujoPremium ? ` (${d0(data.flujoPremium)} apostados en opciones)` : ""}.
          {data.flujoVelocidad != null
            ? <> Las órdenes entran a <b>{data.flujoVelocidad.toFixed(1)}×</b> su ritmo normal
                {data.flujoVelocidad >= 1.5 ? " (van rápido)" : data.flujoVelocidad <= 0.6 ? " (tranquilas)" : ""}.</>
            : " No se pudo medir qué tan rápido entran las órdenes (la conexión de Tastytrade no está prendida)."}
        </div>
      )}

      <div className="tk-nota">
        Nagimi propone, tú decides y ejecutas — nunca envía órdenes solo.
        {data?.chainSource && ` · contratos leídos de: ${data.chainSource}`}
        {data?.levels && ` · muros: ${data.levels.source}`}
      </div>
    </section>
  );
}
