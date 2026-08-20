"use client";

// Página GUÍA — "¿Cómo funciona Nagimi?" en lenguaje simple y visual.
// Explica cada herramienta, el paso a paso para entrar a un trade, y un
// diccionario de términos sin tecnicismos. Pensada para que la usuaria (y quien
// vea el agente) entienda todo sin saber de programación ni de opciones.

const TOOLS: { icon: string; title: string; what: string; when: string; href?: string }[] = [
  { icon: "📊", title: "Análisis", what: "Escribes un ticker y el agente lo revisa: quién está comprando, los muros de dinero, la tendencia y un veredicto claro.", when: "Cuando quieres entender qué está pasando con una acción antes de operar.", href: "/" },
  { icon: "⚡", title: "Day Trades", what: "La sesión de HOY: VWAP, rango de apertura, muros de gamma en vivo y la gráfica estilo MarketSnack. Con ideas 0DTE y su stop-loss.", when: "Cuando operas en el día (SPY = espejo de /ES y /MES) y quieres los niveles intradía.", href: "/daytrades" },
  { icon: "💡", title: "¿Qué hago con $X?", what: "Escribes cuánto tienes y te muestra TODAS las estrategias que caben en tu dinero, con probabilidad, costo, riesgo y el porqué.", when: "Cuando tienes poco capital y quieres ver qué te alcanza sin arriesgar de más.", href: "/" },
  { icon: "🎡", title: "Wheel · ingresos con puts", what: "Un screener que busca ventas de puts (o spreads para cuenta chica) que generan prima, ordenado en tabla con stop-loss.", when: "Cuando buscas ingresos recurrentes con riesgo topado.", href: "/wheel" },
  { icon: "🤖", title: "Motor automático (Paper)", what: "Escanea el mercado solo y arma trades con la probabilidad de ganar que tú elijas, que quepan en tu capital.", when: "Cuando quieres que el agente te proponga ideas sin buscar tú misma.", href: "/" },
  { icon: "📝", title: "Paper Trading", what: "Prueba cualquier estrategia con dinero de MENTIRA y mide si de verdad gana antes de arriesgar el tuyo.", when: "SIEMPRE antes de poner dinero real en una estrategia nueva.", href: "/" },
  { icon: "🧱", title: "Muros de gamma (GEX)", what: "Ve dónde está apostado el dinero grande: call wall (techo), put wall (piso), imán y hacia dónde jala el precio.", when: "Para saber dónde el precio suele rebotar o romper.", href: "/daytrades" },
  { icon: "⭐", title: "Watchlist", what: "Tu lista de acciones favoritas para seguirlas de un vistazo.", when: "Para no perder de vista los tickers que te importan.", href: "/watchlist" },
];

const STEPS: { n: string; title: string; desc: string }[] = [
  { n: "1", title: "Busca una idea", desc: "Usa el Motor automático o «¿Qué hago con $X?». Te dan trades que caben en tu cuenta, con probabilidad, riesgo y stop-loss." },
  { n: "2", title: "Analízala", desc: "Tócala para ver el detalle: las patas, el porqué, y cuándo tomar ganancia o cortar la pérdida." },
  { n: "3", title: "Pruébala en papel", desc: "Regístrala en Paper Trading y míralas unos días. Ves si gana SIN arriesgar un dólar." },
  { n: "4", title: "Llévala a real", desc: "Cuando estés lista, «Ejecutar» → ajustas contratos y precio → Revisar (dry-run) → das el clic final en tu bróker. Nagimi nunca ejecuta sola." },
];

