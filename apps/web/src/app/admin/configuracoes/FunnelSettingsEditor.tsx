"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";

import type { FunnelColumnConfig, FunnelConfig } from "@/lib/funnel-config";

export function FunnelSettingsEditor({ initial }: { initial: FunnelConfig }) {
  const [columns, setColumns] = useState<FunnelColumnConfig[]>(initial.columns);
  const visibleCount = columns.filter((column) => column.visible).length;
  const customCount = columns.filter((column) => column.kind === "custom").length;

  function update(id: string, patch: Partial<FunnelColumnConfig>) {
    setColumns((current) =>
      current.map((column) => (column.id === id ? { ...column, ...patch } : column))
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= columns.length) return;
    setColumns((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function addColumn() {
    if (customCount >= 10) return;
    const id = `custom_${crypto.randomUUID().replace(/-/g, "")}`;
    setColumns((current) => [
      ...current,
      { id, kind: "custom", label: "Nova coluna", visible: true },
    ]);
  }

  function removeColumn(id: string) {
    setColumns((current) => {
      const next = current.filter((column) => column.id !== id);
      if (!next.some((column) => column.visible)) next[0] = { ...next[0]!, visible: true };
      return next;
    });
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <input
        type="hidden"
        name="funnelConfig"
        value={JSON.stringify({ version: 1, columns })}
      />

      <div className="divide-y divide-black/5 border-y border-black/5">
        {columns.map((column, index) => (
          <div key={column.id} className="flex min-w-0 items-center gap-2 py-2.5">
            <input
              type="checkbox"
              checked={column.visible}
              disabled={column.visible && visibleCount === 1}
              onChange={(event) => update(column.id, { visible: event.target.checked })}
              aria-label={`Mostrar ${column.label}`}
              className="size-4 shrink-0 accent-[var(--color-primary)]"
            />
            <input
              value={column.label}
              maxLength={40}
              onChange={(event) => update(column.id, { label: event.target.value })}
              aria-label={`Nome da coluna ${index + 1}`}
              className="min-w-0 flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
            <span
              title={column.kind === "system" ? "Mantém o comportamento interno desta etapa" : "Coluna somente visual"}
              className="hidden w-16 shrink-0 text-center text-[10px] font-bold uppercase text-[var(--color-muted)] sm:block"
            >
              {column.kind === "system" ? "Sistema" : "Visual"}
            </span>
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              title="Mover para a esquerda"
              aria-label={`Mover ${column.label} para a esquerda`}
              className={ICON_BUTTON}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={index === columns.length - 1}
              title="Mover para a direita"
              aria-label={`Mover ${column.label} para a direita`}
              className={ICON_BUTTON}
            >
              <ChevronRight className="size-4" />
            </button>
            {column.kind === "custom" && (
              <button
                type="button"
                onClick={() => removeColumn(column.id)}
                title="Excluir coluna visual"
                aria-label={`Excluir ${column.label}`}
                className={`${ICON_BUTTON} text-red-600`}
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addColumn}
        disabled={customCount >= 10}
        className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-bold hover:bg-[var(--color-surface)] disabled:opacity-40"
      >
        <Plus className="size-4" /> Adicionar coluna
      </button>
    </div>
  );
}

const ICON_BUTTON =
  "grid size-8 shrink-0 place-items-center rounded-lg border border-black/10 hover:bg-[var(--color-surface)] disabled:opacity-30";
