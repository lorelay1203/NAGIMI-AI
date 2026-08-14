"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AggressionScore, ConvictionScore, FlowRow } from "@/lib/flow";
import type { ChainEvent, ChainMeta, CompanyInfo, DailyBar, Row } from "@/lib/types";
import type { StructureScore } from "@/lib/structure";
import type { IvContextScore } from "@/lib/ivcontext";
import type { ValidationScore } from "@/lib/validation";
import type { ChainSnapshot } from "@/lib/chainStore";
import { gexAnalysis, type TradeLite, type GexAnalysis } from "@/lib/gex";
import { gexHeatmap, type HeatTrade, type GexHeatmap } from "@/lib/gexHeatmap";
import { predictPro } from "@/lib/prediction";
import { findLevels, type ChainLevel, type FlowLevel } from "@/lib/levels";
import { int } from "./format";
import HeaderBar from "./components/HeaderBar";
import AnalysisLoader from "./components/AnalysisLoader";
import VeredictoCard from "./components/VeredictoCard";
import MemoriaCard from "./components/MemoriaCard";
import SentimentCard, { type SentimentPart } from "./components/SentimentCard";
import PredictionCard from "./components/PredictionCard";
import ActivityCard from "./components/ActivityCard";
import MoneyFlowCard from "./components/MoneyFlowCard";
import NewsCard from "./components/NewsCard";
import LevelsCard from "./components/LevelsCard";
import ProWallsCard from "./components/ProWallsCard";
import GexHeatmapCard from "./components/GexHeatmapCard";
import TradesFeed from "./components/TradesFeed";
import CompanyHeader from "./components/CompanyHeader";
import ScorecardPanel from "./components/ScorecardPanel";
import AggressionScoreCard from "./components/AggressionScoreCard";
import ConvictionCard from "./components/ConvictionCard";
import ConvictionTransactions, { type ConvictionMeta } from "./components/ConvictionTransactions";
import UnusualityCard, { type UnusualityMeta, type UnusualRow } from "./components/UnusualityCard";
import StructureCard from "./components/StructureCard";
import IvContextCard from "./components/IvContextCard";
import ValidationCard from "./components/ValidationCard";
import FlowPriceChart from "./components/FlowPriceChart";
import OptionChainTable from "./components/OptionChainTable";
import ChartPanel from "./ChartPanel";
import TradeChecklist from "./components/TradeChecklist";
import OrderBuilder from "./components/OrderBuilder";
import RecomendacionesCard from "./components/RecomendacionesCard";
import RadarCard from "./components/RadarCard";
import MisPosicionesCard from "./components/MisPosicionesCard";
import FinderCard from "./components/FinderCard";
import TastytradeCard from "./components/TastytradeCard";
import PaperTradingCard from "./components/PaperTradingCard";
import AutoScanCard from "./components/AutoScanCard";
import InstitutionalCard from "./components/InstitutionalCard";
import JournalCard from "./components/JournalCard";
import MarketSnackGexCard from "./components/MarketSnackGexCard";
import type { MsGexResult } from "@/lib/marketsnackGex";

interface FlowMeta { ticker: string; notableCount: number; shown: number }
type FlowEvent =
  | { type: "step"; label: string; detail?: string }
  | {
      type: "done";
      rows: FlowRow[];
      score: AggressionScore;
      conviction?: ConvictionScore;
      convictionRows?: FlowRow[];
      convictionMeta?: ConvictionMeta;
      unusuality?: UnusualityMeta;
      unusualRows?: UnusualRow[];
      ivContext?: IvContextScore | null;
      meta: FlowMeta;
    }
  | { type: "error"; message: string };

