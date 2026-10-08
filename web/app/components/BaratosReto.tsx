"use client";

/**
 * 🎟️ Lo que te cabe hoy: los contratos que caben con el saldo del reto, en
 * varias acciones, hacia el imán del día. Con $10 SÍ caben opciones (baratas y
 * lejanas); aquí se enseñan con su probabilidad real y lo que pagarían.
 * La lógica vive en lib/contratosBaratos.ts (con pruebas).
 */
import { useCallback, useEffect, useState } from "react";
import type { Barato } from "@/lib/contratosBaratos";

interface Fila {
  ticker: string;
  espejoDe: string | null;
  sinPrecios: boolean;
  preciosDeAyer: boolean;
  expiration: string | null;
  contratos: (Barato & { frase: string })[];
  error: string | null;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nivel = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export default function BaratosReto({ saldoInicial }: { saldoInicial: number }) {
  const [saldo, setSaldo] = useState(saldoInicial);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [cargando, setCargando] = useState(false);

  const buscar = useCallback((s: number) => {
    if (!(s > 0)) return;
    setCargando(true);
    fetch(`/api/reto/baratos?saldo=${s}`)
      .then((r) => r.json())
      .then((r: { filas?: Fila[] }) => setFilas(r.filas ?? []))
      .catch(() => setFilas([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { buscar(saldoInicial); }, [buscar, saldoInicial]);

  const todos = (filas ?? []).flatMap((f) => f.contratos.map((c) => ({ ...c, espejoDe: f.espejoDe })))
    .sort((a, b) => Number(b.pagaEnMeta) - Number(a.pagaEnMeta) || (b.probPct ?? 0) - (a.probPct ?? 0));
  const deAyer = (filas ?? []).some((f) => f.preciosDeAyer);

  return (
    <div className="br">
      <div className="br-head">
        <div>
          <div className="br-titulo">🎟️ Lo que te cabe hoy</div>
          <div className="br-sub">Contratos que se pagan con tu saldo, hacia el imán del día. Del más probable al menos.</div>
        </div>
        <label className="br-saldo">
          Con $
          <input type="number" min={1} step={1} value={saldo}
            onChange={(e) => setSaldo(Math.max(1, Number(e.target.value) || 1))}
            onBlur={() => buscar(saldo)}
            onKeyDown={(e) => { if (e.key === "Enter") buscar(saldo); }} />
        </label>
      </div>

      {deAyer && (
        <div className="br-aviso">🕘 El mercado no ha abierto: estos son precios del cierre de ayer. Cambian al abrir — vuelve a mirar después de las 10:30 AM.</div>
      )}
      {cargando && <div className="br-gris">Buscando en SPY, QQQ, IWM, TSLA, NVDA, AMD, PLTR y SOFI…</div>}
      {!cargando && filas && todos.length === 0 && (
        <div className="br-gris">Ahora mismo no salió ningún contrato con comprador que cueste {money(saldo)} o menos. Vuelve a mirar con el mercado abierto.</div>
      )}

      {todos.length > 0 && (
        <div className="br-lista">
          {todos.map((c) => (
            <div key={`${c.ticker}-${c.type}-${c.strike}`} className={`br-item ${c.type === "call" ? "up" : "down"}`}>
              <div className="br-item-top">
                <b>{c.ticker} {nivel(c.strike)} {c.type === "call" ? "CALL" : "PUT"}</b>
                {c.espejoDe && <span className="br-gris"> · muros del {c.espejoDe}</span>}
                <span className="br-precio">{money(c.costo)}</span>
              </div>
              <div className="br-chips">
                <span>vence {c.expiration ?? "—"}</span>
                <span>te caben <b>{c.contratos}</b></span>
                <span>prob. ≈ <b>{c.probPct != null ? `${Math.round(c.probPct)}%` : "—"}</b></span>
                <span>tiene que {c.type === "call" ? "subir" : "bajar"} <b>{c.distanciaPct}%</b></span>
                {c.pagaEnMeta
                  ? <span className="br-ok">paga en el imán: ~{money(c.valorEnMeta * 100)} ({c.multiplicador}×)</span>
                  : <span className="br-lejos">lotería: más lejos que el imán</span>}
              </div>
              <div className="br-frase">{c.frase}</div>
            </div>
          ))}
        </div>
      )}

      <div className="br-gris" style={{ fontSize: 11.5 }}>
        Para venderlo de vuelta: pon una orden <b>límite</b> de venta apenas suba (por ejemplo al doble) — en contratos de centavos
        no esperes al final, porque se van a $0 rápido. Material de estudio, no consejo financiero.
      </div>
    </div>
  );
}
