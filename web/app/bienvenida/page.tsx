// Landing / portada de bienvenida de Nagimi AI — para presentar y vender el producto.
// Estática (sin lógica): hero + qué hace + cómo funciona + llamado a la acción.

const FEATURES: { icon: string; title: string; desc: string }[] = [
  { icon: "🤖", title: "Motor automático", desc: "Escanea el mercado solo y encuentra trades con la probabilidad de ganar que tú elijas — que quepan en tu capital." },
  { icon: "💡", title: "¿Qué hago con mi dinero?", desc: "Escribe cuánto tienes y te muestra todas las estrategias que caben, con probabilidad, costo y riesgo." },
  { icon: "🎡", title: "Wheel · ingresos con puts", desc: "Screener de venta de puts en versión spread (cuenta chica): riesgo topado, no colateral gigante." },
  { icon: "🧱", title: "Muros de dinero (GEX)", desc: "Ve dónde está apostado el dinero grande: call wall, put wall, imán y hacia dónde jala el precio." },
  { icon: "📝", title: "Paper trading", desc: "Prueba cada estrategia con dinero de mentira antes de arriesgar el tuyo. Mide si de verdad gana." },
  { icon: "🍒", title: "Semi-automático seguro", desc: "El agente arma la orden y tú das el clic final en tu bróker. Con stop-loss recomendado en cada trade." },
];

const STEPS: { n: string; title: string; desc: string }[] = [
  { n: "1", title: "Dinos tu capital", desc: "Pones cuánto tienes disponible. El agente solo busca trades que te alcancen." },
  { n: "2", title: "Elige y analiza", desc: "Comparas estrategias con su probabilidad, riesgo, stop-loss y el porqué de cada una." },
  { n: "3", title: "Prueba o ejecuta", desc: "Lo pruebas en paper, o lo llevas a real con un clic cuando estés lista." },
];

export default function Landing() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 80px" }}>
      {/* Nav */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div className="hb-logo">🍒</div>
          <span className="hb-name" style={{ fontSize: 20 }}>Nagimi AI</span>
        </div>
        <a href="/" style={{ padding: "10px 20px", borderRadius: 999, background: "var(--brand-grad)", color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none", boxShadow: "0 4px 16px rgba(160,107,255,.35)" }}>
          Entrar al agente →
        </a>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: "center", padding: "56px 0 40px" }}>
        <div style={{ display: "inline-block", padding: "6px 14px", borderRadius: 999, background: "var(--panel-2)", border: "1px solid var(--border)", fontSize: 12.5, color: "var(--muted)", fontWeight: 600, marginBottom: 22 }}>
          🚀 Tu agente de opciones para cuentas chicas
        </div>
        <h1 style={{ fontSize: 52, lineHeight: 1.08, margin: "0 0 18px", fontWeight: 800, letterSpacing: "-1.5px", maxWidth: 760, marginLeft: "auto", marginRight: "auto" }}>
          Deja que la IA encuentre tus trades{" "}
          <span style={{ background: "var(--brand-grad)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            con probabilidad de ganar
          </span>
        </h1>
        <p style={{ fontSize: 18, color: "var(--muted)", lineHeight: 1.6, maxWidth: 620, margin: "0 auto 30px" }}>
          Nagimi escanea el mercado, arma estrategias que caben en tu dinero y te dice el porqué,
          el riesgo y el stop-loss de cada una. Pruébalas en paper antes de arriesgar un dólar.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/" style={{ padding: "14px 30px", borderRadius: 999, background: "var(--brand-grad)", color: "#fff", fontWeight: 700, fontSize: 15.5, textDecoration: "none", boxShadow: "0 6px 22px rgba(160,107,255,.4)" }}>
            Empezar gratis →
          </a>
          <a href="/wheel" style={{ padding: "14px 30px", borderRadius: 999, background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)", fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
            🎡 Ver el Wheel
          </a>
        </div>
        <div style={{ display: "flex", gap: 28, justifyContent: "center", flexWrap: "wrap", marginTop: 34, color: "var(--muted)", fontSize: 13 }}>
          <span>✓ Sin dinero real para probar</span>
          <span>✓ Hecho para cuentas pequeñas</span>
          <span>✓ Stop-loss en cada trade</span>
        </div>
      </section>

      {/* Qué hace */}
      <section style={{ padding: "30px 0" }}>
        <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 8px" }}>Todo en un solo lugar</h2>
        <p style={{ textAlign: "center", color: "var(--muted)", margin: "0 0 34px", fontSize: 15 }}>Seis herramientas que trabajan juntas para ti.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="card" style={{ gap: 10 }}>
              <div style={{ fontSize: 30 }}>{f.icon}</div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{f.title}</div>
              <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Cómo funciona */}
      <section style={{ padding: "44px 0 20px" }}>
        <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 34px" }}>Cómo funciona</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{ textAlign: "center", padding: "0 12px" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--brand-grad)", color: "#fff", fontWeight: 800, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", boxShadow: "0 4px 16px rgba(160,107,255,.35)" }}>{s.n}</div>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{s.title}</div>
              <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section style={{ marginTop: 50, textAlign: "center", padding: "48px 28px", borderRadius: 24, background: "linear-gradient(135deg, rgba(109,139,255,.14), rgba(255,107,157,.12))", border: "1px solid var(--border)" }}>
        <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 12px" }}>¿Lista para empezar?</h2>
        <p style={{ color: "var(--muted)", fontSize: 15.5, margin: "0 0 26px", maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
          Entra al agente, dinos cuánto tienes y descubre qué puedes hacer hoy — sin arriesgar dinero real.
        </p>
        <a href="/" style={{ padding: "15px 34px", borderRadius: 999, background: "var(--brand-grad)", color: "#fff", fontWeight: 700, fontSize: 16, textDecoration: "none", boxShadow: "0 6px 22px rgba(160,107,255,.4)" }}>
          Entrar al agente →
        </a>
      </section>

      <footer style={{ textAlign: "center", marginTop: 40, color: "var(--faint)", fontSize: 12 }}>
        🍒 Nagimi AI · Herramienta educativa. No es consejo financiero.
      </footer>
    </main>
  );
}
