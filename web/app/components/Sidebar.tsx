"use client";

// Menú lateral fijo — la columna que organiza toda la app.
// Copia la estructura de FinAnalista (secciones nombradas, entradas discretas,
// la cuenta abajo) con una diferencia deliberada: aquí no hay ninguna entrada
// en "Pronto". Todo lo que aparece en el menú funciona hoy.
//
// Agrupado por lo que HACES, no por cuándo se construyó cada página:
//   · Analizar      → leer el mercado o un ticker concreto ahora mismo
//   · Oportunidades → escáneres que te dan un candidato para operar
//   · Seguimiento   → lo que ya marcaste o lo que Nagimi ya predijo
// Las mismas categorías se usan en la página de inicio (HomeHub) — si se
// agrega una página nueva, entra en ambos sitios o se nota al momento.

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface Item { href: string; label: string; ico: string }

const ANALIZAR: Item[] = [
  { href: "/", label: "Panel", ico: "◧" },
  { href: "/daytrades", label: "Day Trades", ico: "⚡" },
  { href: "/flow", label: "Flujo", ico: "≋" },
  { href: "/grandes", label: "Sigue a los Grandes", ico: "🐋" },
];

const OPORTUNIDADES: Item[] = [
  { href: "/ideas", label: "Ideas", ico: "◈" },
  { href: "/wheel", label: "Wheel", ico: "◎" },
  { href: "/prima", label: "Venta de Prima", ico: "🎯" },
];

const SEGUIMIENTO: Item[] = [
  { href: "/watchlist", label: "Watchlist", ico: "★" },
  { href: "/reportes", label: "Reportes", ico: "📓" },
];

const CUENTA: Item[] = [
  { href: "/schwab", label: "Conexiones", ico: "⚯" },
  { href: "/cookie", label: "MarketSnack", ico: "◍" },
  { href: "/guia", label: "Guía", ico: "?" },
];

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Sidebar() {
  const pathname = usePathname();

  // El dinero de verdad de sus brókers. Si un bróker no se puede leer, se dice
  // cuál y por qué — nunca se muestra $0 como si fuera el saldo real.
  interface Saldo { total: number; brokers: string[]; problemas: string[] }
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [fallo, setFallo] = useState(false);
  useEffect(() => {
    fetch("/api/balances")
      .then((r) => r.json())
      .then((r: {
        total?: number; hayDatos?: boolean;
        cuentas?: { brokerNombre: string; disponible: number }[];
        problemas?: { brokerNombre: string }[];
      }) => {
        if (!r.hayDatos || typeof r.total !== "number") { setFallo(true); return; }
        setSaldo({
          total: r.total,
          brokers: [...new Set((r.cuentas ?? []).map((c) => c.brokerNombre))],
          problemas: [...new Set((r.problemas ?? []).map((p) => p.brokerNombre))],
        });
      })
      .catch(() => setFallo(true));
  }, []);

  const link = (i: Item) => {
    const active = i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
    return (
      <a key={i.href} href={i.href} className={`sb-link${active ? " active" : ""}`}>
        <span className="sb-ico" aria-hidden>{i.ico}</span>
        {i.label}
      </a>
    );
  };

  return (
    <nav className="sidebar" aria-label="Menú principal">
      <div className="sb-brand">
        <span className="sb-brand-mark" aria-hidden>🍒</span>
        <span className="sb-brand-name">Nagimi<em>AI</em></span>
      </div>

      <div className="sb-section">
        <div className="sb-label">Analizar</div>
        {ANALIZAR.map(link)}
      </div>

      <div className="sb-section">
        <div className="sb-label">Oportunidades</div>
        {OPORTUNIDADES.map(link)}
      </div>

      <div className="sb-section">
        <div className="sb-label">Seguimiento</div>
        {SEGUIMIENTO.map(link)}
      </div>

      <div className="sb-section">
        <div className="sb-label">Cuenta</div>
        {CUENTA.map(link)}
      </div>

      <div className="sb-foot">
        <div className="sb-money">
          <div className="sb-money-label">Tu dinero</div>
          {saldo ? (
            <>
              <div className="sb-money-value">{money(saldo.total)}</div>
              <div className="sb-money-sub">en {saldo.brokers.join(" y ") || "tus cuentas"}</div>
              {saldo.problemas.length > 0 && (
                <div className="sb-money-sub sb-money-warn">
                  {saldo.problemas.join(" y ")} sin conectar ·{" "}
                  <a href="/schwab" style={{ color: "inherit", fontWeight: 700 }}>arreglar</a>
                </div>
              )}
            </>
          ) : fallo ? (
            <>
              <div className="sb-money-value sb-money-warn">—</div>
              <div className="sb-money-sub sb-money-warn">
                No pude leer tus brókers. <a href="/schwab" style={{ color: "inherit" }}>Revisar conexiones</a>
              </div>
            </>
          ) : (
            <div className="sb-money-sub">Leyendo tus brókers…</div>
          )}
        </div>
      </div>
    </nav>
  );
}
