"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { WhatsappState } from "@/lib/evolution";
import { fetchQrAction, fetchStatusAction, disconnectAction } from "./actions";

/**
 * Conexão do WhatsApp: escolhe o modo, gera UM pedido, e a tela acompanha o
 * status até conectar.
 *
 * Cada geração é um pedido de vinculação ao WhatsApp, e o excesso derruba a
 * conexão por horas. Por isso há três freios, e nenhum deles sozinho basta:
 *
 *  1. o pedido só sai de um CLIQUE — nunca de `setInterval` (era esse o bug que
 *     em 07/08/2026 disparou 11 pedidos em 5 minutos a partir de um clique só);
 *  2. o botão fica travado com contagem regressiva entre um pedido e outro;
 *  3. o SERVIDOR recusa acima do limite — as duas travas acima são de
 *     navegador, e navegador não é lugar de guardar regra de segurança.
 *
 * A consulta de STATUS continua automática: é só leitura, não pareia nada.
 */

/** Tempo que o QR/código costuma durar antes de o WhatsApp descartá-lo. */
const VALIDADE_MS = 50_000;
const INTERVALO_STATUS_MS = 3_000;
/** Aba esquecida aberta para de consultar depois disso. */
const LIMITE_STATUS_MS = 5 * 60_000;

type Modo = "qr" | "codigo";

