"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Item = { id: string; cacheKey: string; url: string; durationSec: number | null };
type Playlist = { event: { name: string; year: number; background: string }; items: Item[]; generatedAt: string };

const CACHE = "telao-videos-v1";
const POLL_MS = 30_000;
const hasCacheApi = () => typeof window !== "undefined" && "caches" in window && window.isSecureContext;
const cacheReq = (key: string) => new Request(`/__telao-cache/${key}`);

/**
 * Player de telão:
 * - tela cheia, sem controles, sem áudio, loop infinito;
 * - atualiza a playlist a cada 30s e aplica as mudanças somente ao fim do vídeo atual;
 * - baixa os vídeos para o Cache Storage do navegador e reproduz a partir do disco local
 *   (continua funcionando com internet instável ou ausente);
 * - modo de contingência: reproduz arquivos MP4 escolhidos do computador.
 */
export function ScreenPlayer({ slug, screenKey }: { slug: string; screenKey: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playlistRef = useRef<Item[]>([]);
  const indexRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);
  const localFilesRef = useRef<File[] | null>(null);
  const [bg, setBg] = useState("#000000");
  const [status, setStatus] = useState("Carregando playlist…");
  const [overlay, setOverlay] = useState(false);
  const [offline, setOffline] = useState(false);
  const [cached, setCached] = useState(0);
  const storageKey = `telao:${slug}`;

  // ---------- cache local dos vídeos
  const ensureCached = useCallback(async (items: Item[]) => {
    if (!hasCacheApi()) return;
    const cache = await caches.open(CACHE);
    let n = 0;
    for (const it of items) {
      if (await cache.match(cacheReq(it.cacheKey))) {
        n++;
        continue;
      }
      try {
        const res = await fetch(it.url);
        if (!res.ok) continue;
        const blob = await res.blob();
        await cache.put(cacheReq(it.cacheKey), new Response(blob, { headers: { "Content-Type": "video/mp4" } }));
        n++;
      } catch {
        /* tenta de novo na próxima atualização */
      }
    }
    // remove vídeos que saíram da playlist
    const keep = new Set(items.map((i) => new URL(cacheReq(i.cacheKey).url).pathname));
    for (const req of await cache.keys()) if (!keep.has(new URL(req.url).pathname)) await cache.delete(req);
    setCached(n);
  }, []);

  const sourceFor = useCallback(async (it: Item): Promise<string> => {
    if (hasCacheApi()) {
      const hit = await (await caches.open(CACHE)).match(cacheReq(it.cacheKey));
      if (hit) return URL.createObjectURL(await hit.blob());
    }
    return it.url;
  }, []);

  // ---------- reprodução
  const playIndex = useCallback(
    async (i: number) => {
      const v = videoRef.current;
      if (!v) return;
      let src: string | null = null;
      if (localFilesRef.current?.length) {
        const files = localFilesRef.current;
        indexRef.current = i % files.length;
        src = URL.createObjectURL(files[indexRef.current]!);
      } else {
        const list = playlistRef.current;
        if (list.length === 0) {
          v.removeAttribute("src");
          v.load();
          setStatus("Nenhum vídeo publicado no telão.");
          return;
        }
        indexRef.current = i % list.length;
        src = await sourceFor(list[indexRef.current]!);
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = src.startsWith("blob:") ? src : null;
      setStatus("");
      v.src = src;
      v.loop = (localFilesRef.current?.length ?? playlistRef.current.length) === 1;
      await v.play().catch(() => setStatus("Clique na tela para iniciar a reprodução"));
    },
    [sourceFor],
  );

  // ---------- atualização periódica da playlist
  useEffect(() => {
    let stop = false;
    async function refresh(first: boolean) {
      let data: Playlist | null = null;
      try {
        const res = await fetch(`/api/telao/${slug}?k=${encodeURIComponent(screenKey)}`, { cache: "no-store" });
        if (res.ok) {
          data = (await res.json()) as Playlist;
          try {
            localStorage.setItem(storageKey, JSON.stringify(data));
          } catch {}
          setOffline(false);
        } else if (res.status === 404) {
          setStatus("Telão não encontrado. Verifique o link.");
          return;
        }
      } catch {
        setOffline(true);
      }
      if (!data) {
        try {
          const saved = localStorage.getItem(storageKey);
          if (saved) data = JSON.parse(saved) as Playlist;
        } catch {}
      }
      if (!data || stop) return;
      setBg(data.event.background);
      const changed = data.items.map((i) => i.cacheKey).join() !== playlistRef.current.map((i) => i.cacheKey).join();
      playlistRef.current = data.items; // aplicado no próximo "ended" — não interrompe o vídeo atual
      if (first || (changed && videoRef.current && (!videoRef.current.src || videoRef.current.loop))) {
        if (!first && videoRef.current?.loop) videoRef.current.loop = data.items.length === 1;
        if (first || !videoRef.current?.src) await playIndex(0);
      }
      void ensureCached(data.items);
    }
    void refresh(true);
    const t = setInterval(() => void refresh(false), POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [slug, screenKey, storageKey, playIndex, ensureCached]);

  // ---------- tela sempre ligada e overlay de controles ao mover o mouse
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      setOverlay(true);
      clearTimeout(timer);
      timer = setTimeout(() => setOverlay(false), 3000);
    };
    window.addEventListener("mousemove", show);
    window.addEventListener("touchstart", show);
    return () => {
      void lock?.release();
      window.removeEventListener("mousemove", show);
      window.removeEventListener("touchstart", show);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: bg, cursor: overlay ? "default" : "none" }} onClick={() => videoRef.current?.play().catch(() => {})}>
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        muted
        playsInline
        autoPlay
        preload="auto"
        onEnded={() => void playIndex(indexRef.current + 1)}
        onError={() => setTimeout(() => void playIndex(indexRef.current + 1), 1500)}
      />
      {status ? <div className="absolute inset-0 flex items-center justify-center text-lg text-white/60">{status}</div> : null}
      <div className={`absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-black/80 to-transparent p-4 text-sm text-white transition-opacity ${overlay ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <button className="btn-secondary" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>Tela cheia</button>
        <label className="btn-secondary cursor-pointer">
          Contingência: arquivos locais
          <input
            type="file"
            accept="video/mp4"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              localFilesRef.current = files.length ? files : null;
              void playIndex(0);
            }}
          />
        </label>
        {localFilesRef.current ? (
          <button className="btn-secondary" onClick={() => { localFilesRef.current = null; void playIndex(0); }}>Voltar à playlist online</button>
        ) : null}
        <span className="ml-auto text-white/70">
          {offline ? "⚠ Sem conexão — reproduzindo do cache" : "● Online"} · {playlistRef.current.length} vídeo(s) · {cached} em cache local
        </span>
      </div>
    </div>
  );
}
