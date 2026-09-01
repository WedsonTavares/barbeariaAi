"use client";
import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Check, KeyRound, Loader2, Trash2 } from "lucide-react";

import {
  conferirChaveAtualAction,
  estadoDaChaveAction,
  removerChaveAction,
  salvarChaveAction,
} from "./actions";
import type { EstadoChave } from "@/lib/apify-token";

/**
 * Troca da chave da Apify, sem redeploy.
 *
 * Fica recolhido por padrão: você troca de conta quando os créditos acabam, não
 * todo dia, e um campo de senha aberto no topo da tela de busca só rouba a
 * atenção de quem veio prospectar.
 *
 * A chave nunca chega aqui inteira — o servidor manda só a máscara. O campo é
 * de escrita: você cola a nova, ela é conferida na Apify e gravada cifrada.
 */
export function ChaveApify() {
  const [estado, setEstado] = useState<EstadoChave | null>(null);
  const [aberto, setAberto] = useState(false);
  const [nova, setNova] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    estadoDaChaveAction().then(setEstado).catch(() => setEstado(null));
  }, []);

  function recarregar() {
    estadoDaChaveAction().then(setEstado).catch(() => {});
  }

  function salvar() {
    setMsg(null);
    iniciar(async () => {
      const r = await salvarChaveAction(nova);
      if (!r.ok) return setMsg({ ok: false, texto: r.erro });
      setMsg({ ok: true, texto: r.aviso });
      setNova("");
      setAberto(false);
      recarregar();
    });
  }

  function conferir() {
    setMsg(null);
    iniciar(async () => {
      const r = await conferirChaveAtualAction();
      setMsg(r.ok ? { ok: true, texto: r.aviso } : { ok: false, texto: r.erro });
    });
  }

  function remover() {
    setMsg(null);
    iniciar(async () => {
      const r = await removerChaveAction();
      setMsg(r.ok ? { ok: true, texto: r.aviso } : { ok: false, texto: r.erro });
      recarregar();
    });
  }

  const semChave = estado?.origem === "nenhuma";

  return (
    <section
      className={`mt-4 rounded-2xl border bg-white p-4 shadow-sm ${
        semChave ? "border-amber-200" : "border-black/5"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--color-surface)]">
          <KeyRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">Chave da conta</h2>
          <p className="text-xs text-[var(--color-muted)]">
            {estado === null ? (
              "verificando..."
            ) : estado.origem === "nenhuma" ? (
              <span className="font-semibold text-amber-700">
                Nenhuma chave configurada — a busca vai recusar.
              </span>
            ) : (
              <>
                <span className="font-mono">{estado.mascara}</span>
                {estado.origem === "banco" ? (
                  <>
                    {" "}· trocada aqui
                    {estado.atualizadoEm
                      ? ` em ${new Date(estado.atualizadoEm).toLocaleDateString("pt-BR")}`
                      : ""}
                  </>
                ) : (
                  /* Sinalizar a origem importa: enquanto vier do ambiente, quem
                     manda é a Vercel, e trocar aqui passa a valer a partir do
                     próximo clique — não do próximo deploy. */
                  " · vem da variável APIFY_TOKEN do servidor"
                )}
              </>
            )}
          </p>
        </div>

        {estado && estado.origem !== "nenhuma" && (
          <button type="button" onClick={conferir} disabled={pendente} className={BOTAO}>
            {pendente ? <Loader2 className="size-4 animate-spin" /> : null} Conferir
          </button>
        )}
        <button
          type="button"
          onClick={() => { setAberto((v) => !v); setMsg(null); }}
          className={BOTAO}
        >
          {aberto ? "Cancelar" : "Trocar chave"}
        </button>
      </div>

      {aberto && (
        <div className="mt-3 border-t border-black/5 pt-3">
          <label className="block">
            <span className="block text-[11px] font-bold uppercase text-[var(--color-muted)]">
              Nova chave
            </span>
            <span className="mb-1 block text-[11px] text-[var(--color-muted)]">
              apify.com → Settings → Integrations → Personal API token
            </span>
            <input
              type="password"
              value={nova}
              autoComplete="off"
              spellCheck={false}
              disabled={pendente}
              onChange={(e) => setNova(e.target.value)}
              placeholder="apify_api_..."
              className="w-full rounded-xl border border-black/10 px-3 py-2 font-mono text-sm outline-none focus:border-[var(--color-primary)] disabled:opacity-60"
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={salvar}
              disabled={pendente || !nova.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {pendente ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {pendente ? "Conferindo na Apify..." : "Conferir e salvar"}
            </button>
            {estado?.origem === "banco" && (
              <button
                type="button"
                onClick={remover}
                disabled={pendente}
                title="Apaga a chave guardada aqui e volta a valer a do servidor"
                className={`${BOTAO} text-red-700`}
              >
                <Trash2 className="size-4" /> Remover
              </button>
            )}
          </div>

          <p className="mt-3 rounded-xl border border-black/10 bg-[var(--color-surface)] p-3 text-xs text-[var(--color-muted)]">
            A chave é conferida na Apify antes de gravar — a conferência não roda
            actor nenhum e não gasta crédito. Depois de salva ela fica cifrada no
            banco e nunca mais volta para esta tela; você vê só os quatro últimos
            caracteres.
          </p>
        </div>
      )}

      {msg && (
        <p
          className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-sm font-semibold ${
            msg.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.ok ? (
            <Check className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          )}
          {msg.texto}
        </p>
      )}
    </section>
  );
}

const BOTAO =
  "flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm font-bold shadow-sm hover:bg-[var(--color-surface)] disabled:opacity-40";
