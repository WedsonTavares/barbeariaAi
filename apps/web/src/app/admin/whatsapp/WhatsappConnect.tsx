"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { WhatsappState } from "@/lib/evolution";
import { fetchQrAction, fetchStatusAction, disconnectAction } from "./actions";

/**
 * Fluxo de conexão do WhatsApp: clica "Conectar" → mostra o QR (renova sozinho a cada
 * 30s porque o WhatsApp expira o QR) → fica checando o status a cada 3s → quando conecta,
 * mostra ✅ e para. Tudo pela server action (segredos nunca chegam no navegador).
 */
export function WhatsappConnect({ initialState }: { initialState: WhatsappState }) {
  const [state, setState] = useState<WhatsappState>(initialState);
  const [qr, setQr] = useState<string | undefined>();
  const [pairing, setPairing] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const qrTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimers = useCallback(() => {
    if (qrTimer.current) clearInterval(qrTimer.current);
    if (statusTimer.current) clearInterval(statusTimer.current);
    qrTimer.current = null;
    statusTimer.current = null;
  }, []);

  const loadQr = useCallback(() => {
    startTransition(async () => {
      const r = await fetchQrAction();
      setQr(r.base64);
      setPairing(r.pairingCode);
      if (r.state) setState(r.state);
    });
  }, []);

  const connect = useCallback(() => {
    loadQr();
    stopTimers();
    // Renova o QR a cada 30s (ele expira) e checa o status a cada 3s.
    qrTimer.current = setInterval(loadQr, 30_000);
    statusTimer.current = setInterval(async () => {
      const s = await fetchStatusAction();
      setState(s);
      if (s === "open") {
        stopTimers();
        setQr(undefined);
        setPairing(undefined);
      }
    }, 3_000);
  }, [loadQr, stopTimers]);

  useEffect(() => () => stopTimers(), [stopTimers]);

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
        Clique em conectar, abra o WhatsApp do número do negócio → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b> e escaneie o QR.
      </p>

      {!qr && (
        <button onClick={connect} disabled={pending} className="mt-4 rounded-full bg-[var(--color-primary)] px-6 py-2 font-semibold text-white disabled:opacity-60">
          {pending ? "Gerando..." : "Gerar QR e conectar"}
        </button>
      )}

      {qr && (
        <div className="mt-5 flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code do WhatsApp" className="h-64 w-64 rounded-lg border border-black/10" />
          <p className="text-xs text-[var(--color-muted)]">O QR renova sozinho. Assim que você escanear, esta tela atualiza para “conectado”.</p>
          {pairing && (
            <p className="text-sm">Ou use o código de pareamento: <b className="tracking-widest">{pairing}</b></p>
          )}
          <button onClick={loadQr} disabled={pending} className="text-xs font-semibold text-[var(--color-primary)] underline">
            Gerar um QR novo agora
          </button>
        </div>
      )}
    </div>
  );
}
