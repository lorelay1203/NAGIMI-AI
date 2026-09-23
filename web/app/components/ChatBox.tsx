"use client";

/**
 * 💬 Pregunta sobre este reporte — el chat acotado al análisis que está viendo.
 *
 * La diferencia con un chat cualquiera es que va ATADO al reporte: no se le
 * manda la pregunta sola, se le manda con los números que la página ya calculó
 * (lib/chatContexto). Así responde sobre ESTE ticker y no sobre lo que recuerde.
 *
 * Tres decisiones que se ven en la pantalla:
 *   1. Cinco preguntas de un clic. Alguien que empieza no sabe qué preguntar, y
 *      una caja de texto vacía se queda vacía. Las preguntas se arman con los
 *      números reales del análisis (el muro de $210, no "el muro").
 *   2. Un contador de 10 preguntas por reporte. Cada pregunta cuesta dinero de
 *      la API y ella no lo ve; el contador lo pone a la vista.
 *   3. Sin API key no se rompe: lo dice, explica dónde se pega y deja pegarla ahí mismo.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProPrediction } from "@/lib/prediction";
import type { GexAnalysis } from "@/lib/gex";
import type { LevelsReport } from "@/lib/levels";
import {
  LIMITE_PREGUNTAS, construirContextoChat, preguntasSugeridas, type MurosGamma,
} from "@/lib/chatContexto";
import { loadProfile } from "./RiskProfileCard";

interface Msg { role: "user" | "assistant"; content: string }

export default function ChatBox({
  ticker, prediction, gex, levels, muros,
}: {
  ticker: string;
  prediction?: ProPrediction | null;
  gex?: GexAnalysis | null;
  levels?: LevelsReport | null;
  muros?: MurosGamma | null;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  // El % que su perfil deja arriesgar. Se lee del navegador porque el SALDO de la
  // cuenta vive solo ahí; al chat viaja el porcentaje, nunca el dinero.
  const [riesgoPct, setRiesgoPct] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetch("/api/chat").then((r) => r.json()).then((d) => setHasKey(!!d.hasKey)).catch(() => setHasKey(false)); }, []);
  useEffect(() => { try { setRiesgoPct(loadProfile().tolerancePct); } catch { setRiesgoPct(null); } }, []);
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [msgs, sending]);

  // Cambiar de ticker es empezar otro reporte: la conversación anterior ya no
  // aplica y el contador vuelve a cero.
  useEffect(() => { setMsgs([]); setInput(""); }, [ticker]);

  const contexto = useMemo(
    () => construirContextoChat({ ticker, prediction, gex, levels, muros, riesgoPorOperacionPct: riesgoPct }),
    [ticker, prediction, gex, levels, muros, riesgoPct],
  );
  const sugeridas = useMemo(() => preguntasSugeridas(contexto), [contexto]);

  const usadas = msgs.filter((m) => m.role === "user").length;
  const agotadas = usadas >= LIMITE_PREGUNTAS;

  async function saveKey() {
    if (!keyInput.trim()) return;
    setKeyMsg(null);
    const r = await fetch("/api/chat/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: keyInput.trim() }) }).then((x) => x.json()).catch(() => ({ error: "Fallo de red" }));
    if (r.ok) { setHasKey(true); setKeyInput(""); setKeyMsg(null); }
    else setKeyMsg("⚠ " + (r.error ?? "No se pudo guardar."));
  }

  async function enviar(texto: string) {
    const q = texto.trim();
    if (!q || sending || agotadas) return;
    const history = msgs.slice(-8);
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setInput(""); setSending(true);
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: q, context: contexto, history }),
    }).then((x) => x.json()).catch(() => ({ error: "No se pudo conectar. Revisa tu internet e inténtalo otra vez." }));
    setSending(false);
    if (r.error === "needkey") { setHasKey(false); return; }
    const reply = r.error ? `⚠ ${r.error}` : (r.reply ?? "(sin respuesta)");
    setMsgs((m) => [...m, { role: "assistant", content: reply }]);
  }

  return (
    <section className="card" style={{ gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="eyebrow">Pregúntale al reporte</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>💬 Pregunta sobre este análisis de {ticker}</div>
          <div className="card-sub">
            Responde usando SOLO los números de arriba. Te explica, no te manda a comprar.
          </div>
        </div>
        {hasKey !== false && (
          <div style={{
            flex: "0 0 auto", fontSize: 12, fontWeight: 700, color: agotadas ? "var(--amber-text)" : "var(--muted)",
            background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 999, padding: "4px 11px",
          }}>
            {usadas}/{LIMITE_PREGUNTAS} preguntas
          </div>
        )}
      </div>

      {hasKey === null && (
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Revisando si el chat está conectado…</div>
      )}

      {hasKey === false && (
        <div style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>🔑 El chat todavía no está conectado</div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55 }}>
            Le falta la clave de Anthropic (la que le da la IA). La creas en{" "}
            <b>console.anthropic.com → API Keys</b>, empieza con <code>sk-ant-…</code> y se guarda
            solo en tu computadora. Puedes pegarla aquí mismo:
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="sk-ant-..." spellCheck={false} type="password"
              style={{ flex: 1, minWidth: 220, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "8px 10px", fontSize: 13 }} />
            <button type="button" onClick={saveKey} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer" }}>Guardar</button>
          </div>
          {keyMsg && <div style={{ fontSize: 12, color: "var(--amber-text)" }}>{keyMsg}</div>}
          <div style={{ fontSize: 11.5, color: "var(--faint)" }}>
            También puedes revisarlo en <a href="/cookie" style={{ color: "var(--accent)" }}>Conexiones</a>, donde se ve qué está conectado y qué no.
          </div>
        </div>
      )}

      {hasKey === true && (
        <>
          {(msgs.length > 0 || sending) && (
            <div ref={scrollRef} style={{ maxHeight: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: 2 }}>
              {msgs.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%",
                  background: m.role === "user" ? "var(--accent)" : "var(--panel-2)",
                  color: m.role === "user" ? "#fff" : "var(--text)",
                  border: m.role === "user" ? "none" : "1px solid var(--border-soft)",
                  borderRadius: 12, padding: "9px 12px", fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.55,
                }}>{m.content}</div>
              ))}
              {sending && <div style={{ alignSelf: "flex-start", color: "var(--muted)", fontSize: 12.5 }}>Pensando…</div>}
            </div>
          )}

          {/* Las sugeridas siguen visibles después de la primera respuesta: casi
              siempre la segunda pregunta también sale de aquí. */}
          {!agotadas && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {msgs.length === 0 ? "No sabes por dónde empezar. Toca una:" : "¿Y esto otro?"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {sugeridas.map((s) => (
                  <button key={s} type="button" disabled={sending} onClick={() => enviar(s)}
                    style={{
                      textAlign: "left", background: "var(--panel-2)", border: "1px solid var(--border-soft)",
                      borderRadius: 999, padding: "7px 12px", cursor: sending ? "default" : "pointer",
                      color: "var(--text)", fontSize: 12.5, lineHeight: 1.35, opacity: sending ? 0.5 : 1,
                    }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {agotadas ? (
            <div style={{ background: "var(--amber-bg)", border: "1px solid var(--amber-border)", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "var(--amber-text)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 200 }}>
                Llegaste a las {LIMITE_PREGUNTAS} preguntas de este reporte. Si quieres seguir, empieza una tanda nueva.
              </span>
              <button type="button" onClick={() => setMsgs([])}
                style={{ background: "transparent", color: "var(--amber-text)", border: "1px solid var(--amber-border)", borderRadius: 8, padding: "6px 12px", fontWeight: 600, cursor: "pointer", fontSize: 12.5 }}>
                Empezar de nuevo
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <input value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") enviar(input); }}
                placeholder={`Pregunta lo que sea sobre ${ticker}…`} spellCheck={false} disabled={sending}
                style={{ flex: 1, minWidth: 0, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", padding: "10px 12px", fontSize: 13.5 }} />
              <button type="button" onClick={() => enviar(input)} disabled={sending || !input.trim()}
                style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 600, cursor: sending || !input.trim() ? "default" : "pointer", opacity: sending || !input.trim() ? 0.55 : 1 }}>
                Enviar
              </button>
            </div>
          )}

          {/* Si al análisis le faltan datos, se dice ANTES de preguntar — así ella
              sabe por qué el chat va a contestar "ese dato no lo tengo". */}
          {contexto.faltantes.length > 0 && (
            <div style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5 }}>
              Ojo: de este análisis no se pudo leer {contexto.faltantes.slice(0, 3).join(", ")}
              {contexto.faltantes.length > 3 ? " (y algo más)" : ""}. El chat te lo va a decir en vez de inventarlo.
            </div>
          )}
        </>
      )}

      <div className="disclaimer">
        Respuestas de IA hechas con este análisis. Material de estudio, no consejo financiero.
        Nagimi no ejecuta órdenes ni promete resultados.
      </div>
    </section>
  );
}