const GLOSSARY: { term: string; emoji: string; def: string }[] = [
  { term: "Call Wall (techo)", emoji: "🟢", def: "El precio donde hay más apuestas de subida acumuladas. Suele frenar al precio como un techo." },
  { term: "Put Wall (piso)", emoji: "🔴", def: "El precio donde hay más apuestas de bajada. Suele sostener al precio como un piso." },
  { term: "Imán", emoji: "🧲", def: "El precio hacia donde el mercado tiende a ser atraído, sobre todo al cierre del día." },
  { term: "Gamma Flip", emoji: "🔀", def: "La línea que separa el mercado tranquilo (arriba, de rango) del volátil (abajo, de tendencia)." },
  { term: "GEX (gamma)", emoji: "🧱", def: "Mide dónde están los muros de dinero. Gamma positiva = precio pegajoso (rango); negativa = se acelera (tendencia)." },
  { term: "VWAP", emoji: "📏", def: "El precio promedio del día ponderado por volumen. Si el precio está arriba, hay fuerza compradora; abajo, vendedora." },
  { term: "POP", emoji: "🎯", def: "Probabilidad de ganar (Probability of Profit). Un 65% significa que, de cada 100 veces, ganarías ~65." },
  { term: "Stop-loss", emoji: "🛑", def: "El punto donde cortas la pérdida a propósito para no perder de más. Nagimi te lo sugiere en cada trade." },
  { term: "0DTE", emoji: "⏱️", def: "Opciones que vencen HOY mismo (Zero Days To Expiration). Muy rápidas y de alto riesgo." },
  { term: "Crédito / Débito", emoji: "💵", def: "Crédito = te PAGAN por abrir el trade (cobras prima). Débito = tú PAGAS para abrirlo." },
  { term: "Spread", emoji: "📐", def: "Combinas dos opciones para topar el riesgo. Ideal para cuenta chica: pierdes poco como máximo." },
  { term: "/ES y /MES", emoji: "🔮", def: "Los futuros del S&P 500. SPX es su espejo directo; SPY es SPX ÷10. Por eso SPY sirve para operar /ES." },
];

const card: React.CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" };

export default function GuiaPage() {
  return (
    <main className="wrap page-stack" style={{ maxWidth: 960 }}>
      <div>
        <a href="/" style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>← Volver al inicio</a>
        <h1 style={{ margin: "8px 0 6px", fontSize: 28, letterSpacing: "-0.5px" }}>📚 Guía — ¿Cómo funciona Nagimi?</h1>
        <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6, fontSize: 15 }}>
          Todo tu agente explicado en palabras simples, sin tecnicismos. Si es tu primera vez, empieza por aquí. 💛
        </p>
      </div>

      {/* En una frase */}
      <section style={{ ...card, background: "linear-gradient(135deg, rgba(109,139,255,.12), rgba(255,107,157,.10))" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".05em", color: "var(--accent)", textTransform: "uppercase", marginBottom: 6 }}>En una frase</div>
        <div style={{ fontSize: 17, lineHeight: 1.6, fontWeight: 600 }}>
          Nagimi mira dónde está apostando el <b>dinero grande</b> en las opciones, arma trades que <b>caben en tu cuenta</b>,
          te dice el <b>porqué</b>, el <b>riesgo</b> y el <b>stop-loss</b> de cada uno — y te deja probarlos en papel antes de arriesgar un dólar.
        </div>
      </section>

      {/* Herramientas */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "6px 0 12px" }}>🧰 Tus herramientas</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          {TOOLS.map((t) => (
            <div key={t.title} style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 26 }}>{t.icon}</span>
                <span style={{ fontSize: 16.5, fontWeight: 800 }}>{t.title}</span>
              </div>
              <div style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.55 }}>{t.what}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
                <b style={{ color: "var(--accent)" }}>¿Cuándo?</b> {t.when}
              </div>
              {t.href && <a href={t.href} style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent)", textDecoration: "none", marginTop: 2 }}>Abrir →</a>}
            </div>
          ))}
        </div>
      </div>

      {/* Paso a paso */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "6px 0 12px" }}>🚀 Cómo hacer una entrada, paso a paso</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--brand-grad)", color: "#fff", fontWeight: 800, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.n}</div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{s.title}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>{s.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ ...card, marginTop: 12, borderColor: "#12b76a55", background: "rgba(18,183,106,.08)", fontSize: 13.5, lineHeight: 1.6 }}>
          🔒 <b>Regla de oro:</b> Nagimi <b>propone</b>, tú <b>apruebas</b>. Nunca ejecuta un trade real por su cuenta —
          el clic final siempre es tuyo. Y siempre con stop-loss.
        </div>
      </div>

      {/* Diccionario */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "6px 0 4px" }}>📖 Diccionario sin miedo</h2>
        <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13.5 }}>Los términos que verás, explicados como para un amigo.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {GLOSSARY.map((g) => (
            <div key={g.term} style={{ ...card, padding: "12px 14px" }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{g.emoji} {g.term}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>{g.def}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="disclaimer">
        Material educativo para entender tu agente. No es consejo financiero. Practica en papel y usa siempre stop-loss.
      </div>
    </main>
  );
}
