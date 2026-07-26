import { SubmitButton } from "@/components/SubmitButton";
import { saveSettings } from "./actions";

/**
 * Um bloco salvável das configurações. Cada seção é um formulário próprio: manda
 * só os seus campos, então salvar "Empresa" não mexe no que está em "Site".
 */
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-black/5 bg-white shadow-sm">
      <form action={saveSettings}>
        <input type="hidden" name="secao" value={id} />
        <div className="border-b border-black/5 px-4 py-3 sm:px-5">
          <h2 className="font-extrabold">{title}</h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">{description}</p>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">{children}</div>
        <div className="flex justify-end border-t border-black/5 px-4 py-3 sm:px-5">
          <SubmitButton
            pendingText="Salvando..."
            className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-bold text-white hover:brightness-95"
          >
            Salvar
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

const FIELD =
  "w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

/** Campo de texto simples. `wide` ocupa as duas colunas. */
export function Field({
  name,
  label,
  hint,
  defaultValue,
  placeholder,
  type = "text",
  wide = false,
  step,
  min,
  max,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  type?: string;
  wide?: boolean;
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">{label}</span>
      <input
        name={name}
        type={type}
        step={step}
        min={min}
        max={max}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className={FIELD}
      />
      {hint && <span className="mt-1 block text-[11px] text-[var(--color-muted)]">{hint}</span>}
    </label>
  );
}

/** Área de texto para políticas/descrições. */
export function TextArea({
  name,
  label,
  hint,
  defaultValue,
  placeholder,
  rows = 3,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string | null;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block sm:col-span-2">
      <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">{label}</span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className={`${FIELD} resize-none`}
      />
      {hint && <span className="mt-1 block text-[11px] text-[var(--color-muted)]">{hint}</span>}
    </label>
  );
}

/**
 * Cor da marca: amostra da cor ATUAL + o hex em texto.
 * A amostra é só leitura (mostra o que está salvo) — quem vale é o campo de
 * texto. Um `<input type="color">` exigiria JS de cliente só para espelhar valor.
 */
export function ColorField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">{label}</span>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          style={{ background: defaultValue }}
          className="size-10 shrink-0 rounded-lg border border-black/10"
        />
        <input name={name} defaultValue={defaultValue} placeholder="#2563EB" className={FIELD} />
      </div>
    </label>
  );
}
