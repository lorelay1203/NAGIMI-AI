"use client";

// Menú lateral fijo — la columna que organiza toda la app.
// Copia la estructura de FinAnalista (secciones nombradas, entradas discretas,
// la cuenta abajo) con una diferencia deliberada: aquí no hay ninguna entrada
// en "Pronto". Todo lo que aparece en el menú funciona hoy.
//
// Pensado para un cliente que no conoce la app: pocas opciones, agrupadas por
// lo que quiere hacer, y lo de configurar y aprender abajo, aparte.

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface Item { href: string; label: string; ico: string }

const INICIO: Item = { href: "/", label: "Inicio", ico: "⌂" };

// Agrupado por lo que el cliente QUIERE HACER, en este orden:
//   entender una acción → operar hoy → buscar ideas → ver lo suyo.
// Lo de configurar y aprender va abajo, chiquito: se usa poco y no debe
// competir con lo de todos los días.
const GRUPOS: { titulo: string; items: Item[] }[] = [
  {
    titulo: "Entender una acción",
    items: [
      { href: "/mapa", label: "Mapa de muros", ico: "🗺️" },
      { href: "/proyecciones", label: "Proyección", ico: "📈" },
      { href: "/agentes", label: "Agentes", ico: "👥" },
      { href: "/flow", label: "Flujo de opciones", ico: "≋" },
    ],
  },
  {
    titulo: "Operar hoy",
    items: [
      { href: "/daytrades", label: "Ticket del día", ico: "⚡" },
      { href: "/prima", label: "Venta de prima", ico: "🎯" },
    ],
  },
  {
    titulo: "Buscar ideas",
    items: [
      { href: "/ideas", label: "Ideas", ico: "◈" },
      { href: "/wheel", label: "Wheel (rueda)", ico: "◎" },
      { href: "/grandes", label: "Sigue a los grandes", ico: "🐋" },
    ],
  },
  {
    titulo: "Lo mío",
    items: [
      { href: "/portafolio", label: "Mi dinero", ico: "💼" },
      { href: "/watchlist", label: "Mi lista", ico: "★" },
      { href: "/reportes", label: "Historial", ico: "📓" },
    ],
  },
];

const ABAJO: Item[] = [
  { href: "/guia", label: "Guía", ico: "?" },
  { href: "/glosario", label: "Diccionario", ico: "📖" },
  { href: "/schwab", label: "Conexiones", ico: "⚙" },
];

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Sidebar() {
  const pathname = usePathname();

  // El dinero de verdad de sus brókers. Si un bróker no se puede leer, se dice
  // cuál y por qué — nunca se muestra $0 como si fuera el saldo real.
  // Robinhood entra como FOTO (no tiene API en vivo): se marca cuándo se tomó.
  interface Saldo { total: number; brokers: string[]; problemas: string[]; fotoBrokers: string[] }
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [fallo, setFallo] = useState(false);
  useEffect(() => {
    fetch("/api/balances")
      .then((r) => r.json())
      .then((r: {
        total?: number; hayDatos?: boolean;
        cuentas?: { brokerNombre: string; disponible: number; foto?: boolean; actualizado?: string }[];
        problemas?: { brokerNombre: string }[];
      }) => {
        if (!r.hayDatos || typeof r.total !== "number") { setFallo(true); return; }
        const cuentas = r.cuentas ?? [];
        setSaldo({
          total: r.total,
          brokers: [...new Set(cuentas.map((c) => c.brokerNombre))],
          problemas: [...new Set((r.problemas ?? []).map((p) => p.brokerNombre))],
          fotoBrokers: [...new Set(cuentas.filter((c) => c.foto).map((c) => c.brokerNombre))],
        });
      })
      .catch(() => setFallo(true));
  }, []);

  // Los brókers sin API en vivo (Robinhood, Webull) van como "foto" — se avisa.
  const fotoTexto = saldo && saldo.fotoBrokers.length > 0
    ? `${saldo.fotoBrokers.join(" y ")} en foto (no en vivo)`
    : null;

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

      <div className="sb-section">{link(INICIO)}</div>

      {GRUPOS.map((g) => (
        <div className="sb-section" key={g.titulo}>
          <div className="sb-label">{g.titulo}</div>
          {g.items.map(link)}
        </div>
      ))}

      <div className="sb-mini">
        {ABAJO.map((i) => {
          const active = pathname.startsWith(i.href) || (i.href === "/schwab" && pathname.startsWith("/cookie"));
          return (
            <a key={i.href} href={i.href} className={`sb-mini-link${active ? " active" : ""}`}>
              <span aria-hidden>{i.ico}</span> {i.label}
            </a>
          );
        })}
      </div>

      <div className="sb-foot">
        <div className="sb-money">
          <div className="sb-money-label">Tu dinero</div>
          {saldo ? (
            <>
              <div className="sb-money-value">{money(saldo.total)}</div>
              <div className="sb-money-sub">en {saldo.brokers.join(", ") || "tus cuentas"}</div>
              {fotoTexto && (
                <div className="sb-money-sub" title="Estos brókers no tienen conexión en vivo: su saldo es una foto que se actualiza a mano.">
                  📸 {fotoTexto}
                </div>
              )}
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
