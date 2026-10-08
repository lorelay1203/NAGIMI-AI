"use client";

import { useEffect, useState } from "react";
import type { CompanyInfo } from "@/lib/types";
import type { Bias, NewsItem, NewsReport } from "@/lib/news";
import { contradictionFlag, flowBias } from "@/lib/news";
import type { NoticiasSimples, TitularEntrada } from "@/lib/noticiasSimples";

type Simple = NoticiasSimples["noticias"][number];
const EFECTO: Record<string, { txt: string; cls: string }> = {
  sube: { txt: "▲ Podría subirla", cls: "up" },
  baja: { txt: "▼ Podría bajarla", cls: "down" },
  mixto: { txt: "↕ Mezclado", cls: "neutral" },
  neutral: { txt: "● Sin efecto claro", cls: "neutral" },
};

function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(min) || min < 0) return "";
  if (min < 60) return `hace ${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.round(h / 24)}d`;
}

const SENT_LABEL: Record<string, string> = { positive: "POSITIVA", negative: "NEGATIVA", neutral: "NEUTRAL" };
const BIAS_LABEL: Record<Bias, string> = {
  bullish: "Noticias positivas", bearish: "Noticias negativas",
  mixed: "Noticias mixtas", neutral: "Sin dirección clara",
};

function Article({ n, s }: { n: NewsItem; s?: Simple }) {
  return (
    <a className="news-item" href={n.url} target="_blank" rel="noopener noreferrer">
      <div className="news-item-top">
        {s ? <span className={`news-efecto ${EFECTO[s.efecto].cls}`}>{EFECTO[s.efecto].txt}</span>
          : n.sentiment && <span className={`news-sent ${n.sentiment}`}>{SENT_LABEL[n.sentiment]}</span>}
        {n.matchedBy && <span className="news-sent match">RSS · {n.matchedBy}</span>}
        <span className="news-meta">{n.publisher} · {ago(n.publishedUtc)}</span>
      </div>
      <div className="news-title">{s ? s.titulo : n.title}</div>
      {s && (
        <>
          <div className="news-simple">{s.que_significa}</div>
          <div className="news-afecta"><b>Cómo la afecta:</b> {s.como_afecta}</div>
          <div className="news-original">Original: {n.title}</div>
        </>
      )}
      {!s && n.reasoning && <div className="news-why">{n.reasoning}</div>}
    </a>
  );
}

/** Los titulares que se ven en la tarjeta, en el formato que pide la traducción. */
function aTitulares(r: NewsReport): TitularEntrada[] {
  const de = (n: NewsItem, capa: TitularEntrada["capa"]): TitularEntrada => ({
    id: n.id, titulo: n.title, descripcion: n.description, fuente: n.publisher, fecha: n.publishedUtc, capa,
  });
  return [
    ...r.company.slice(0, 4).map((n) => de(n, "empresa")),
    ...r.promoted.slice(0, 4).map((n) => de(n, "empresa")),
    ...r.macro.slice(0, 4).map((n) => de(n, "mercado")),
  ];
}

/**
 * Tarea 7 — Noticias y catalizadores.
 * Capa 1 (macro) = los feeds RSS del documento; capa 2 (empresa) = Massive con
 * sentimiento por ticker. La bandera confronta el flujo contra las noticias
 * SIN tocar los 100 pts del scorecard.
 */
