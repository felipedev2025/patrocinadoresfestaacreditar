"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { DisplayFormat, SponsorCategory } from "@prisma/client";

function useAction() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, ok = "Salvo!") {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  const view = msg ? <p className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p> : null;
  return { run, busy, view };
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm text-zinc-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ Identidade

type Identity = {
  name: string; edition: string; year: number; venue: string; status: string;
  primaryColor: string; secondaryColor: string; accentColor: string; textColor: string;
  fontFamily: string; headline: string; thankYouMessage: string;
};

export function IdentityForm({ eventId, initial, logoUrl }: { eventId: string; initial: Identity; logoUrl: string | null }) {
  const [v, setV] = useState(initial);
  const { run, busy, view } = useAction();
  const set = (k: keyof Identity) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV({ ...v, [k]: k === "year" ? Number(e.target.value) : e.target.value });

  async function uploadLogo(f: File | undefined) {
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    fd.set("kind", "logo");
    await run(async () => {
      const res = await fetch(`/api/events/${eventId}/assets`, { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "Falha no envio");
    }, "Logotipo do evento atualizado");
  }

  return (
    <Section title="Identidade visual" subtitle="Aplicada automaticamente em todos os vídeos e templates.">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="checker flex h-24 w-40 items-center justify-center rounded-xl ring-1 ring-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl ? <img src={logoUrl} alt="Logotipo do evento" className="max-h-20 max-w-36 object-contain" /> : <span className="text-xs text-zinc-500">sem logotipo</span>}
        </div>
        <label className="btn-secondary cursor-pointer">
          Enviar logotipo oficial
          <input type="file" hidden accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(e) => uploadLogo(e.target.files?.[0])} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2"><label className="label">Nome</label><input className="input" value={v.name} onChange={set("name")} /></div>
        <div><label className="label">Ano</label><input className="input" type="number" value={v.year} onChange={set("year")} /></div>
        <div><label className="label">Edição</label><input className="input" value={v.edition} onChange={set("edition")} /></div>
        <div className="sm:col-span-2"><label className="label">Local</label><input className="input" value={v.venue} onChange={set("venue")} /></div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={v.status} onChange={set("status")}>
            <option value="DRAFT">Rascunho</option><option value="ACTIVE">Ativo</option><option value="FINISHED">Encerrado</option><option value="ARCHIVED">Arquivado</option>
          </select>
        </div>
        <div><label className="label">Fonte</label><input className="input" value={v.fontFamily} onChange={set("fontFamily")} /></div>
        {(["primaryColor", "secondaryColor", "accentColor", "textColor"] as const).map((k) => (
          <div key={k}>
            <label className="label">{{ primaryColor: "Cor principal (fundo)", secondaryColor: "Cor secundária", accentColor: "Cor de destaque", textColor: "Cor do texto" }[k]}</label>
            <div className="flex gap-2">
              <input type="color" className="h-12 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent" value={v[k]} onChange={set(k)} />
              <input className="input font-mono" value={v[k]} onChange={set(k)} maxLength={7} />
            </div>
          </div>
        ))}
        <div className="sm:col-span-2"><label className="label">Chamada do vídeo individual</label><input className="input" value={v.headline} onChange={set("headline")} maxLength={80} /></div>
        <div className="sm:col-span-2"><label className="label">Mensagem de agradecimento</label><input className="input" value={v.thankYouMessage} onChange={set("thankYouMessage")} maxLength={160} /></div>
      </div>
      <div className="flex items-center gap-3">
        <button
          className="btn-primary"
          disabled={busy}
          onClick={() => run(() => api(`/api/events/${eventId}`, { method: "PATCH", json: { ...v, edition: v.edition || null, venue: v.venue || null } }))}
        >
          Salvar identidade
        </button>
        {view}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ Categorias

type Cat = Pick<SponsorCategory, "id" | "name" | "sortOrder" | "displaySeconds" | "logoScale" | "appearances" | "animation" | "highlight" | "includeInCollective" | "includeIndividual" | "color">;

export function CategoriesEditor({ eventId, categories }: { eventId: string; categories: Cat[] }) {
  const [rows, setRows] = useState<Cat[]>(categories);
  const [newName, setNewName] = useState("");
  const { run, busy, view } = useAction();
  useEffect(() => setRows(categories), [categories]);
  const upd = (i: number, patch: Partial<Cat>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Section title="Categorias de patrocínio" subtitle="Tempo de exposição, destaque, aparições, ordem e animação de cada categoria.">
      <div className="space-y-3">
        {rows.map((c, i) => (
          <div key={c.id} className="rounded-xl border border-white/10 p-3">
            <div className="grid gap-2 sm:grid-cols-6">
              <div className="flex gap-2 sm:col-span-2">
                <input type="color" className="h-12 w-12 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent" value={c.color} onChange={(e) => upd(i, { color: e.target.value })} />
                <input className="input" value={c.name} onChange={(e) => upd(i, { name: e.target.value })} />
              </div>
              <label className="text-xs text-zinc-400">Ordem<input className="input mt-1" type="number" value={c.sortOrder} onChange={(e) => upd(i, { sortOrder: Number(e.target.value) })} /></label>
              <label className="text-xs text-zinc-400">Segundos<input className="input mt-1" type="number" step={0.5} min={1} max={30} value={c.displaySeconds} onChange={(e) => upd(i, { displaySeconds: Number(e.target.value) })} /></label>
              <label className="text-xs text-zinc-400">Tamanho<input className="input mt-1" type="number" step={0.05} min={0.4} max={1.6} value={c.logoScale} onChange={(e) => upd(i, { logoScale: Number(e.target.value) })} /></label>
              <label className="text-xs text-zinc-400">Aparições<input className="input mt-1" type="number" min={1} max={5} value={c.appearances} onChange={(e) => upd(i, { appearances: Number(e.target.value) })} /></label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <select className="input w-auto py-2" value={c.animation} onChange={(e) => upd(i, { animation: e.target.value })}>
                <option value="fade">Fade</option><option value="zoom">Zoom</option><option value="slide">Deslizar</option><option value="spotlight">Holofote</option>
              </select>
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-amber-400" checked={c.highlight} onChange={(e) => upd(i, { highlight: e.target.checked })} /> Destaque premium</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-amber-400" checked={c.includeInCollective} onChange={(e) => upd(i, { includeInCollective: e.target.checked })} /> Vídeo coletivo</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-amber-400" checked={c.includeIndividual} onChange={(e) => upd(i, { includeIndividual: e.target.checked })} /> Vídeo individual</label>
              <span className="flex-1" />
              <button className="btn-secondary min-h-[36px] py-1.5" disabled={busy} onClick={() => run(() => { const { id, ...data } = c; return api(`/api/categories/${id}`, { method: "PATCH", json: data }); })}>Salvar</button>
              <button className="btn-ghost min-h-[36px] py-1.5 text-red-300" disabled={busy} onClick={() => confirm(`Excluir a categoria "${c.name}"? Os patrocinadores ficarão sem categoria.`) && run(() => api(`/api/categories/${c.id}`, { method: "DELETE" }), "Categoria excluída")}>Excluir</button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input" placeholder="Nova categoria" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button
          className="btn-primary"
          disabled={busy || newName.trim().length < 2}
          onClick={() => run(async () => { await api(`/api/events/${eventId}/categories`, { method: "POST", json: { name: newName.trim(), sortOrder: (rows.at(-1)?.sortOrder ?? 0) + 10 } }); setNewName(""); }, "Categoria criada")}
        >
          Adicionar
        </button>
      </div>
      {view}
    </Section>
  );
}

// ------------------------------------------------------------------ Formatos

export function FormatsEditor({ eventId, formats }: { eventId: string; formats: DisplayFormat[] }) {
  const [f, setF] = useState({ name: "", width: 1920, height: 1080, fps: 30, safeMarginPct: 5, notes: "" });
  const { run, busy, view } = useAction();
  return (
    <Section title="Formatos de telão" subtitle="Cadastre a resolução real de cada painel de LED. O layout se adapta automaticamente à área segura.">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {formats.map((x) => (
          <div key={x.id} className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-sm">
            <div>
              <div className="font-medium">{x.name}</div>
              <div className="text-xs text-zinc-400">{x.width}×{x.height} · {x.fps}fps · margem {x.safeMarginPct}%{x.notes ? ` · ${x.notes}` : ""}</div>
            </div>
            {!x.isPreset ? <button className="btn-ghost min-h-[32px] px-2 py-1 text-red-300" onClick={() => run(() => api(`/api/formats/${x.id}`, { method: "DELETE" }), "Formato removido")}>✕</button> : null}
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-6">
        <input className="input sm:col-span-2" placeholder="Nome (ex.: Painel LED palco)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="input" type="number" placeholder="Largura" value={f.width} onChange={(e) => setF({ ...f, width: Number(e.target.value) })} />
        <input className="input" type="number" placeholder="Altura" value={f.height} onChange={(e) => setF({ ...f, height: Number(e.target.value) })} />
        <select className="input" value={f.fps} onChange={(e) => setF({ ...f, fps: Number(e.target.value) })}>
          {[24, 25, 30, 50, 60].map((n) => <option key={n} value={n}>{n} fps</option>)}
        </select>
        <input className="input" type="number" step={0.5} title="Margem de segurança (%)" value={f.safeMarginPct} onChange={(e) => setF({ ...f, safeMarginPct: Number(e.target.value) })} />
        <input className="input sm:col-span-5" placeholder="Especificações do processador / observações" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <button className="btn-primary" disabled={busy || f.name.trim().length < 2} onClick={() => run(() => api(`/api/events/${eventId}/formats`, { method: "POST", json: { ...f, notes: f.notes || null } }), "Formato cadastrado")}>Adicionar</button>
      </div>
      {view}
    </Section>
  );
}

// ------------------------------------------------------------------ Equipe

const ROLE = { ORGANIZER: "Organizador", CAPTADOR: "Captador", OPERATOR: "Operador de telão" } as const;

export function MembersEditor({ eventId, isAdmin, members }: { eventId: string; isAdmin: boolean; members: { userId: string; name: string; email: string; role: keyof typeof ROLE }[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<keyof typeof ROLE>("CAPTADOR");
  const { run, busy, view } = useAction();
  return (
    <Section title="Equipe do evento" subtitle="Captadores só veem e alteram os próprios cadastros, apenas neste evento.">
      <ul className="divide-y divide-white/5">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0"><span className="block truncate font-medium">{m.name}</span><span className="block truncate text-xs text-zinc-500">{m.email}</span></span>
            <span className="flex items-center gap-2">
              <span className="text-zinc-400">{ROLE[m.role]}</span>
              {m.role !== "ORGANIZER" || isAdmin ? (
                <button className="btn-ghost min-h-[32px] px-2 py-1 text-red-300" onClick={() => run(() => api(`/api/events/${eventId}/members`, { method: "DELETE", json: { userId: m.userId } }), "Removido")}>✕</button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className="input" type="email" placeholder="E-mail do usuário cadastrado" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="input sm:w-56" value={role} onChange={(e) => setRole(e.target.value as keyof typeof ROLE)}>
          <option value="CAPTADOR">Captador</option>
          <option value="OPERATOR">Operador de telão</option>
          {isAdmin ? <option value="ORGANIZER">Organizador</option> : null}
        </select>
        <button className="btn-primary" disabled={busy || !email} onClick={() => run(async () => { await api(`/api/events/${eventId}/members`, { method: "POST", json: { email, role } }); setEmail(""); }, "Membro vinculado")}>Vincular</button>
      </div>
      {view}
    </Section>
  );
}

// ------------------------------------------------------------------ Links de envio

type Link = { id: string; label: string | null; expiresAt: string | null; maxUses: number; uses: number; revokedAt: string | null; createdAt: string; category: { name: string } | null; createdBy: { name: string } | null };

export function UploadLinksEditor({ eventId, categories }: { eventId: string; categories: { id: string; name: string }[] }) {
  const [links, setLinks] = useState<Link[]>([]);
  const [form, setForm] = useState({ label: "", categoryId: "", expiresInDays: 15, maxUses: 1 });
  const [created, setCreated] = useState<string | null>(null);
  const { run, busy, view } = useAction();
  const load = () => api<{ links: Link[] }>(`/api/events/${eventId}/upload-links`).then((r) => setLinks(r.links)).catch(() => {});
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  return (
    <Section title="Links para envio de logotipos" subtitle="O próprio patrocinador envia nome e logotipo. Tudo fica pendente de aprovação.">
      <div className="grid gap-2 sm:grid-cols-5">
        <input className="input sm:col-span-2" placeholder="Identificação (ex.: Padaria do João)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
          <option value="">Categoria (opcional)</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="text-xs text-zinc-400">Expira em (dias)<input className="input mt-1" type="number" min={1} max={365} value={form.expiresInDays} onChange={(e) => setForm({ ...form, expiresInDays: Number(e.target.value) })} /></label>
        <label className="text-xs text-zinc-400">Limite de usos<input className="input mt-1" type="number" min={1} max={100} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })} /></label>
      </div>
      <button
        className="btn-primary"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const r = await api<{ url: string }>(`/api/events/${eventId}/upload-links`, {
              method: "POST",
              json: { label: form.label || null, categoryId: form.categoryId || null, expiresInDays: form.expiresInDays, maxUses: form.maxUses },
            });
            setCreated(r.url);
            await load();
          }, "Link gerado")
        }
      >
        Gerar link seguro
      </button>
      {created ? (
        <div className="space-y-2 rounded-xl border border-brand-400/40 bg-brand-400/10 p-3 text-sm">
          <p className="text-brand-100">Copie agora — por segurança, este link não será exibido novamente.</p>
          <code className="block break-all rounded bg-black/40 p-2 text-xs">{created}</code>
          <div className="flex gap-2">
            <button className="btn-secondary min-h-[38px] py-1.5" onClick={() => navigator.clipboard.writeText(created)}>Copiar</button>
            <a className="btn-secondary min-h-[38px] py-1.5" target="_blank" rel="noopener" href={`https://wa.me/?text=${encodeURIComponent(`Envie o logotipo da sua empresa para o telão do evento: ${created}`)}`}>Enviar por WhatsApp</a>
          </div>
        </div>
      ) : null}
      {view}
      {links.length > 0 ? (
        <ul className="divide-y divide-white/5 text-sm">
          {links.map((l) => {
            const expired = l.expiresAt && new Date(l.expiresAt) < new Date();
            const state = l.revokedAt ? "Desativado" : expired ? "Expirado" : l.uses >= l.maxUses ? "Utilizado" : "Ativo";
            return (
              <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate">{l.label || "Sem identificação"}</span>
                  <span className="block text-xs text-zinc-500">
                    {l.uses}/{l.maxUses} usos · {l.expiresAt ? `expira ${new Date(l.expiresAt).toLocaleDateString("pt-BR")}` : "sem expiração"}{l.createdBy ? ` · ${l.createdBy.name}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={state === "Ativo" ? "text-emerald-300" : "text-zinc-500"}>{state}</span>
                  {state === "Ativo" ? <button className="btn-ghost min-h-[32px] px-2 py-1 text-red-300" onClick={() => run(async () => { await api(`/api/upload-links/${l.id}`, { method: "DELETE" }); await load(); }, "Link desativado")}>Desativar</button> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Section>
  );
}

// ------------------------------------------------------------------ Nova edição

export function DuplicateEdition({ eventId, name, year }: { eventId: string; name: string; year: number }) {
  const router = useRouter();
  const [y, setY] = useState(year + 1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Section title="Criar próxima edição" subtitle="Copia identidade, categorias, telões e equipe. Patrocinadores serão sugeridos para reconfirmação.">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className="input sm:w-40" type="number" value={y} onChange={(e) => setY(Number(e.target.value))} />
        <button
          className="btn-secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              const r = await api<{ event: { id: string } }>(`/api/events/${eventId}/duplicate`, { method: "POST", json: { year: y, copyMembers: true } });
              router.push(`/eventos/${r.event.id}/configuracoes`);
            } catch (e) {
              setErr((e as Error).message);
              setBusy(false);
            }
          }}
        >
          Criar {name} {y}
        </button>
      </div>
      {err ? <p className="text-sm text-red-300">{err}</p> : null}
    </Section>
  );
}
