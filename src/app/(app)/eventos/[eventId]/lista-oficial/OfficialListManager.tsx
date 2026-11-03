"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImportWizard } from "./ImportWizard";
import { Conference } from "./Conference";

type ListSummary = { id: string; name: string; createdAt: string; total: number };

export function OfficialListManager(props: {
  eventId: string;
  lists: ListSummary[];
  initialListId: string | null;
  canManage: boolean;
  maxMb: number;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [listId, setListId] = useState<string | null>(props.initialListId);
  const [importing, setImporting] = useState(props.lists.length === 0 && props.canManage);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {props.lists.length > 0 ? (
          <select
            className="input sm:max-w-md"
            value={listId ?? ""}
            onChange={(e) => {
              setListId(e.target.value);
              setImporting(false);
            }}
            aria-label="Lista importada"
          >
            {props.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.total} linha(s) · {new Date(l.createdAt).toLocaleDateString("pt-BR")}
              </option>
            ))}
          </select>
        ) : null}
        {props.canManage ? (
          <button className={importing ? "btn-secondary" : "btn-primary"} onClick={() => setImporting((v) => !v)}>
            {importing ? "Cancelar importação" : "+ Importar lista"}
          </button>
        ) : null}
      </div>

      {importing && props.canManage ? (
        <ImportWizard
          eventId={props.eventId}
          maxMb={props.maxMb}
          aiEnabled={props.aiEnabled}
          onDone={(id) => {
            setImporting(false);
            setListId(id);
            router.replace(`/eventos/${props.eventId}/lista-oficial?lista=${id}`);
            router.refresh();
          }}
        />
      ) : null}

      {!importing && listId ? <Conference key={listId} listId={listId} eventId={props.eventId} maxMb={props.maxMb} aiEnabled={props.aiEnabled} /> : null}

      {!importing && !listId ? (
        <div className="card py-10 text-center text-sm text-zinc-400">Nenhuma lista importada ainda.</div>
      ) : null}
    </div>
  );
}