export default function NewsCard({
  ticker,
  company,
  callPct,
}: {
  ticker: string;
  company: CompanyInfo | null;
  callPct: number | null;
}) {
  const [report, setReport] = useState<NewsReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [simples, setSimples] = useState<NoticiasSimples | null>(null);
  const [traduciendo, setTraduciendo] = useState(false);
  const [errTrad, setErrTrad] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReport(null); setFailed(false);
    const q = new URLSearchParams({ ticker });
    if (company?.name) q.set("name", company.name);
    fetch(`/api/news?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("news"))))
      .then((d: NewsReport) => { if (!cancelled) setReport(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [ticker, company?.name]);

  // En cuanto llegan los titulares, se piden traducidos y explicados.
  useEffect(() => {
    if (!report) return;
    const titulares = aTitulares(report);
    if (titulares.length === 0) return;
    let cancelled = false;
    setSimples(null); setErrTrad(null); setTraduciendo(true);
    fetch("/api/news/resumen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticker, empresa: company?.name ?? null, titulares }),
    })
      .then((r) => r.json())
      .then((d: { simples?: NoticiasSimples | null; error?: string }) => {
        if (cancelled) return;
        if (d.error) setErrTrad(d.error);
        else setSimples(d.simples ?? null);
      })
      .catch(() => { if (!cancelled) setErrTrad("No se pudieron traducir las noticias ahora mismo."); })
      .finally(() => { if (!cancelled) setTraduciendo(false); });
    return () => { cancelled = true; };
  }, [report, ticker, company?.name]);

  const porId = new Map((simples?.noticias ?? []).map((s) => [s.id, s]));

  const flag =
    report && callPct != null ? contradictionFlag(flowBias(callPct), report.bias) : null;

  return (
    <section className="card">
      <div>
        <div className="card-title">Noticias y catalizadores</div>
        <div className="card-sub">
          Por qué se está moviendo {ticker}: lo que dice la prensa, para contrastarlo con lo
          que apuesta el dinero en opciones.
        </div>
      </div>

      {!report && !failed && <div className="feed-empty">Leyendo feeds y noticias de {ticker}…</div>}
      {failed && <div className="feed-empty">No se pudieron leer las noticias ahora mismo.</div>}

      {report && (
        <>
          {/* En palabras simples: qué está pasando y cómo puede afectar */}
          {traduciendo && <div className="news-resumen cargando">🧠 Traduciendo y resumiendo las noticias en palabras simples…</div>}
          {errTrad && <div className="feed-empty">{errTrad} Abajo están los titulares originales.</div>}
          {simples && (
            <div className="news-resumen">
              <div className="news-resumen-top">
                <span className="news-resumen-kicker">🧠 En palabras simples</span>
                <span className={`news-efecto ${EFECTO[simples.resumen.efecto].cls}`}>{EFECTO[simples.resumen.efecto].txt}</span>
              </div>
              <div className="news-resumen-que">{simples.resumen.que_pasa}</div>
              <div className="news-resumen-porque"><b>Por qué:</b> {simples.resumen.por_que}</div>
              <div className="news-resumen-nota">Resumen hecho por IA a partir de los titulares de abajo. No es una recomendación.</div>
            </div>
          )}

          {flag && flag.kind !== "none" && (
            <div className={`news-flag ${flag.kind}`}>
              <div className="news-flag-title">
                {flag.kind === "conflict" ? "⚠" : "✓"} {flag.title}
              </div>
              <div className="news-flag-detail">{flag.detail}</div>
              <div className="news-flag-foot">
                Flujo {callPct}% en calls · {BIAS_LABEL[report.bias.bias]}
                {report.bias.positive + report.bias.negative > 0 &&
                  ` (${report.bias.positive}↑ / ${report.bias.negative}↓)`}
                {" "}· no altera los 100 pts del scorecard
              </div>
            </div>
          )}

          {report.company.length > 0 && (
            <div>
              <div className="news-head">De la empresa</div>
              <div className="news-list">
                {report.company.slice(0, 4).map((n) => <Article key={n.id} n={n} s={porId.get(n.id)} />)}
              </div>
            </div>
          )}

          {report.promoted.length > 0 && (
            <div>
              <div className="news-head">En los feeds RSS mencionan a {ticker}</div>
              <div className="news-list">
                {report.promoted.map((n) => <Article key={n.id} n={n} s={porId.get(n.id)} />)}
              </div>
            </div>
          )}

          <div>
            <div className="news-head">
              Clima de mercado <span className="news-head-note">— afecta a todos los tickers</span>
            </div>
            <div className="news-list">
              {report.macro.slice(0, 4).map((n) => <Article key={n.id} n={n} s={porId.get(n.id)} />)}
              {report.macro.length === 0 && (
                <div className="feed-empty">Los feeds RSS no respondieron.</div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
