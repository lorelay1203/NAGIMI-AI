"use client";

/**
 * 🔔 Avisos al celular: el vigía de muros (/api/vigia) revisa cada pocos
 * minutos en horario de mercado y, si los muros cambian, manda un aviso por
 * ntfy con la línea nueva para pegar en TradingView.
 */
import { useCallback, useEffect, useState } from "react";

interface Estado {
  config: { activo: boolean; tickers: string[]; ntfyTema: string; minutos: number };
  estado: { ultimaRevision: string | null; ultimoAviso: { ticker: string; titulo: string; hora: string } | null; ultimoError: string | null };
}

const hora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("es-PR", { hour: "numeric", minute: "2-digit" }) : "—";

export default function AvisosCelular() {
  const [d, setD] = useState<Estado | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tickers, setTickers] = useState("");

  const cargar = useCallback(() => {
    fetch("/api/vigia").then((r) => r.json()).then((r: Estado) => {
      setD(r);
      setTickers(r.config.tickers.join(", "));
    }).catch(() => setNota("No se pudo leer el vigía."));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const post = async (body: object, ok: string) => {
    setOcupado(true); setNota(null);
    try {
      const r = await fetch("/api/vigia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
      setNota(r.error ? `⚠️ ${r.error}` : ok + (r.avisos?.length ? ` (${r.avisos.length} aviso${r.avisos.length > 1 ? "s" : ""})` : ""));
      cargar();
    } catch {
      setNota("⚠️ No se pudo.");
    } finally {
      setOcupado(false);
    }
  };

  if (!d) return null;
  const tema = d.config.ntfyTema;

  return (
    <div className="ctv">
      <div className="ctv-fila">
        <div>
          <b>🔔 Avisos al celular</b>
          <span className="ctv-gris"> — te aviso cuando cambien los muros, con la línea nueva para pegar</span>
        </div>
        <label className="ctv-gris" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={d.config.activo} disabled={ocupado}
            onChange={(e) => post({ accion: "config", activo: e.target.checked }, e.target.checked ? "Avisos prendidos." : "Avisos apagados.")} />
          prendidos
        </label>
      </div>
      <div className="ctv-gris">
        1) Instala la app gratis <b>ntfy</b> en tu celular. 2) Toca “+” y suscríbete al canal{" "}
        <code className="ctv-codigo">{tema}</code>. Es como una contraseña: no lo compartas.
      </div>
      <div className="ctv-fila" style={{ justifyContent: "flex-start" }}>
        <span className="ctv-gris">Vigilo:</span>
        <input className="ctv-input" value={tickers} onChange={(e) => setTickers(e.target.value)} />
        <button type="button" className="ctv-btn" disabled={ocupado}
          onClick={() => post({ accion: "config", tickers: tickers.split(/[,\s]+/).filter(Boolean) }, "Lista guardada.")}>Guardar</button>
        <button type="button" className="ctv-btn" disabled={ocupado} onClick={() => post({ accion: "probar" }, "Aviso de prueba enviado.")}>Probar aviso</button>
        <button type="button" className="ctv-btn" disabled={ocupado} onClick={() => post({ accion: "revisar" }, "Revisado.")}>Revisar ahora</button>
      </div>
      <div className="ctv-gris">
        Revisa cada {d.config.minutos} min de 9:30 AM a 4:00 PM (NY), lunes a viernes, mientras Nagimi esté prendido.
        Última revisión: {hora(d.estado.ultimaRevision)}
        {d.estado.ultimoAviso && <> · último aviso: {d.estado.ultimoAviso.titulo} ({hora(d.estado.ultimoAviso.hora)})</>}
        {d.estado.ultimoError && <> · <span style={{ color: "var(--red-soft)" }}>{d.estado.ultimoError}</span></>}
        {nota && <> · <b>{nota}</b></>}
      </div>
    </div>
  );
}
