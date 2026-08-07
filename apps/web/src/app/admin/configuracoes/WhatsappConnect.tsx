"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { WhatsappState } from "@/lib/evolution";
import { fetchQrAction, fetchStatusAction, disconnectAction } from "./actions";

/**
 * Fluxo de conexão do WhatsApp: clica "Conectar" → mostra o QR → a tela fica
 * checando o status a cada 3s → quando conecta, mostra ✅ e para.
 *
 * O QR NÃO se renova sozinho, de propósito.
 *
 * Cada renovação é um pedido de pareamento ao WhatsApp (`GET /instance/connect`),
 * e o WhatsApp bloqueia temporariamente a vinculação de novos dispositivos quando
 * recebe muitos seguidos. A versão anterior renovava a cada 30s sem limite nenhum:
 * uma aba esquecida aberta disparava 120 pedidos por hora sozinha, sem ninguém
 * clicar em nada. Foi assim que, em 07/08/2026, uma queda de sessão de 1 segundo
 * virou horas de WhatsApp fora do ar — 11 pedidos em 5 minutos a partir de um
 * único clique.
 *
 * A consulta de STATUS continua automática: ela é só leitura, não pareia nada.
 * Mesmo assim ela se encerra sozinha depois de LIMITE_STATUS_MS, para uma aba
 * abandonada não ficar batendo no servidor para sempre.
 */

/** Tempo que o QR do WhatsApp costuma durar. Passou disso, pede um novo — com clique. */
const VALIDADE_QR_MS = 50_000;
const INTERVALO_STATUS_MS = 3_000;
/** Aba esquecida aberta para de consultar depois disso. */
const LIMITE_STATUS_MS = 5 * 60_000;

export function WhatsappConnect({ initialState }: { initialState: WhatsappState }) {
  const [state, setState] = useState<WhatsappState>(initialState);
  const [qr, setQr] = useState<string | undefined>();
  const [pairing, setPairing] = useState<string | undefined>();
  const [expirado, setExpirado] = useState(false);
  const [pending, startTransition] = useTransition();
  const statusTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiraTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pararTimers = useCallback(() => {
    if (statusTimer.current) clearInterval(statusTimer.current);
    if (expiraTimer.current) clearTimeout(expiraTimer.current);
    statusTimer.current = null;
    expiraTimer.current = null;
  }, []);

  /**
   * ÚNICO caminho que pede um QR — e só é chamado a partir de um clique.
   * Nenhum `setInterval` pode apontar para cá.
   */
  const gerarQr = useCallback(() => {
    startTransition(async () => {
      const r = await fetchQrAction();
      setQr(r.base64);
      setPairing(r.pairingCode);
      setExpirado(false);
      if (r.state) setState(r.state);

      pararTimers();
      expiraTimer.current = setTimeout(() => setExpirado(true), VALIDADE_QR_MS);

      const ateQuando = Date.now() + LIMITE_STATUS_MS;
      statusTimer.current = setInterval(async () => {
        const s = await fetchStatusAction();
        setState(s);
        if (s === "open") {
          pararTimers();
          setQr(undefined);
          setPairing(undefined);
          setExpirado(false);
        } else if (Date.now() > ateQuando) {
          pararTimers();
          setExpirado(true);
        }
      }, INTERVALO_STATUS_MS);
    });
  }, [pararTimers]);

  useEffect(() => () => pararTimers(), [pararTimers]);

  if (state === "unknown") {
    return <p className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">Integração de WhatsApp ainda não configurada no ambiente. Fale com o suporte.</p>;
  }

  if (state === "open") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
        <div className="text-lg font-bold text-green-800">✅ WhatsApp conectado</div>
        <p className="mt-1 text-sm text-green-700">O agente já pode receber e responder mensagens.</p>
        <button
          onClick={() => startTransition(async () => { await disconnectAction(); setState("close"); })}
          disabled={pending}
          className="mt-4 rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          Desconectar
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-6">
      <div className="font-bold">WhatsApp desconectado</div>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Deixe o celular em mãos antes de gerar: abra o WhatsApp do número do negócio →{" "}
        <b>Aparelhos conectados</b> → <b>Conectar aparelho</b> e escaneie na hora.
      </p>

      {!qr && (
        <button onClick={gerarQr} disabled={pending} className="mt-4 rounded-full bg-[var(--color-primary)] px-6 py-2 font-semibold text-white disabled:opacity-60">
          {pending ? "Gerando..." : "Gerar QR e conectar"}
        </button>
      )}

      {qr && (
        <div className="mt-5 flex flex-col items-center gap-3">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr}
              alt="QR code do WhatsApp"
              className={`h-64 w-64 rounded-lg border border-black/10 ${expirado ? "opacity-20" : ""}`}
            />
            {expirado && (
              <div className="absolute inset-0 grid place-items-center rounded-lg bg-white/70">
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">QR expirado</span>
              </div>
            )}
          </div>

          {expirado ? (
            <p className="max-w-xs text-center text-xs text-[var(--color-muted)]">
              O QR expirou. Gere outro só quando estiver com o celular pronto para escanear —
              cada QR é um pedido de pareamento, e pedir muitos seguidos faz o WhatsApp
              bloquear a conexão por horas.
            </p>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">
              Escaneie agora. Assim que você escanear, esta tela atualiza para “conectado”.
            </p>
          )}

          {pairing && !expirado && (
            <p className="text-sm">Ou use o código de pareamento: <b className="tracking-widest">{pairing}</b></p>
          )}

          <button
            onClick={gerarQr}
            disabled={pending}
            className="rounded-full border border-black/10 px-4 py-1.5 text-xs font-bold hover:bg-[var(--color-surface)] disabled:opacity-60"
          >
            {pending ? "Gerando..." : "Gerar um QR novo"}
          </button>
        </div>
      )}
    </div>
  );
}
