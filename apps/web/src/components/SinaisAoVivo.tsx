"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellRing, MessagesSquare } from "lucide-react";

import { sinaisAction } from "./sinais-action";

type Sinais = Awaited<ReturnType<typeof sinaisAction>>;

const INTERVALO_MS = 30_000;

/**
 * Sinalização ao vivo no topo do painel: conversas com mensagem sem ler e
 * avisos acionáveis (agendamento novo, cancelamento, pedido de atendimento
 * humano).
 *
 * Antes o sino era calculado no layout do servidor, então o número só mudava
 * quando a página inteira recarregava — deixar o painel aberto numa aba
 * parada significava nunca ver nada aparecer.
 *
 * Recebe a contagem do servidor como valor inicial pra não piscar em branco
 * no primeiro render, e a partir daí atualiza sozinho.
 *
 * Quando o painel está instalado como app, também dispara a notificação do
 * sistema. Isso funciona SÓ com o app aberto (mesmo que em segundo plano):
 * notificação com tudo fechado exigiria service worker e push, que é outro
 * problema — e os avisos de montagem e cancelamento já chegam no WhatsApp.
 */
export function SinaisAoVivo({ inicial }: { inicial: number }) {
  const [sinais, setSinais] = useState<Sinais | null>(null);
  const [permissao, setPermissao] = useState<NotificationPermission>("default");
  // Guarda o último aviso já anunciado: sem isso, cada volta do intervalo
  // reanunciaria o mesmo evento enquanto ele continuasse não lido.
  const anunciado = useRef<string | null>(null);
  const primeiraCarga = useRef(true);

  useEffect(() => {
    if (typeof Notification !== "undefined") setPermissao(Notification.permission);
  }, []);

  const buscar = useCallback(async () => {
    try {
      const s = await sinaisAction();
      setSinais(s);

      // Só anuncia evento NOVO. Na primeira carga apenas registra o que já
      // existe, senão abrir o painel dispararia um alerta de algo antigo.
      if (s.ultimoAvisoEm && s.ultimoAvisoEm !== anunciado.current) {
        const jaConhecido = primeiraCarga.current;
        anunciado.current = s.ultimoAvisoEm;
        if (!jaConhecido && s.ultimoAviso && Notification.permission === "granted") {
          new Notification(s.ultimoAviso.titulo, {
            body: s.ultimoAviso.corpo ?? undefined,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag: "diny-aviso",
          });
        }
      }
      primeiraCarga.current = false;
    } catch {
      // Rede caiu ou sessão expirou: mantém o último valor conhecido em vez de
      // zerar os badges e dar a impressão falsa de que não há nada pendente.
    }
  }, []);

  useEffect(() => {
    void buscar();
    const id = setInterval(() => void buscar(), INTERVALO_MS);
    return () => clearInterval(id);
  }, [buscar]);

  const avisos = sinais?.avisos ?? inicial;
  const conversas = sinais?.conversas ?? 0;

  async function pedirPermissao() {
    if (typeof Notification === "undefined") return;
    setPermissao(await Notification.requestPermission());
  }

  return (
    <>
      {conversas > 0 && (
        <Link
          href="/admin/conversas"
          aria-label={`${conversas} conversa${conversas === 1 ? "" : "s"} com mensagem sem ler`}
          title="Conversas com mensagem sem ler"
          className="relative grid size-9 place-items-center rounded-full text-[var(--color-ink)] hover:bg-[var(--color-surface)]"
        >
          <MessagesSquare className="size-5" />
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#25D366] px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-white">
            {conversas > 99 ? "99+" : conversas}
          </span>
        </Link>
      )}

      <Link
        href="/admin/notificacoes"
        aria-label={avisos > 0 ? `Notificações: ${avisos} não lidas` : "Notificações"}
        className="relative grid size-9 place-items-center rounded-full text-[var(--color-ink)] hover:bg-[var(--color-surface)]"
      >
        {avisos > 0 ? <BellRing className="size-5 text-rose-600" /> : <Bell className="size-5" />}
        {avisos > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-white">
            {avisos > 99 ? "99+" : avisos}
          </span>
        )}
      </Link>

      {/* Aparece só enquanto a permissão não foi decidida — depois some pra
          não virar enfeite permanente na barra. */}
      {permissao === "default" && (
        <button
          type="button"
          onClick={pedirPermissao}
          title="Receber aviso na área de trabalho enquanto o painel estiver aberto"
          className="hidden rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--color-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)] sm:block"
        >
          Ativar avisos
        </button>
      )}
    </>
  );
}
