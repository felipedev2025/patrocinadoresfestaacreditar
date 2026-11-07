"use client";

import { useRef, useState } from "react";

export type UploadedLogo = { assetId: string; previewUrl: string; backgroundRemoved?: boolean };

const ACCEPT = "image/png,image/jpeg,image/svg+xml,image/webp,.png,.jpg,.jpeg,.svg,.webp";

/**
 * Seleção do logotipo pela galeria ou câmera, com envio imediato para processamento
 * (validação, sanitização, recorte automático e remoção opcional de fundo).
 */
export function LogoUploader({ endpoint, maxMb = 10, value, onChange }: { endpoint: string; maxMb?: number; value: UploadedLogo | null; onChange: (v: UploadedLogo | null) => void }) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removeBg, setRemoveBg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(f: File, remove: boolean) {
    if (f.size > maxMb * 1048576) {
      setError(`Arquivo maior que ${maxMb} MB`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("removeBackground", String(remove));
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no envio");
      onChange(data);
      if (remove && !data.backgroundRemoved) setError("Não identificamos um fundo sólido para remover — o logotipo foi mantido como enviado.");
    } catch (e) {
      setError((e as Error).message);
      onChange(null);
    } finally {
      setBusy(false);
    }
  }

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    void upload(f, removeBg);
  }

  return (
    <div className="space-y-3">
      <input ref={galleryRef} type="file" accept={ACCEPT} hidden onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />

      {value ? (
        <div className="checker flex h-44 items-center justify-center rounded-2xl ring-1 ring-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.previewUrl} alt="Logotipo processado" className="max-h-40 max-w-[90%] object-contain" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 text-zinc-400 transition hover:border-brand-400/60 hover:text-zinc-200"
          disabled={busy}
        >
          <span className="text-4xl">＋</span>
          <span className="text-sm">{busy ? "Processando…" : "Toque para escolher o logotipo"}</span>
          <span className="text-xs text-zinc-500">PNG, JPG, SVG ou WebP · até {maxMb} MB</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary" onClick={() => galleryRef.current?.click()} disabled={busy}>
          🖼️ Galeria
        </button>
        <button type="button" className="btn-secondary" onClick={() => cameraRef.current?.click()} disabled={busy}>
          📷 Câmera
        </button>
      </div>

      <label className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm">
        <input
          type="checkbox"
          className="h-5 w-5 accent-amber-400"
          checked={removeBg}
          disabled={busy}
          onChange={(e) => {
            setRemoveBg(e.target.checked);
            if (file) void upload(file, e.target.checked);
          }}
        />
        <span>
          Remover fundo automaticamente
          <span className="block text-xs text-zinc-500">Ideal para logotipos com fundo branco ou de cor sólida.</span>
        </span>
      </label>
      {busy ? <p className="text-sm text-brand-300">Processando imagem…</p> : null}
      {error ? <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{error}</p> : null}
    </div>
  );
}
