"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

type Row = { key: string; order: number; company: string; seller: string; quotaValue: string; paymentMethod: string; notes: string };
type ParseResponse = { source: "CSV" | "XLSX" | "PDF" | "IMAGE"; rows: Omit<Row, "key">[]; warnings: string[] };

const ACCEPT = ".xlsx,.csv,.pdf,image/jpeg,image/png,image/webp,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
let seq = 0;
const newKey = () => `r${++seq}`;

/**
 * Importação em 2 etapas: (1) leitura do arquivo no servidor, sem gravar nada;
 * (2) revisão editável — obrigatória, porque listas manuscritas podem ser lidas errado — e gravação.
 * Todo texto lido é exibido como texto (React escapa); nada é interpretado como HTML.
 */
export function ImportWizard({
  eventId,
  maxMb,
  aiEnabled,
  onDone,
  onActiveChange,
}: {
  eventId: string;
  maxMb: number;
  aiEnabled: boolean;
  onDone: (listId: string) => void;
  onActiveChange?: (active: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<ParseResponse["source"] | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [name, setName] = useState(`Lista oficial ${new Date().toLocaleDateString("pt-BR")}`);
  const [busy, setBusy] = useState<"reading" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Informa ao painel se há importação em andamento (arquivo escolhido ou revisão aberta)
  useEffect(() => {
    onActiveChange?.(!!file || !!rows);
  }, [file, rows, onActiveChange]);

  async function read(f: File) {
    if (f.size > maxMb * 1048576) {
      setError(`Arquivo maior que ${maxMb} MB`);
      return;
    }
    setFile(f);
    setBusy("reading");
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", f);
      const res = await fetch(`/api/events/${eventId}/lists/parse`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha na leitura");
      const parsed = data as ParseResponse;
      setSource(parsed.source);
      setWarnings(parsed.warnings);
      setRows(parsed.rows.map((r) => ({ ...r, key: newKey() })));
    } catch (e) {
      setError((e as Error).message);
      setRows(null);
    } finally {
      setBusy(null);
    }
  }

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function renumber() {
    setRows((rs) => rs!.map((r, i) => ({ ...r, order: i + 1 })));
  }

  async function save() {
    if (!rows) return;
    setBusy("saving");
    setError(null);
    try {
      const fd = new FormData();
      fd.set(
        "payload",
        JSON.stringify({
          name: name.trim(),
          rows: rows.map(({ key: _k, ...r }) => ({ ...r, order: Number(r.order) })),
        }),
      );
      if (file) fd.set("file", file);
      const res = await api<{ listId: string; total: number; linked: number; suggested: number }>(`/api/events/${eventId}/lists`, { method: "POST", body: fd });
      onDone(res.listId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const duplicated = rows ? rows.filter((r, i) => rows.findIndex((x) => Number(x.order) === Number(r.order)) !== i).map((r) => r.order) : [];

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Importar lista oficial</h2>
        <p className="text-sm text-zinc-400">
          Planilha <strong>XLSX</strong> ou <strong>CSV</strong> (lidas direto) ou <strong>PDF / foto da lista manuscrita</strong>
          {aiEnabled ? " (lidas por IA)" : " — leitura por IA não configurada no servidor"}. Você revisa tudo antes de gravar.
        </p>
      </div>

      <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={!!busy} onClick={() => inputRef.current?.click()}>
          {busy === "reading" ? "Lendo arquivo…" : rows ? "Trocar arquivo" : "Escolher arquivo"}
        </button>
        {file ? <span className="truncate text-sm text-zinc-400">{file.name}</span> : null}
        {busy === "reading" && (source === "PDF" || source === "IMAGE" || /\.(pdf|jpe?g|png|webp)$/i.test(file?.name ?? "")) ? (
          <span className="text-xs text-zinc-500">A leitura de manuscrito pode levar até 1 minuto.</span>
        ) : null}
      </div>

      {error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      {rows ? (
        <>
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <strong>Revise antes de gravar.</strong> {source === "PDF" || source === "IMAGE" ? "A lista foi lida por IA a partir de imagem/manuscrito e pode conter erros de leitura. " : ""}
            Corrija nomes, valores e a ordem. {rows.length} linha(s).
            {warnings.length ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="w-20 pb-2">Ordem</th>
                  <th className="pb-2">Empresa</th>
                  <th className="w-40 pb-2">Vendedor</th>
                  <th className="w-32 pb-2">Valor cota</th>
                  <th className="w-32 pb-2">Forma pgto</th>
                  <th className="pb-2">Observação</th>
                  <th className="w-10 pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="align-top">
                    <td className="py-1 pr-2">
                      <input
                        className={`input px-2 py-2 text-sm ${duplicated.includes(r.order) ? "border-red-400" : ""}`}
                        type="number"
                        min={1}
                        value={r.order}
                        onChange={(e) => update(r.key, { order: Number(e.target.value) })}
                        aria-label="Ordem"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input className={`input px-2 py-2 text-sm ${!r.company.trim() ? "border-red-400" : ""}`} value={r.company} maxLength={160} onChange={(e) => update(r.key, { company: e.target.value })} aria-label="Empresa" />
                    </td>
                    <td className="py-1 pr-2">
                      <input className="input px-2 py-2 text-sm" value={r.seller} maxLength={100} onChange={(e) => update(r.key, { seller: e.target.value })} aria-label="Vendedor" />
                    </td>
                    <td className="py-1 pr-2">
                      <input className="input px-2 py-2 text-sm" value={r.quotaValue} maxLength={30} placeholder="R$ 0,00" onChange={(e) => update(r.key, { quotaValue: e.target.value })} aria-label="Valor da cota" />
                    </td>
                    <td className="py-1 pr-2">
                      <input className="input px-2 py-2 text-sm" value={r.paymentMethod} maxLength={60} onChange={(e) => update(r.key, { paymentMethod: e.target.value })} aria-label="Forma de pagamento" />
                    </td>
                    <td className="py-1 pr-2">
                      <input className="input px-2 py-2 text-sm" value={r.notes} maxLength={300} onChange={(e) => update(r.key, { notes: e.target.value })} aria-label="Observação" />
                    </td>
                    <td className="py-1">
                      <button className="btn-ghost min-h-[40px] px-2 text-red-300" title="Remover linha" onClick={() => setRows((rs) => rs!.filter((x) => x.key !== r.key))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {duplicated.length ? <p className="text-sm text-red-300">Ordens repetidas: {[...new Set(duplicated)].join(", ")}. Corrija ou use “Renumerar”.</p> : null}

          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              onClick={() =>
                setRows((rs) => [...rs!, { key: newKey(), order: Math.max(0, ...rs!.map((r) => Number(r.order) || 0)) + 1, company: "", seller: "", quotaValue: "", paymentMethod: "", notes: "" }])
              }
            >
              + Linha
            </button>
            <button className="btn-ghost" onClick={renumber}>Renumerar 1…N</button>
          </div>

          <div className="flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="label">Nome desta lista</label>
              <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            <button
              className="btn-primary"
              disabled={busy !== null || rows.length === 0 || duplicated.length > 0 || rows.some((r) => !r.company.trim()) || name.trim().length < 2}
              onClick={save}
            >
              {busy === "saving" ? "Gravando e cruzando com os cadastros…" : `Gravar ${rows.length} linha(s)`}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