/** Encabezado de paso para guiar el orden de análisis (Conclusión primero). */
function SectionHead({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 2px" }}>
      <span style={{ minWidth: 26, height: 26, borderRadius: 999, background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [ticker, setTicker] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);

  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [chainRows, setChainRows] = useState<Row[] | null>(null);
  const [chainMeta, setChainMeta] = useState<ChainMeta | null>(null);
  const [bars, setBars] = useState<DailyBar[] | null>(null);
  const [structure, setStructure] = useState<StructureScore | null>(null);
  const [chainHistory, setChainHistory] = useState<ChainSnapshot[]>([]);

  const [aggScore, setAggScore] = useState<AggressionScore | null>(null);
  const [conviction, setConviction] = useState<ConvictionScore | null>(null);
  const [convRows, setConvRows] = useState<FlowRow[] | null>(null);
  const [convMeta, setConvMeta] = useState<ConvictionMeta | null>(null);
  const [unusuality, setUnusuality] = useState<UnusualityMeta | null>(null);
  const [unusualRows, setUnusualRows] = useState<UnusualRow[] | null>(null);
  const [ivContext, setIvContext] = useState<IvContextScore | null>(null);
  const [validation, setValidation] = useState<ValidationScore | null>(null);
  const [msGex, setMsGex] = useState<MsGexResult | null>(null);
  const [tradierGex, setTradierGex] = useState<GexHeatmap | null>(null);
  const [msChainGex, setMsChainGex] = useState<GexHeatmap | null>(null);
  const [notable, setNotable] = useState<FlowRow[] | null>(null);
  const [flowMeta, setFlowMeta] = useState<FlowMeta | null>(null);

  const [chainErr, setChainErr] = useState<string | null>(null);
  const [flowErr, setFlowErr] = useState<string | null>(null);
  const [showChain, setShowChain] = useState(false);
  const [horizonDays, setHorizonDays] = useState(20);
  const [tab, setTab] = useState<"analisis" | "operar">("analisis");
  // Operación elegida para la lectura institucional (clic en la tabla de inusuales).
  const [instRow, setInstRow] = useState<UnusualRow | null>(null);
  const [paperKey, setPaperKey] = useState(0); // fuerza recarga del diario tras el auto-escaneo

  // Persistencia: guardar y leer pestaña activa
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nagimi.tab");
      if (saved === "operar") setTab(saved);
    } catch { /* sin localStorage */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("nagimi.tab", tab);
    } catch { /* sin localStorage */ }
  }, [tab]);
  // Sesgo histórico (memoria) para auto-corregir los targets, y si ya se leyó.
  const [calib, setCalib] = useState<{ biasPct: number | null; samples: number }>({ biasPct: null, samples: 0 });
  const [calibReady, setCalibReady] = useState(false);

  const chainEs = useRef<EventSource | null>(null);
  const flowEs = useRef<EventSource | null>(null);
  const chainDoneRef = useRef(true);
  const flowDoneRef = useRef(true);
  const finish = () => { if (chainDoneRef.current && flowDoneRef.current) setBusy(false); };

  const top5 = useMemo(() => {
    if (!chainRows) return [];
    return [...chainRows].sort((a, b) => b.notionalValue - a.notionalValue).slice(0, 5);
  }, [chainRows]);

  // % del premium notable que está en calls — la dirección del dinero que la
  // bandera de contradicción confronta contra las noticias.
  const callPct = useMemo(() => {
    if (!convRows || convRows.length === 0) return null;
    let call = 0, put = 0;
    for (const r of convRows) {
      if (r.type === "call") call += r.premium;
      else if (r.type === "put") put += r.premium;
    }
    return call + put > 0 ? Math.round((call / (call + put)) * 100) : null;
  }, [convRows]);

  // GEX (Gamma Exposure) — nodos de concentración + predicción (nodo imán).
  // Se calcula una vez con toda la cadena de Massive + los trades reales.
  const gex = useMemo(() => {
    if (!chainRows || chainRows.length === 0 || !bars || bars.length === 0) return null;
    const spot = company?.price ?? chainMeta?.underlyingPrice ?? bars[bars.length - 1].close;
    if (!spot || spot <= 0) return null;
    // Une convicción + inusuales (dedupe por id) como los trades reales.
    const seen = new Set<number>();
    const trades: TradeLite[] = [];
    for (const r of [...(convRows ?? []), ...(unusualRows ?? [])]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      trades.push({ strike: r.strike, type: r.type, premium: r.premium, gamma: r.gamma });
    }
    return gexAnalysis({
      rows: chainRows,
      closes: bars.map((b) => b.close),
      spot,
      trades,
      convictionScore: conviction?.score ?? null,
      structureScore: structure?.score ?? null,
      lowLiquidity: structure?.notional.lowLiquidity ?? false,
      now: new Date(),
    });
  }, [chainRows, bars, company, chainMeta, convRows, unusualRows, conviction, structure]);

  // Heatmap de GEX por strike × vencimiento — abre el GEX en sus dos dimensiones.
  const heatmap = useMemo(() => {
    if (!chainRows || chainRows.length === 0 || !gex || !(gex.spot > 0)) return null;
    const seen = new Set<number>();
    const trades: HeatTrade[] = [];
    for (const r of [...(convRows ?? []), ...(unusualRows ?? [])]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      trades.push({ strike: r.strike, expiration: r.expiration, gamma: r.gamma, premium: r.premium });
    }
    return gexHeatmap({ rows: chainRows, spot: gex.spot, iv: gex.iv, trades, now: new Date() });
  }, [chainRows, gex, convRows, unusualRows]);

  // Prediction Pro — junta los 6 sub-agentes, el mapa GEX y la σ en tres escenarios.
  const prediction = useMemo(() => {
    if (!gex || !(gex.spot > 0)) return null;
    return predictPro({
      spot: gex.spot,
      iv: gex.iv,
      horizonDays,
      nodes: gex.nodes.map((n) => ({
        strike: n.strike, concentration: n.concentration, side: n.side, netGex: n.netGex,
      })),
      scores: {
        aggression: aggScore?.score ?? null,
        conviction: conviction?.score ?? null,
        unusuality: unusuality?.score ?? null,
        structure: structure?.score ?? null,
        ivContext: ivContext?.score ?? null,
        validation: validation?.score ?? null,
      },
      regime: gex.regime,
      callPct,
      hitRate: validation?.hitRate.value ?? null,
      lowLiquidity: gex.lowLiquidity,
      calibration: calib,
    });
  }, [gex, horizonDays, aggScore, conviction, unusuality, structure, ivContext, validation, callPct, calib]);

  // Memoria del agente: guarda la predicción del día (una vez por ticker/sesión). El
  // dedupe por fecha ET vive en el servidor, así que reenviar el mismo día no duplica.
  const savedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ticker || !prediction || prediction.caveat || !(prediction.spot > 0)) return;
    // Esperar a leer el sesgo: así se guarda el target YA calibrado, no el crudo.
    if (!calibReady) return;
    if (savedRef.current === ticker) return;
    savedRef.current = ticker;
    fetch("/api/prediction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker,
        snapshot: {
          spot: prediction.spot,
          horizonDays: prediction.horizonDays,
          bear: prediction.bear.target,
          base: prediction.base.target,
          bull: prediction.bull.target,
          direction: prediction.direction,
          confidence: prediction.confidence,
        },
      }),
    }).catch(() => {});
  }, [ticker, prediction, calibReady]);

  // Los 3 flows de mayor premium — lo que sostiene la lectura.
  const topFlows = useMemo(() => {
    const seen = new Set<number>();
    const all: FlowRow[] = [];
    for (const r of [...(convRows ?? []), ...(notable ?? [])]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      all.push(r);
    }
    return all.sort((a, b) => b.premium - a.premium).slice(0, 3);
  }, [convRows, notable]);

  // Soportes y resistencias: pivotes del precio × muros de opciones.
  const levels = useMemo(() => {
    if (!bars || bars.length === 0) return null;
    const spot = company?.price ?? chainMeta?.underlyingPrice ?? bars[bars.length - 1].close;
    if (!spot || spot <= 0) return null;

    const chain: ChainLevel[] = (chainRows ?? []).map((r) => ({
      strike: r.strike,
      contractType: r.contractType,
      openInterest: r.openInterest,
      notionalValue: r.notionalValue,
    }));
    const seen = new Set<number>();
    const flows: FlowLevel[] = [];
    for (const r of [...(convRows ?? []), ...(notable ?? [])]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      flows.push({ strike: r.strike, type: r.type, aggression: r.aggression, premium: r.premium });
    }
    return findLevels({
      bars, spot, chain, flows,
      gex: gex?.nodes.map((n) => ({ strike: n.strike, netGex: n.netGex })) ?? [],
      now: new Date(),
    });
  }, [bars, company, chainMeta, chainRows, convRows, notable, gex]);

  const addStep = (s: string) => setSteps((p) => (p[p.length - 1] === s ? p : [...p, s]));

  function runSearch(t: string) {
    const tk = t.trim().toUpperCase();
    if (!tk || busy) return;
    chainEs.current?.close();
    flowEs.current?.close();
    setTicker(tk);
    setBusy(true);
    setSteps([]);
    setCompany(null); setChainRows(null); setChainMeta(null); setBars(null);
    setStructure(null); setChainHistory([]);
    setAggScore(null); setConviction(null); setConvRows(null); setConvMeta(null);
    setUnusuality(null); setUnusualRows(null); setIvContext(null); setValidation(null);
    setNotable(null); setFlowMeta(null); setMsGex(null); setMsChainGex(null); setTradierGex(null);
    setChainErr(null); setFlowErr(null);
    chainDoneRef.current = false; flowDoneRef.current = false;
    setShowChain(false);
    setCalib({ biasPct: null, samples: 0 }); setCalibReady(false); savedRef.current = null;

    // Backtest del sub-agente 6 sobre los flows ya guardados (no bloquea las streams).
    fetch(`/api/validation?ticker=${encodeURIComponent(tk)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ValidationScore | null) => { if (d && !("error" in d)) setValidation(d); })
      .catch(() => {});

    // GEX real de MarketSnack (call/put wall, imán, gamma flip) — no bloquea las streams.
    fetch(`/api/gex?ticker=${encodeURIComponent(tk)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MsGexResult | null) => { if (d && !("error" in d)) setMsGex(d); })
      .catch(() => {});

    // GEX por strike con gamma REAL de MarketSnack (griegos de la cadena).
    fetch(`/api/mschain?ticker=${encodeURIComponent(tk)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: GexHeatmap | null) => { if (d && !("error" in d) && Array.isArray(d.strikes)) setMsChainGex(d); })
      .catch(() => {});

    // Respaldo estable: GEX con gamma real desde Tradier (API key, no caduca).
    fetch(`/api/tradiergex?ticker=${encodeURIComponent(tk)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: GexHeatmap | null) => { if (d && !("error" in d) && Array.isArray(d.strikes)) setTradierGex(d); })
      .catch(() => {});

    // Memoria: lee el sesgo histórico ANTES de fijar el target para auto-corregirlo.
    // Es rápido (JSON + barras cacheadas) y termina mucho antes que las streams.
    fetch(`/api/prediction?ticker=${encodeURIComponent(tk)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { biasPct?: number | null; maturedCount?: number; error?: string } | null) => {
        if (d && !d.error) setCalib({ biasPct: d.biasPct ?? null, samples: d.maturedCount ?? 0 });
      })
      .catch(() => {})
      .finally(() => setCalibReady(true));

    // Stream 1 — Massive: empresa + option chain + estructura
    const c = new EventSource(`/api/chain?ticker=${encodeURIComponent(tk)}`);
    chainEs.current = c;
    c.onmessage = (ev) => {
      const d = JSON.parse(ev.data) as ChainEvent;
      if (d.type === "step") addStep(d.label);
      else if (d.type === "company") setCompany(d.company);
      else if (d.type === "done") {
        setChainRows(d.rows); setChainMeta(d.meta); setStructure(d.structure ?? null);
        setChainHistory(d.history ?? []);
        chainDoneRef.current = true; finish(); c.close();
        fetch(`/api/history?ticker=${encodeURIComponent(d.meta.ticker)}`)
          .then((r) => r.json()).then((h) => setBars(Array.isArray(h.bars) ? h.bars : []))
          .catch(() => setBars([]));
      } else if (d.type === "error") { setChainErr(d.message); chainDoneRef.current = true; finish(); c.close(); }
    };
    c.onerror = () => { chainDoneRef.current = true; finish(); c.close(); };

    // Stream 2 — MarketSnack: agresividad + convicción + inusualidad
    const f = new EventSource(`/api/flow?ticker=${encodeURIComponent(tk)}`);
    flowEs.current = f;
    f.onmessage = (ev) => {
      const d = JSON.parse(ev.data) as FlowEvent;
      if (d.type === "step") addStep(d.label);
      else if (d.type === "done") {
        setNotable(d.rows); setAggScore(d.score);
        setConviction(d.conviction ?? null);
        setConvRows(d.convictionRows ?? null);
        setConvMeta(d.convictionMeta ?? null);
        setUnusuality(d.unusuality ?? null);
        setUnusualRows(d.unusualRows ?? null);
        setIvContext(d.ivContext ?? null);
        setFlowMeta(d.meta); flowDoneRef.current = true; finish(); f.close();
      } else if (d.type === "error") { setFlowErr(d.message); flowDoneRef.current = true; finish(); f.close(); }
    };
    f.onerror = () => { flowDoneRef.current = true; finish(); f.close(); };
  }

  // Volver a la pantalla de inicio (dashboard con radar + posiciones).
  function goHome() {
    chainEs.current?.close();
    flowEs.current?.close();
    setTicker(null); setBusy(false); setSteps([]);
    setCompany(null); setChainRows(null); setChainMeta(null); setBars(null);
    setStructure(null); setAggScore(null); setConviction(null); setConvRows(null); setConvMeta(null);
    setUnusuality(null); setUnusualRows(null); setIvContext(null); setValidation(null);
    setNotable(null); setFlowMeta(null); setMsGex(null); setMsChainGex(null); setTradierGex(null);
    setChainErr(null); setFlowErr(null);
  }

  // Contexto para el checklist: resume el análisis en valores concretos (dirección,
  // muros más cercanos, objetivo, stop, liquidez) para que las líneas sean específicas.
  const checklistCtx = useMemo(() => {
    const near = (arr: { price: number; distancePct: number; strength: number }[]) =>
      arr.filter((l) => l.strength >= 20).sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0] ?? null;
    const res = levels ? near(levels.resistances) : null;
    const sup = levels ? near(levels.supports) : null;
    const liquid = prediction != null && !prediction.caveat;
    const big = topFlows.find((f) => (f.type === "call" || f.type === "put") && typeof f.strike === "number") ?? null;
    return {
      spot: gex?.spot ?? company?.price ?? null,
      direction: prediction?.direction ?? null,
      callPct,
      confidence: prediction?.confidence ?? null,
      caveat: prediction?.caveat ?? null,
      lowLiquidity: gex?.lowLiquidity ?? null,
      baseTarget: liquid ? prediction!.base.target : null,
      baseChangePct: liquid ? prediction!.base.changePct : null,
      resistance: res ? { price: res.price, distancePct: res.distancePct } : null,
      support: sup ? { price: sup.price, distancePct: sup.distancePct } : null,
      horizonDays,
      hitRate: validation?.hitRate.value ?? null,
      gexMagnet: msGex?.latest?.magnet ?? null,
      gexCallWall: msGex?.latest?.callWall ?? null,
      gexPutWall: msGex?.latest?.putWall ?? null,
      // Señales del flujo real de este ticker (personalizan el checklist).
      aggression: aggScore?.score ?? null,
      unusualCount: unusuality?.unusualCount ?? null,
      iv: gex?.iv ?? null,
      topTrade: big ? { type: big.type as "call" | "put", strike: big.strike as number, premium: big.premium } : null,
    };
  }, [gex, company, prediction, callPct, levels, horizonDays, validation, msGex, aggScore, unusuality, topFlows]);

  // GEX para la gráfica: se prefiere el REAL de MarketSnack (gamma verdadera);
  // si no está, cae al estimado por Black-Scholes de la cadena de Massive.
  const gexChart = msChainGex && msChainGex.strikes.length > 0
    ? msChainGex
    : tradierGex && tradierGex.strikes.length > 0
    ? tradierGex
    : heatmap && heatmap.strikes.length > 0 ? heatmap : null;

  // GEX REAL (de MarketSnack/Tradier) adaptado a GexAnalysis para el Strike Walls.
  // No depende de las velas del cliente, así que evita que el card salga en ceros.
  const realGex = useMemo<GexAnalysis | null>(() => {
    const h = gexChart;
    if (!h || h.strikes.length === 0 || !(h.spot > 0)) return null;
    const maxAbs = Math.max(...h.strikes.map((s) => Math.abs(s.netGex)), 1);
    const nodes = h.strikes.map((s) => ({
      strike: s.strike, netGex: s.netGex, callGex: s.callGex, putGex: s.putGex,
      tradePremium: 0, tradeCount: 0,
      concentration: Math.min(1, Math.abs(s.netGex) / maxAbs),
      side: (s.netGex >= 0 ? "call" : "put") as "call" | "put",
    }));
    return {
      spot: h.spot,
      iv: h.iv > 0 && h.iv < 5 ? h.iv : 0.5,
      nodes,
      kingStrike: msGex?.latest?.magnet ?? null,
      flipStrike: msGex?.latest?.gammaFlip ?? null,
      regime: h.totalNetGex >= 0 ? "positive" : "negative",
      totalNetGex: h.totalNetGex,
      direction: null,
      confidence: 0,
      lowLiquidity: false,
      n: nodes.length,
    };
  }, [gexChart, msGex]);

  const started = steps.length > 0 || company != null || aggScore != null;

  // Los promedios de cada sub-agente = las señales del sentiment (y de Prediction Pro).
  const sentimentParts: SentimentPart[] = [
    { name: "Agresividad", note: "¿Compran al ask con fuerza?", score: aggScore?.score ?? null, weight: 20 },
    { name: "Convicción", note: "¿Cuánto dinero real entró?", score: conviction?.score ?? null, weight: 20 },
    { name: "Inusualidad", note: "¿Es flujo anormal? (griegos)", score: unusuality?.score ?? null, weight: 20 },
    { name: "Estructura", note: "¿Dónde se acumula el dinero?", score: structure?.score ?? null, weight: 15 },
    { name: "Contexto IV", note: "¿IV limpia o inflada?", score: ivContext?.score ?? null, weight: 10 },
    { name: "Confirmación de Precio", note: "¿El precio valida o absorbe?", score: validation?.score ?? null, weight: 15 },
  ];

  return (
    <>
      <HeaderBar ticker={ticker} company={company} busy={busy} onSearch={runSearch} onHome={goHome} />
      <main className="wrap page-stack">

        {!started && !busy && (
          <>
            <div className="card" style={{ alignItems: "center", padding: "48px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>Analiza un ticker</div>
              <div className="card-sub" style={{ maxWidth: 480 }}>
                Búscalo arriba y el agente armará el sentiment score, el flujo inusual, los muros
                de strikes y el detalle completo de cada sub-agente.
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
                <a href="/ideas" style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 13, color: "var(--text)", textDecoration: "none" }}>💡 Screener de Ideas</a>
                <a href="/wheel" style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 13, color: "var(--text)", textDecoration: "none" }}>🎡 Wheel · venta de puts</a>
                <a href="/watchlist" style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 13, color: "var(--text)", textDecoration: "none" }}>⭐ Watchlist</a>
              </div>
            </div>
            <FinderCard />
            <MisPosicionesCard onPick={runSearch} />
            <TastytradeCard />
            <AutoScanCard onRegistered={() => setPaperKey((k) => k + 1)} />
            <PaperTradingCard key={paperKey} />
            <JournalCard />
            <RadarCard onPick={runSearch} />
          </>
        )}

        {busy && <AnalysisLoader ticker={ticker} steps={steps} />}

        {chainErr && <div className="error">⚠ Option chain: {chainErr}</div>}
        {flowErr && <div className="error">⚠ Flujo: {flowErr}</div>}

        {started && ticker && (
          <>
            <div className="section-tabs">
              {([["analisis", "📊 Análisis"], ["operar", "💵 Operar"]] as const).map(([id, lbl]) => (
                <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{lbl}</button>
              ))}
            </div>

            {tab === "analisis" && (
            <>
            {/* Orden "Conclusión primero": del veredicto al detalle, paso por paso. */}

            {/* 1 · Veredicto — la respuesta */}
            <SectionHead n={1} title="Veredicto" sub="La conclusión: ¿sube o baja, y qué tan seguro?" />
            <VeredictoCard ticker={ticker} prediction={prediction} horizonDays={horizonDays} />

            {/* 2 · Sentiment y predicción — la lectura */}
            <SectionHead n={2} title="Sentiment y predicción" sub="La lectura del agente y los escenarios" />
            {chainRows && top5.length > 0 && bars !== null && (
              <ChartPanel ticker={chainMeta!.ticker} bars={bars} contracts={top5} />
            )}
            <div className="grid-2">
              <SentimentCard ticker={ticker} parts={sentimentParts} />
              <PredictionCard ticker={ticker} prediction={prediction} horizonDays={horizonDays} onHorizon={setHorizonDays} topFlows={topFlows} />
            </div>

            {/* 3 · Flujo de dinero — ¿confirma el dinero grande? */}
            <SectionHead n={3} title="Flujo de dinero" sub="¿El dinero grande confirma la dirección?" />
            {convRows && convRows.length > 0 && unusuality && (
              <div className="grid-2">
                <ActivityCard rows={convRows} unusualCount={unusuality.unusualCount} />
                <MoneyFlowCard ticker={ticker} rows={convRows} conviction={conviction} structure={structure} />
              </div>
            )}
            {/* Lectura institucional de la operación elegida (clic en la tabla de inusuales) */}
            {instRow && <InstitutionalCard row={instRow} onClose={() => setInstRow(null)} />}
            {unusualRows && <TradesFeed rows={unusualRows} />}

            {/* 4 · Niveles y muros GEX — dónde están los precios clave */}
            <SectionHead n={4} title="Niveles y muros (GEX)" sub="Soportes, resistencias y paredes de opciones" />
            {levels && (
              <div className="grid-2">
                <LevelsCard r={levels} ticker={ticker} />
                <NewsCard ticker={ticker} company={company} callPct={callPct} />
              </div>
            )}
            {!levels && <NewsCard ticker={ticker} company={company} callPct={callPct} />}
            {structure && <ProWallsCard ticker={ticker} structure={structure} gex={realGex ?? gex} horizonDays={horizonDays} levels={levels} />}
            {msGex && <MarketSnackGexCard data={msGex} />}
            {gexChart && <GexHeatmapCard h={gexChart} />}

            {/* 5 · Memoria del agente — su historial de aciertos */}
            <SectionHead n={5} title="Memoria del agente" sub="Qué tan bien predijo antes (mejora con el tiempo)" />
            <MemoriaCard ticker={ticker} />

            <div className="disclaimer">
              Las predicciones son estimaciones de IA, no consejo financiero.
            </div>

            {/* 7 · Detalle de sub-agentes — el fondo de todo */}
            <SectionHead n={7} title="Detalle de sub-agentes" sub="El fondo de todo, plegado por si lo quieres ver" />
            <details className="detalle">
              <summary>
                Detalle de sub-agentes — las tablas y promedios que alimentan Prediction Pro
              </summary>
              <div className="detalle-inner">
                {company && <CompanyHeader company={company} />}
                <ScorecardPanel aggression={aggScore} conviction={conviction} unusuality={unusuality} structure={structure} ivContext={ivContext} validation={validation} />
                {aggScore && <AggressionScoreCard score={aggScore} />}
                {conviction && <ConvictionCard conviction={conviction} />}
                {convRows && convMeta && convRows.length > 0 && (
                  <ConvictionTransactions rows={convRows} meta={convMeta} />
                )}
                {unusuality && unusualRows && unusualRows.length > 0 && (
                  <UnusualityCard meta={unusuality} rows={unusualRows} onPick={setInstRow} />
                )}
                {structure && <StructureCard s={structure} history={chainHistory} />}
                {ivContext && ivContext.iv.current != null && <IvContextCard s={ivContext} />}
                {validation && validation.coverage.flows > 0 && <ValidationCard s={validation} />}
                {notable && flowMeta && notable.length > 0 && (
                  <FlowPriceChart ticker={flowMeta.ticker} trades={notable} />
                )}
                {chainRows && chainMeta && (
                  <div>
                    <h2 className="clusters-title" style={{ cursor: "pointer" }} onClick={() => setShowChain((v) => !v)}>
                      {showChain ? "▾" : "▸"} Option Chain completo
                      <span className="muted"> — {int.format(chainMeta.contractCount)} contratos</span>
                    </h2>
                    {showChain && <OptionChainTable rows={chainRows} meta={chainMeta} />}
                  </div>
                )}
              </div>
            </details>
            </>
            )}

            {tab === "operar" && (
            <>
            <TradeChecklist ticker={ticker} ctx={checklistCtx} />

            <RecomendacionesCard
              ticker={ticker}
              input={{
                spot: checklistCtx.spot ?? 0,
                iv: gex?.iv ?? 0.4,
                direction: checklistCtx.direction,
                confidence: checklistCtx.confidence,
                callWall: checklistCtx.gexCallWall,
                putWall: checklistCtx.gexPutWall,
                magnet: checklistCtx.gexMagnet,
                caveat: checklistCtx.caveat,
                lowLiquidity: checklistCtx.lowLiquidity,
              }}
            />

            <OrderBuilder
              ticker={ticker}
              prefill={{ spot: checklistCtx.spot, direction: checklistCtx.direction, confidence: checklistCtx.confidence, callWall: checklistCtx.gexCallWall, putWall: checklistCtx.gexPutWall }}
            />
            </>
            )}

          </>
        )}
      </main>
    </>
  );
}
