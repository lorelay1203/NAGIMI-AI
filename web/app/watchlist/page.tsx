"use client";

// Lista de seguimiento (Watchlist) — tickers/contratos que marcaste como favoritos.
// Vive en tu navegador (localStorage); al servidor solo sube el ticker si el broker
// elegido sincroniza por MCP. Portada del repositorio de origen.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WatchlistCard from "@/app/components/WatchlistCard";
import NextStepsCard from "@/app/components/NextStepsCard";
import { buildWatchlistNextSteps } from "@/lib/nextSteps";
import {
  brokerById,
  remove,
  upsert,
  type OutboxItem,
  type WatchlistEntry,
} from "@/lib/watchlist";
import {
  hasMigrated,
  loadBroker,
  loadEntries,
  markMigrated,
  saveBroker,
  saveEntries,
} from "@/lib/watchlistLocal";

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [broker, setBroker] = useState("none");
  const [pending, setPending] = useState<OutboxItem[]>([]);
  const [failed, setFailed] = useState<OutboxItem[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const applySync = useCallback(
    (d: { pending?: OutboxItem[]; failed?: OutboxItem[]; lastSyncedAt?: string | null }) => {
      setPending(d.pending ?? []);
      setFailed(d.failed ?? []);
      setLastSyncedAt(d.lastSyncedAt ?? null);
    },
    [],
  );

  // Copia siempre-fresca: evita perder lo marcado si la carga inicial sigue en vuelo.
  const wlRef = useRef<WatchlistEntry[]>([]);
  const applyWatchlist = useCallback((next: WatchlistEntry[]) => {
    wlRef.current = next;
    setWatchlist(next);
    saveEntries(next);
  }, []);

  useEffect(() => {
    const b = loadBroker();
    setBroker(b);
    applyWatchlist(loadEntries());

    // Importación única del viejo data/watchlist.json, para no perder lo ya marcado.
    fetch(`/api/watchlist?broker=${encodeURIComponent(b)}`)
      .then((r) => r.json())
      .then((d: {
        pending: OutboxItem[];
        failed?: OutboxItem[];
        lastSyncedAt?: string | null;
        legacy?: { entries: WatchlistEntry[]; broker: string };
      }) => {
        applySync(d);
        if (hasMigrated() || !d.legacy?.entries?.length) return;
        applyWatchlist(d.legacy.entries.reduce((acc, e) => upsert(acc, e), wlRef.current));
        if (d.legacy.broker && d.legacy.broker !== "none" && b === "none") {
          setBroker(d.legacy.broker);
          saveBroker(d.legacy.broker);
        }
        markMigrated();
      })
      .catch(() => null);
  }, [applyWatchlist, applySync]);

  const changeBroker = useCallback((id: string) => {
    setBroker(id);
    saveBroker(id);
    // Al cambiar de broker, refresca el estado de la cola desde el servidor.
    fetch(`/api/watchlist?broker=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then(applySync)
      .catch(() => null);
  }, [applySync]);

  const unstar = useCallback((symbol: string) => {
    applyWatchlist(remove(wlRef.current, symbol));
  }, [applyWatchlist]);

  const count = useMemo(() => watchlist.length, [watchlist]);

  return (
    <main className="ideas-page">
      <div className="ideas-body">
        <div className="page-head">
          <div className="eyebrow">{count} guardado{count === 1 ? "" : "s"}</div>
          <h1>⭐ Watchlist</h1>
          <p>
            Los contratos que marcaste, con la foto del momento en que los guardaste.
            Aquí lo que corre es el calendario: se vencen solos.
          </p>
        </div>

        {watchlist.length > 0 && (
          <NextStepsCard ticker="watchlist" steps={buildWatchlistNextSteps(watchlist, new Date())} />
        )}

        <WatchlistCard
          entries={watchlist}
          broker={broker}
          pending={pending}
          failed={failed}
          lastSyncedAt={lastSyncedAt}
          onBrokerChange={changeBroker}
          onRemove={unstar}
        />

        {watchlist.length === 0 && (
          <div className="card" style={{ color: "var(--muted)", fontSize: 13 }}>
            Tu lista está vacía. Marca tickers con la ⭐ desde el screener de <a href="/ideas" style={{ color: "var(--accent)" }}>Ideas</a> o <a href="/wheel" style={{ color: "var(--accent)" }}>Wheel</a> para guardarlos aquí.
          </div>
        )}
      </div>
    </main>
  );
}
