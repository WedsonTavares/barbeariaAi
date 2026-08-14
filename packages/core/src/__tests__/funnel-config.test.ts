import { describe, expect, it } from "vitest";

import { funnelConfigInput } from "../schemas";

const systemColumns = [
  "IA_ATENDENDO",
  "SUPORTE_HUMANO",
  "INTERESSADO",
  "AGENDADO",
  "POS_ATENDIMENTO",
].map((id) => ({ id, kind: "system", label: id, visible: true }));

describe("configuração visual do funil", () => {
  it("aceita colunas do sistema e personalizadas", () => {
    const result = funnelConfigInput.safeParse({
      version: 1,
      columns: [
        ...systemColumns,
        { id: "custom_concluido", kind: "custom", label: "Concluído", visible: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("não permite retirar uma etapa interna", () => {
    const result = funnelConfigInput.safeParse({ version: 1, columns: systemColumns.slice(1) });
    expect(result.success).toBe(false);
  });

  it("não permite transformar etapa interna em coluna visual", () => {
    const columns = systemColumns.map((column) =>
      column.id === "INTERESSADO" ? { ...column, kind: "custom" } : column
    );
    const result = funnelConfigInput.safeParse({ version: 1, columns });
    expect(result.success).toBe(false);
  });

  it("exige pelo menos uma coluna visível", () => {
    const columns = systemColumns.map((column) => ({ ...column, visible: false }));
    const result = funnelConfigInput.safeParse({ version: 1, columns });
    expect(result.success).toBe(false);
  });
});
