"use client";

// 💼 Portafolio — la respuesta a la página "Portafolio" de FinAnalista.
//
// Allá es una lista de logos de brókers y un botón de conectar: la cuenta de
// Lorelay está vacía ("Aún no hay cuentas vinculadas"). Aquí salen sus cuentas
// de verdad, con el saldo de cada una, y se dice CÓMO se leyó cada bróker:
// en vivo por API, o "foto" tomada a mano porque ese bróker no da acceso.

import { useEffect, useState } from "react";
import MisPosicionesCard from "../components/MisPosicionesCard";

interface Cuenta {
  broker: string;
  brokerNombre: string;
  cuenta: string;
  disponible: number;
  foto?: boolean;
  actualizado?: string;
}
interface Balances {
  cuentas?: Cuenta[];
  problemas?: { brokerNombre: string; motivo?: string }[];
  total?: number;
  hayDatos?: boolean;
}

/** Los cuatro brókers que Nagimi sabe leer, y cómo. */
const BROKERS: { id: string; nombre: string; ico: string; como: string }[] = [
  { id: "robinhood", nombre: "Robinhood", ico: "🪶", como: "Foto a mano — no da acceso en vivo a la app" },
  { id: "schwab", nombre: "Schwab (TOS)", ico: "🏦", como: "En vivo por API (solo lectura)" },
  { id: "tastytrade", nombre: "Tastytrade", ico: "🍊", como: "En vivo por API (solo lectura)" },
  { id: "webull", nombre: "Webull", ico: "🐂", como: "Foto a mano — el reto de los $10" },
];

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cuando = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("es-PR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

export default function PortafolioPage() {
  const [data, setData] = useState<Balances | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    fetch("/api/balances")
      .then((r) => r.json())
      .then((d: Balances) => setData(d))
      .catch(() => setFallo(true));
  }, []);

  const cuentas = data?.cuentas ?? [];
  const problemas = data?.problemas ?? [];
  const porBroker = (id: string) => cuentas.filter((c) => c.broker === id);

  return (
    <main className="wrap page-stack" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div className="eyebrow">Portafolio</div>
        <h1>Tu dinero, <em>de verdad</em>.</h1>
        <p>
          Lo que tienes disponible en cada bróker, sumado. Los que no dan acceso a la app se
          marcan como foto: ese número es el que apuntaste tú, no una lectura en vivo.
        </p>
      </div>

      {fallo && <div className="error">⚠ No se pudieron leer tus brókers ahora mismo.</div>}
      {!data && !fallo && <div className="card" style={{ color: "var(--muted)" }}>Leyendo tus cuentas…</div>}

      {data && (
        <>
          <div className="card" style={{ gap: 4 }}>
            <div className="eyebrow">Disponible en total</div>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em" }}>
              {money(data.total ?? 0)}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {cuentas.length} cuenta{cuentas.length === 1 ? "" : "s"} en {new Set(cuentas.map((c) => c.brokerNombre)).size} brókers
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Tus brókers</div>
            <div className="pf-grid">
              {BROKERS.map((b) => {
                const suyas = porBroker(b.id);
                const total = suyas.reduce((s, c) => s + c.disponible, 0);
                const foto = suyas.some((c) => c.foto);
                const problema = problemas.find((p) => p.brokerNombre.startsWith(b.nombre.split(" ")[0]));
                return (
                  <div key={b.id} className={`pf-card${suyas.length === 0 ? " pf-off" : ""}`}>
                    <div className="pf-top">
                      <span className="pf-ico" aria-hidden>{b.ico}</span>
                      <span className="pf-nombre">{b.nombre}</span>
                      <span className={`pf-estado${foto ? " foto" : suyas.length > 0 ? " vivo" : ""}`}>
                        {suyas.length === 0 ? (problema ? "sin conectar" : "sin cuenta") : foto ? "📸 foto" : "● en vivo"}
                      </span>
                    </div>
                    <div className="pf-monto">{suyas.length > 0 ? money(total) : "—"}</div>
                    <div className="pf-como">{b.como}</div>
                    {suyas.map((c) => (
                      <div key={c.cuenta} className="pf-cuenta">
                        {c.cuenta.trim() || "cuenta"} · {money(c.disponible)}
                        {c.foto && c.actualizado && <span className="pf-fecha"> · apuntado {cuando(c.actualizado)}</span>}
                      </div>
                    ))}
                    {problema && (
                      <div className="pf-problema">
                        {problema.motivo ?? "no se pudo leer"} · <a href="/schwab">arreglar</a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <MisPosicionesCard onPick={(t) => { window.location.href = `/?ticker=${encodeURIComponent(t)}`; }} />

          <div className="home-config-links">
            <a href="/schwab">Conectar o renovar Schwab</a>
            <a href="/cookie">Actualizar cookie de MarketSnack</a>
            <a href="/#reto-webull">Reto Webull</a>
          </div>
        </>
      )}

      <div className="disclaimer">
        Nagimi solo LEE tus cuentas: nunca manda una orden. Las fotos (Robinhood y Webull) las
        actualizas tú, así que pueden estar viejas.
      </div>
    </main>
  );
}
