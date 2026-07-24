"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Recarrega os dados do server component em intervalo fixo (quase-realtime barato,
 * sem WebSocket). Usar só em telas de LEITURA (dashboard/notificações) — nunca em
 * páginas com formulário longo, pra não atrapalhar digitação.
 */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
