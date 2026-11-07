"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type U = { id: string; name: string; email: string; phone: string | null; role: "SUPER_ADMIN" | "USER"; active: boolean; lastLoginAt: string | null; memberships: { role: string; event: { name: string; year: number } }[] };
const ROLE: Record<string, string> = { ORGANIZER: "Organizador", CAPTADOR: "Captador", OPERATOR: "Operador" };

export function UsersManager({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<U[]>([]);
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "", role: "USER" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => api<{ users: U[] }>("/api/users").then((r) => setUsers(r.users)).catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => void load(), []);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <h2 className="font-semibold">Novo usuário</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input className="input" placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className="input" type="email" placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <input className="input" placeholder="Celular (opcional)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <input className="input" type="password" placeholder="Senha inicial (mín. 10, letras e números)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="USER">Usuário (acesso por evento)</option>
            <option value="SUPER_ADMIN">Administrador geral</option>
          </select>
        </div>
        <button
          className="btn-primary"
          onClick={() =>
            run(async () => {
              await api("/api/users", { method: "POST", json: { ...f, phone: f.phone || null } });
              setF({ name: "", email: "", phone: "", password: "", role: "USER" });
            }, "Usuário criado. Vincule-o a um evento em Configurações.")
          }
        >
          Cadastrar
        </button>
        {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p> : null}
      </section>

      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className="card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="font-semibold">{u.name} {u.role === "SUPER_ADMIN" ? <span className="text-xs text-brand-300">· Administrador geral</span> : null} {!u.active ? <span className="text-xs text-red-300">· Inativo</span> : null}</div>
              <div className="text-xs text-zinc-400">{u.email}{u.phone ? ` · ${u.phone}` : ""} · último acesso: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("pt-BR") : "nunca"}</div>
              <div className="mt-1 text-xs text-zinc-500">{u.memberships.map((m) => `${m.event.name} ${m.event.year} (${ROLE[m.role]})`).join(" · ") || "Sem eventos vinculados"}</div>
            </div>
            {u.id !== currentUserId ? (
              <div className="flex gap-2">
                <button
                  className="btn-ghost min-h-[38px] py-1.5"
                  onClick={() => {
                    const pw = prompt("Nova senha (mín. 10 caracteres, letras e números):");
                    if (pw) void run(() => api(`/api/users/${u.id}`, { method: "PATCH", json: { password: pw } }), "Senha redefinida e sessões encerradas");
                  }}
                >
                  Redefinir senha
                </button>
                <button className={u.active ? "btn-danger min-h-[38px] py-1.5" : "btn-secondary min-h-[38px] py-1.5"} onClick={() => run(() => api(`/api/users/${u.id}`, { method: "PATCH", json: { active: !u.active } }), u.active ? "Usuário desativado" : "Usuário reativado")}>
                  {u.active ? "Desativar" : "Reativar"}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