export function WhatsappConnect({
  initialState,
  configurado = true,
}: {
  initialState: WhatsappState;
  /** Há EVOLUTION_* no ambiente? Separa "falta configurar" de "está fora do ar". */
  configurado?: boolean;
}) {
  const [state, setState] = useState<WhatsappState>(initialState);
  const [modo, setModo] = useState<Modo>("qr");
  const [telefone, setTelefone] = useState("");
  const [qr, setQr] = useState<string | undefined>();
  const [pairing, setPairing] = useState<string | undefined>();
  const [expirado, setExpirado] = useState(false);
  const [espera, setEspera] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const statusTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiraTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esperaTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const pararTimers = useCallback(() => {
    for (const t of [statusTimer, expiraTimer]) {
      if (t.current) clearInterval(t.current as ReturnType<typeof setInterval>);
      t.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      pararTimers();
      if (esperaTimer.current) clearInterval(esperaTimer.current);
    },
    [pararTimers]
  );

  /** Trava o botão e conta o tempo para baixo, em segundos. */
  const contarEspera = useCallback((segundos: number) => {
    setEspera(segundos);
    if (esperaTimer.current) clearInterval(esperaTimer.current);
    esperaTimer.current = setInterval(() => {
      setEspera((s) => {
        if (s <= 1 && esperaTimer.current) clearInterval(esperaTimer.current);
        return Math.max(0, s - 1);
      });
    }, 1000);
  }, []);

  /** ÚNICO caminho que pede vinculação — e só é chamado de um clique. */
  const gerar = useCallback(() => {
    setAviso(null);
    startTransition(async () => {
      const r = await fetchQrAction(modo === "codigo" ? telefone : undefined);

      if (!r.ok) {
        // O servidor recusou: é o freio de verdade. A tela só traduz.
        contarEspera(r.aguardeSegundos);
        setAviso(
          `Para proteger a conexão, aguarde antes de gerar de novo. ` +
            `Pedir muitos seguidos faz o WhatsApp bloquear a vinculação por horas.`
        );
        return;
      }

      setQr(r.base64);
      setPairing(r.pairingCode);
      setExpirado(false);
      if (r.state) setState(r.state as WhatsappState);
      if (!r.base64 && !r.pairingCode) {
        setAviso("O servidor de WhatsApp não devolveu o código. Tente de novo em instantes.");
      }

      pararTimers();
      contarEspera(20);
      expiraTimer.current = setTimeout(() => setExpirado(true), VALIDADE_MS);

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
  }, [contarEspera, modo, pararTimers, telefone]);

  if (!configurado) {
    return (
      <p className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">
        Integração de WhatsApp ainda não configurada neste ambiente. Fale com o suporte.
      </p>
    );
  }

  if (state === "unknown") {
    return (
      <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
        Não foi possível falar com o servidor de WhatsApp. Ele pode estar fora do ar ou em
        manutenção — a conexão não foi perdida, só não dá para consultá-la agora.
      </p>
    );
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

  const travado = pending || espera > 0 || (modo === "codigo" && telefone.replace(/\D/g, "").length < 10);
  const rotuloBotao = pending
    ? "Gerando..."
    : espera > 0
      ? `Aguarde ${espera}s`
      : modo === "codigo"
        ? "Gerar código"
        : "Gerar QR";

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-6">
      <div className="font-bold">WhatsApp desconectado</div>

      {/* O modo vem antes do botão de propósito: escolher depois de gerar
          desperdiçaria um pedido de vinculação. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            { v: "qr", t: "Ler QR com a câmera", d: "Painel no computador" },
            { v: "codigo", t: "Código de 8 dígitos", d: "Painel no próprio celular" },
          ] as const
        ).map((op) => (
          <button
            key={op.v}
            type="button"
            onClick={() => setModo(op.v)}
            aria-pressed={modo === op.v}
            className={`rounded-xl border px-3 py-2 text-left text-xs ${
              modo === op.v ? "border-[var(--color-primary)] bg-blue-50" : "border-black/10 hover:bg-[var(--color-surface)]"
            }`}
          >
            <span className="block font-bold">{op.t}</span>
            <span className="text-[var(--color-muted)]">{op.d}</span>
          </button>
        ))}
      </div>

      {modo === "codigo" ? (
        <div className="mt-3">
          <label className="block text-xs font-bold text-[var(--color-muted)]" htmlFor="wa-num">
            Número que será conectado (com DDD)
          </label>
          <input
            id="wa-num"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            inputMode="numeric"
            placeholder="5516999999999"
            className="mt-1 w-full max-w-xs rounded-xl border border-black/10 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            No WhatsApp: <b>Aparelhos conectados</b> → <b>Conectar aparelho</b> →{" "}
            <b>Conectar com número de telefone</b>.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          Deixe o celular em mãos: <b>Aparelhos conectados</b> → <b>Conectar aparelho</b>, e
          escaneie assim que o QR aparecer.
        </p>
      )}

      {aviso && (
        <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {aviso}
        </p>
      )}

      {!qr && !pairing && (
        <button
          onClick={gerar}
          disabled={travado}
          className="mt-4 rounded-full bg-[var(--color-primary)] px-6 py-2 font-semibold text-white disabled:opacity-60"
        >
          {rotuloBotao}
        </button>
      )}

      {(qr || pairing) && (
        <div className="mt-5 flex flex-col items-center gap-3">
          {pairing && (
            <div className={`text-center ${expirado ? "opacity-30" : ""}`}>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-muted)]">
                Digite no WhatsApp
              </div>
              <div className="mt-1 font-mono text-3xl font-black tracking-[0.2em]">{pairing}</div>
            </div>
          )}

          {qr && !pairing && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt="QR code do WhatsApp"
                className={`h-64 w-64 rounded-lg border border-black/10 ${expirado ? "opacity-20" : ""}`}
              />
              {expirado && (
                <div className="absolute inset-0 grid place-items-center rounded-lg bg-white/70">
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">Expirado</span>
                </div>
              )}
            </div>
          )}

          <p className="max-w-xs text-center text-xs text-[var(--color-muted)]">
            {expirado
              ? "Expirou. Gere outro só quando estiver com o celular pronto."
              : "Assim que você confirmar no celular, esta tela muda para “conectado”."}
          </p>

          <button
            onClick={gerar}
            disabled={travado}
            className="rounded-full border border-black/10 px-4 py-1.5 text-xs font-bold hover:bg-[var(--color-surface)] disabled:opacity-60"
          >
            {espera > 0 ? `Aguarde ${espera}s` : "Gerar outro"}
          </button>
        </div>
      )}
    </div>
  );
}
