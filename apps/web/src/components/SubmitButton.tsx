"use client";
import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes } from "react";

/**
 * Botão de submit que se desabilita durante o envio — evita cliques repetidos
 * criando registros duplicados (ex.: cliente 9x, brinquedo 3x) quando a
 * resposta demora um pouco. Uso: substitui <button> dentro de um <form action={...}>.
 */
export function SubmitButton({ children, className, pendingText, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button {...props} type="submit" disabled={pending} aria-busy={pending} className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}>
      {pending ? (pendingText ?? "Enviando...") : children}
    </button>
  );
}
