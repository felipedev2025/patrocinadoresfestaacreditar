"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { RenderStatusBadge, EmptyState, Badge } from "@/components/ui";
import type { RenderStatus } from "@prisma/client";

type Render = {
  id: string;
  kind: "COLLECTIVE" | "CATEGORY" | "INDIVIDUAL";
  status: RenderStatus;
  progress: number;
  version: number;
  error: string | null;
  published: boolean;
  publishOrder: number;
  durationSec: number | null;
  sizeBytes: number | null;
  queuedAt: string;
  outdated: boolean;
  template: string;
  format: { name: string; width: number; height: number } | null;
  target: string | null;
  sponsorCount: number;
  thumbUrl: string | null;
  videoUrl: string | null;
};

const KIND = { COLLECTIVE: "Coletivo", CATEGORY: "Por categoria", INDIVIDUAL: "Individual" };

export function VideoStudio(props: {
  eventId: string;
  canCreate: boolean;
  canOperate: boolean;
  screenPath: string | null;
  templates: { id: string; name: string; description: string | null; style: string }[];
  formats: { id: string; name: string; width: number; height: number; fps: number }[];
  categories: { id: string; name: string }[];
  sponsors: { id: string; name: string; category: string | null }[];
}) {
  const { eventId } = props;
  const [renders, setRenders] = useState<Render[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Render | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ renders: Render[] }>(`/api/events/${eventId}/renders`);
      setRenders(r.renders);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [eventId]);

  // Acompanhamento do progresso: polling mais rápido enquanto houver renders ativos
  const active = renders?.some((r) => r.status === "QUEUED" || r.status === "RENDERING");
  useEffect(() => {
    void load();
    const t = setInterval(load, active ? 3000 : 20000);
    return () => clearInterval(t);
  }, [load, active]);

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    setError(null);
    try {
      await api(`/api/renders/${id}`, { method: "PATCH", json: { action, ...extra } });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const outdatedCount = renders?.filter((r) => r.outdated).length ?? 0;
  const published = (renders ?? []).filter((r) => r.published).sort((a, b) => a.publishOrder - b.publishOrder);

  return (
    <div className="space-y-6">
      {props.canCreate ? <CreateRender {...props} onCreated={load} /> : null}

      {outdatedCount > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <span>⚠ {outdatedCount} vídeo(s) desatualizado(s): houve novos patrocinadores aprovados ou alterações desde a geração.</span>
          {props.canCreate ? (
            <button
              className="btn-primary"
              onClick={async () => {
                for (const r of renders!.filter((x) => x.outdated)) await act(r.id, "regenerate");
              }}
            >
              Regenerar todos
            </button>
          ) : null}
        </div>
      ) : null}

      {props.screenPath ? (
        <section className="card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Player do telão</h2>
              <p className="text-sm text-zinc-400">
                {published.length} vídeo(s) na playlist. Abra o link no computador do telão; ele atualiza sozinho sem interromper o vídeo atual.
              </p>
            </div>
            <div className="flex gap-2">
              {props.canOperate && published.length > 1 ? (
                <button
                  className="btn-secondary"
                  title="Coletivos primeiro; depois os individuais na ordem do evento"
                  onClick={async () => {
                    setError(null);
                    try {
                      await api(`/api/events/${eventId}/renders/sort-playlist`, { method: "POST" });
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Ordenar pela ordem do evento
                </button>
              ) : null}
              <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(location.origin + props.screenPath)}>Copiar link</button>
              <a className="btn-primary" href={props.screenPath} target="_blank" rel="noopener">Abrir telão</a>
            </div>
          </div>
          {published.length > 0 ? (
            <ol className="mt-4 space-y-2">
              {published.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm">
                  <span className="w-6 text-center text-zinc-500">{i + 1}</span>
                  <span className="flex-1 truncate">{KIND[r.kind]}{r.target ? ` · ${r.target}` : ""} · {r.format?.name} · v{r.version}</span>
                  {props.canOperate ? (
                    <>
                      <button className="btn-ghost min-h-[32px] px-2 py-1" disabled={i === 0} onClick={() => act(r.id, "reorder", { publishOrder: published[i - 1]!.publishOrder - 1 })}>↑</button>
                      <button className="btn-ghost min-h-[32px] px-2 py-1" disabled={i === published.length - 1} onClick={() => act(r.id, "reorder", { publishOrder: published[i + 1]!.publishOrder + 1 })}>↓</button>
                    </>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      {error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      <section>
        <h2 className="mb-3 font-semibold">Vídeos gerados</h2>
        {renders === null ? (
          <p className="text-sm text-zinc-500">Carregando…</p>
        ) : renders.length === 0 ? (
          <EmptyState title="Nenhum vídeo ainda" text="Aprove patrocinadores e gere o primeiro vídeo coletivo em Full HD." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {renders.map((r) => (
              <article key={r.id} className="card flex flex-col gap-3 p-3">
                <button
                  className="relative aspect-video overflow-hidden rounded-xl bg-black ring-1 ring-white/10"
                  onClick={() => r.videoUrl && setPlaying(r)}
                  disabled={!r.videoUrl}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.thumbUrl ? <img src={r.thumbUrl} alt="" className="h-full w-full object-contain" /> : null}
                  {r.status === "RENDERING" || r.status === "QUEUED" ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
                      <div className="text-2xl font-bold tabular-nums">{Math.round(r.progress * 100)}%</div>
                      <div className="h-1.5 w-2/3 rounded-full bg-white/10">
                        <div className="h-1.5 rounded-full bg-brand-400 transition-all" style={{ width: `${Math.max(3, r.progress * 100)}%` }} />
                      </div>
                      <div className="text-xs text-zinc-400">{r.status === "QUEUED" ? "Aguardando na fila…" : "Renderizando no servidor…"}</div>
                    </div>
                  ) : r.videoUrl ? (
                    <span className="absolute inset-0 flex items-center justify-center text-4xl opacity-0 transition hover:bg-black/40 hover:opacity-100">▶</span>
                  ) : null}
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <RenderStatusBadge status={r.status} />
                  {r.outdated ? <Badge className="bg-amber-400/15 text-amber-300 ring-amber-400/30">Desatualizado</Badge> : null}
                  {r.published ? <Badge className="bg-brand-400/15 text-brand-300 ring-brand-400/30">No telão</Badge> : null}
                  <span className="text-xs text-zinc-500">v{r.version}</span>
                </div>
                <div className="text-sm">
                  <div className="font-medium">{KIND[r.kind]}{r.target ? ` · ${r.target}` : ""}</div>
                  <div className="text-xs text-zinc-400">
                    {r.template} · {r.format ? `${r.format.width}×${r.format.height}` : "—"} · {r.sponsorCount} patrocinador(es)
                    {r.durationSec ? ` · ${Math.round(r.durationSec)}s` : ""}
                    {r.sizeBytes ? ` · ${(r.sizeBytes / 1048576).toFixed(1)} MB` : ""}
                  </div>
                  {r.error && r.status === "FAILED" ? <div className="mt-1 line-clamp-3 text-xs text-red-300">{r.error}</div> : null}
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  {r.status === "COMPLETED" ? <a className="btn-secondary min-h-[38px] py-1.5" href={`/api/renders/${r.id}/download`}>⬇ MP4</a> : null}
                  {props.canOperate && r.status === "COMPLETED" ? (
                    <button className="btn-secondary min-h-[38px] py-1.5" onClick={() => act(r.id, r.published ? "unpublish" : "publish")}>
                      {r.published ? "Tirar do telão" : "Publicar no telão"}
                    </button>
                  ) : null}
                  {props.canCreate && r.status === "COMPLETED" ? (
                    <button className={`${r.outdated ? "btn-primary" : "btn-ghost"} min-h-[38px] py-1.5`} onClick={() => act(r.id, "regenerate")}>Regenerar</button>
                  ) : null}
                  {props.canCreate && (r.status === "FAILED" || r.status === "CANCELED") ? <button className="btn-primary min-h-[38px] py-1.5" onClick={() => act(r.id, "retry")}>Tentar novamente</button> : null}
                  {props.canCreate && r.status === "QUEUED" ? <button className="btn-ghost min-h-[38px] py-1.5" onClick={() => act(r.id, "cancel")}>Cancelar</button> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {playing?.videoUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setPlaying(null)}>
          <video src={playing.videoUrl} controls autoPlay muted className="max-h-full max-w-full rounded-xl" onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}
    </div>
  );
}

function CreateRender(props: {
  eventId: string;
  templates: { id: string; name: string; description: string | null; style: string }[];
  formats: { id: string; name: string; width: number; height: number; fps: number }[];
  categories: { id: string; name: string }[];
  sponsors: { id: string; name: string; category: string | null }[];
  onCreated: () => Promise<void>;
}) {
  const [kind, setKind] = useState<"COLLECTIVE" | "CATEGORY" | "INDIVIDUAL">("COLLECTIVE");
  const [templateId, setTemplateId] = useState(props.templates[0]?.id ?? "");
  const [formatId, setFormatId] = useState(props.formats[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(props.categories[0]?.id ?? "");
  const [sponsorshipId, setSponsorshipId] = useState<string>("ALL");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quality, setQuality] = useState("crf:18");
  const [showNames, setShowNames] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const [mode, value] = quality.split(":");
      const r = await api<{ renderIds: string[] }>(`/api/events/${props.eventId}/renders`, {
        method: "POST",
        json: {
          kind,
          templateId,
          formatId,
          categoryId: kind === "CATEGORY" ? categoryId : null,
          sponsorshipId: kind === "INDIVIDUAL" && sponsorshipId !== "ALL" ? sponsorshipId : null,
          allIndividuals: kind === "INDIVIDUAL" && sponsorshipId === "ALL",
          selectedIds: kind === "COLLECTIVE" && selectMode ? [...selected] : null,
          crf: mode === "crf" ? Number(value) : null,
          videoBitrate: mode === "br" ? value : null,
          showSponsorNames: showNames,
        },
      });
      setMsg({ ok: true, text: `${r.renderIds.length} vídeo(s) enviado(s) para a fila de renderização.` });
      await props.onCreated();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-4">
      <h2 className="font-semibold">Gerar novo vídeo</h2>
      {props.sponsors.length === 0 ? <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">Nenhum patrocinador aprovado com logotipo ainda.</p> : null}
      <div className="grid grid-cols-3 gap-2">
        {(["COLLECTIVE", "CATEGORY", "INDIVIDUAL"] as const).map((k) => (
          <button key={k} className={`rounded-xl border px-3 py-3 text-sm font-medium ${kind === k ? "border-brand-400 bg-brand-400/15" : "border-white/10 bg-white/5"}`} onClick={() => setKind(k)}>
            {KIND[k]}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Template</label>
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {props.templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">{props.templates.find((t) => t.id === templateId)?.description}</p>
        </div>
        <div>
          <label className="label">Formato do telão</label>
          <select className="input" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
            {props.formats.map((f) => (
              <option key={f.id} value={f.id}>{f.name} — {f.width}×{f.height} @ {f.fps}fps</option>
            ))}
          </select>
        </div>
        {kind === "CATEGORY" ? (
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {props.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        ) : null}
        {kind === "INDIVIDUAL" ? (
          <div>
            <label className="label">Patrocinador</label>
            <select className="input" value={sponsorshipId} onChange={(e) => setSponsorshipId(e.target.value)}>
              <option value="ALL">Todos os aprovados (um vídeo para cada)</option>
              {props.sponsors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.category ? ` (${s.category})` : ""}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label className="label">Qualidade</label>
          <select className="input" value={quality} onChange={(e) => setQuality(e.target.value)}>
            <option value="crf:18">Alta (CRF 18) — recomendado</option>
            <option value="crf:14">Máxima (CRF 14) — arquivos maiores</option>
            <option value="crf:23">Leve (CRF 23) — redes sociais</option>
            <option value="br:8M">Bitrate fixo 8 Mbps</option>
            <option value="br:15M">Bitrate fixo 15 Mbps</option>
            <option value="br:25M">Bitrate fixo 25 Mbps (4K)</option>
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5 accent-amber-400" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} />
        Mostrar o nome do patrocinador embaixo do logo (desmarcado: só as imagens)
      </label>
      {kind === "COLLECTIVE" ? (
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-amber-400" checked={selectMode} onChange={(e) => setSelectMode(e.target.checked)} />
            Escolher manualmente os patrocinadores (padrão: todos os aprovados)
          </label>
          {selectMode ? (
            <div className="mt-3 grid max-h-64 gap-1 overflow-y-auto rounded-xl border border-white/10 p-2 sm:grid-cols-2">
              {props.sponsors.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5">
                  <input
                    type="checkbox"
                    className="accent-amber-400"
                    checked={selected.has(s.id)}
                    onChange={(e) => {
                      const n = new Set(selected);
                      if (e.target.checked) n.add(s.id);
                      else n.delete(s.id);
                      setSelected(n);
                    }}
                  />
                  {s.name} <span className="text-xs text-zinc-500">{s.category}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <button className="btn-primary w-full sm:w-auto" disabled={busy || props.sponsors.length === 0 || (selectMode && kind === "COLLECTIVE" && selected.size === 0)} onClick={submit}>
        {busy ? "Enviando…" : "🎬 Gerar MP4"}
      </button>
      {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p> : null}
    </section>
  );
}
