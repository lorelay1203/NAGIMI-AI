"use client";

// Journaling — diario de trading. Escribe lecciones, errores, ideas y emociones.
// Se guarda local (data/journal.json). Material de estudio, no ejecuta nada.

import { useCallback, useEffect, useState } from "react";
import type { JournalEntry, JournalTag } from "@/lib/journal";

const TAGS: { id: JournalTag; label: string; color: string }[] = [
  { id: "leccion", label: "📘 Lección", color: "#4ad991" },
  { id: "error", label: "⚠ Error", color: "#ff8a82" },
  { id: "idea", label: "💡 Idea", color: "#f5c451" },
  { id: "emocion", label: "❤️ Emoción", color: "#c084fc" },
  { id: "nota", label: "📝 Nota", color: "var(--muted)" },
];
const tagOf = (t: JournalTag) => TAGS.find((x) => x.id === t) ?? TAGS[4];

function fecha(iso: string): string {
  try { return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso.slice(0, 10); }
}

export default function JournalCard() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [ticker, setTicker] = useState("");
  const [title, setTitle] = useState("");
  const [bodyTxt, setBodyTxt] = useState("");
  const [tag, setTag] = useState<JournalTag>("leccion");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/journal").then((r) => r.json()).catch(() => ({ entries: [] }));
    setEntries(d.entries ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!title.trim() || saving) return;
    setSaving(true);
    const entry = {
      createdAt: new Date().toISOString(),
      ticker: ticker.trim().toUpperCase() || undefined,
      title: title.trim(),
      body: bodyTxt.trim(),
      tag,
    };
    const r = await fetch("/api/journal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", entry }),
    }).then((x) => x.json()).catch(() => ({ error: "red" }));
    setSaving(false);
    if (r.ok) { setTitle(""); setBodyTxt(""); setTicker(""); load(); }
  }

  async function del(id: string) {
    await fetch("/api/journal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    load();
  }

  const inputStyle: React.CSSProperties = { background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "8px 10px", fontSize: 13 };

  return (
    <section className="card" style={{ gap: 12 }}>
      <div>
        <div className="card-title">📓 Mi diario de trading</div>
        <div className="card-sub">Anota lecciones, errores, ideas y cómo te sentiste. Escribir lo que aprendes es la mitad del progreso.</div>
      </div>

      {/* Formulario */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TAGS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTag(t.id)}
              style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontWeight: 600,
                border: `1px solid ${tag === t.id ? t.color : "var(--border)"}`,
                background: tag === t.id ? `${t.color}22` : "transparent",
                color: tag === t.id ? t.color : "var(--text)" }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (ej. Aguanté un put demasiado tiempo)"
            style={{ ...inputStyle, flex: 1, minWidth: 220 }} />
          <input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="Ticker (opcional)"
            style={{ ...inputStyle, width: 130 }} />
        </div>
        <textarea value={bodyTxt} onChange={(e) => setBodyTxt(e.target.value)} placeholder="¿Qué pasó? ¿Qué aprendiste? ¿Cómo te sentiste?"
          style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }} />
        <button type="button" onClick={save} disabled={saving || !title.trim()}
          style={{ alignSelf: "flex-start", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: title.trim() ? "pointer" : "default", opacity: title.trim() ? 1 : 0.5, fontSize: 13.5 }}>
          {saving ? "Guardando…" : "＋ Guardar entrada"}
        </button>
      </div>

      {/* Lista */}
      {entries == null ? (
        <div className="feed-empty">Cargando…</div>
      ) : entries.length === 0 ? (
        <div className="feed-empty">Tu diario está vacío. Escribe tu primera entrada arriba ☝️</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((e) => {
            const t = tagOf(e.tag);
            return (
              <div key={e.id} style={{ border: "1px solid var(--border-soft)", borderRadius: 10, padding: "10px 12px", borderLeft: `3px solid ${t.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: t.color, fontWeight: 700 }}>{t.label}</span>
                    {e.ticker && <span style={{ fontSize: 11, fontWeight: 700 }}>{e.ticker}</span>}
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{fecha(e.createdAt)}</span>
                  </div>
                  <button type="button" onClick={() => del(e.id)} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13 }}>✕</button>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13.5, marginTop: 3 }}>{e.title}</div>
                {e.body && <div style={{ fontSize: 12.5, color: "var(--text)", marginTop: 3, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{e.body}</div>}
              </div>
            );
          })}
        </div>
      )}
      <div className="disclaimer">Tu diario se guarda solo en tu PC. Material de estudio personal.</div>
    </section>
  );
}
