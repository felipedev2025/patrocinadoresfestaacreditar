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
  const hasLists = props.lists.length > 0;
  // Sem nenhuma lista, o painel de importação já abre (não há o que conferir ainda)
  const [importing, setImporting] = useState(!hasLists && props.canManage);
  // "Em andamento" = arquivo escolhido ou linhas em revisão dentro do assistente
  const [inProgress, setInProgress] = useState(false);

  function closeImport() {
    if (inProgress && !confirm("Descartar a importação em andamento? As edições da revisão serão perdidas.")) return;
    setImporting(false);
    setInProgress(false);
  }

  // Barra só aparece quando tem algo para mostrar (seletor de listas ou algum botão)
  const showToolbar = hasLists || (props.canManage && (!importing || inProgress));

  return (
    <div className="space-y-6">
      <div className={showToolbar ? "flex flex-col gap-2 sm:flex-row sm:items-center" : "hidden"}>
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
        {props.canManage && !importing ? (
          <button className="btn-primary" onClick={() => setImporting(true)}>
            + Importar lista
          </button>
        ) : null}
        {props.canManage && importing && inProgress ? (
          <button className="btn-secondary" onClick={closeImport}>
            Cancelar importação
          </button>
        ) : null}
        {props.canManage && importing && !inProgress && hasLists ? (
          <button className="btn-secondary" onClick={closeImport}>
            Voltar à conferência
          </button>
        ) : null}
      </div>

      {importing && props.canManage && !hasLists ? (
        <p className="text-sm text-zinc-500">Este evento ainda não tem lista. Depois de importar, aparecem a conferência e o botão “Exportar Excel”.</p>
      ) : null}

      {importing && props.canManage ? (
        <ImportWizard
          eventId={props.eventId}
          maxMb={props.maxMb}
          aiEnabled={props.aiEnabled}
          onActiveChange={setInProgress}
          onDone={(id) => {
            setImporting(false);
            setInProgress(false);
            setListId(id);
            router.replace(`/eventos/${props.eventId}/lista-oficial?lista=${id}`);
            router.refresh();
          }}
        />
      ) : null}

      {!importing && listId ? <Conference key={listId} listId={listId} eventId={props.eventId} maxMb={props.maxMb} aiEnabled={props.aiEnabled} /> : null}

      {!importing && !listId ? (
        <div className="card py-10 text-center text-sm text-zinc-400">
          Nenhuma lista importada ainda. O Excel de conferência fica disponível depois que a lista for importada.
        </div>
      ) : null}
    </div>
  );
}
