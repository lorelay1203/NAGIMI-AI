"use client";

// Chat con Claude — escribes y te da recomendaciones usando el análisis del ticker.
// Educativo, no ejecuta. La API key se pega una vez y se guarda sola.

import { useEffect, useRef, useState } from "react";

interface Msg { role: "user" | "assistant"; content: string }

export default function ChatBox({ ticker, context }: { ticker: string; context: Record<string, unknown> }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetch("/api/chat").then((r) => r.json()).then((d) => setHasKey(!!d.hasKey)).catch(() => setHasKey(false)); }, []);
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [msgs, sending]);

  async function saveKey() {
    if (!keyInput.trim()) return;
    setKeyMsg(null);
    const r = await fetch("/api/chat/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: keyInput.trim() }) }).then((x) => x.json()).catch(() => ({ error: "Fallo de red" }));
    if (r.ok) { setHasKey(true); setKeyInput(""); setKeyMsg(null); }
    else setKeyMsg("⚠ " + (r.error ?? "No se pudo guardar."));
  }

  async function send() {
    const q = input.trim();
    if (!q || sending) return;
    const history = msgs.slice(-8);
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setInput(""); setSending(true);
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: q, context, history }) }).then((x) => x.json()).catch(() => ({ error: "Fallo de red" }));
    setSending(false);
    if (r.error === "needkey") { setHasKey(false); return; }
    const reply = r.error ? `⚠ ${r.error}` : (r.reply ?? "(sin respuesta)");
    setMsgs((m) => [...m, { role: "assistant", content: reply }]);
  }

  const suggestions = [
    `¿Qué estrategia me conviene estudiar en ${ticker} según el flujo?`,
    "¿Un put spread o una venta de prima aquí?",
    "Explícame el riesgo de esta idea en simple.",
  ];

  return (
    <section className="card" style={{ gap: 12 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>💬 Pregúntale a Nagimi · {ticker}</div>
        <div className="card-sub">Escribe y te responde con IA usando el análisis actual. <b>Educativo, no ejecuta ni es consejo financiero.</b></div>
      </div>

      {hasKey === false && (
        <div style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>🔑 Pega tu API key de Anthropic (una sola vez)</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>La creas en <b>console.anthropic.com → API Keys</b>. Empieza con <code>sk-ant-...</code>. Se guarda solo en tu PC.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="sk-ant-..." spellCheck={false} type="password"
              style={{ flex: 1, minWidth: 220, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "8px 10px", fontSize: 13 }} />
            <button type="button" onClick={saveKey} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer" }}>Guardar</button>
          </div>
          {keyMsg && <div style={{ fontSize: 12, color: "var(--amber-text)" }}>{keyMsg}</div>}
        </div>
      )}

      {hasKey !== false && (
        <>
          <div ref={scrollRef} style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: 2 }}>
            {msgs.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Prueba con:</div>
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => setInput(s)} style={{ textAlign: "left", background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 8, padding: "7px 10px", cursor: "pointer", color: "var(--text)", fontSize: 12.5 }}>{s}</button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%", background: m.role === "user" ? "var(--accent)" : "var(--panel-2)", color: m.role === "user" ? "#fff" : "var(--text)", border: m.role === "user" ? "none" : "1px solid var(--border-soft)", borderRadius: 12, padding: "9px 12px", fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{m.content}</div>
            ))}
            {sending && <div style={{ alignSelf: "flex-start", color: "var(--muted)", fontSize: 12.5 }}>Pensando…</div>}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder={`Pregunta sobre ${ticker}…`} spellCheck={false}
              style={{ flex: 1, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", padding: "10px 12px", fontSize: 13.5 }} />
            <button type="button" onClick={send} disabled={sending} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 600, cursor: "pointer" }}>Enviar</button>
          </div>
        </>
      )}
      <div className="disclaimer">Respuestas generadas por IA a partir del análisis. Material de estudio, no consejo financiero. Nagimi no ejecuta órdenes.</div>
    </section>
  );
}
