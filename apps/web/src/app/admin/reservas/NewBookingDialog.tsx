"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Plus, X } from "lucide-react";

import { SubmitButton } from "@/components/SubmitButton";
import { createBooking } from "./actions";

export type PickerOption = { id: string; name: string };

/**
 * "Nova reserva" em modal, no mesmo padrão de Clientes e Brinquedos — antes o
 * formulário ficava fixo numa coluna ao lado da lista, ocupando metade da tela
 * mesmo quando ninguém ia cadastrar nada.
 *
 * Os campos e a action são exatamente os de antes: só mudou onde aparecem.
 */
export function NewBookingDialog({
  customers,
  toys,
  initialOpen = false,
  hasError = false,
  phone,
  contactName,
}: {
  customers: PickerOption[];
  toys: PickerOption[];
  initialOpen?: boolean;
  hasError?: boolean;
  /** Vindo do atalho "Agendar" de uma conversa: telefone já conhecido. */
  phone?: string;
  contactName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLSelectElement>(null);
  const responsavelRef = useRef<HTMLInputElement>(null);
  const previousOverflow = useRef("");
  const scrollLocked = useRef(false);

  // Data e horários: a montagem fica presa ao dia da festa e a retirada não
  // pode ser antes dela. O backend só garante retirada > montagem — nada
  // impedia salvar festa em 10/08 com montagem em 25/12, e aí a Agenda (que
  // agrupa por data do evento mas mostra o horário da montagem) mentiria.
  const [dataEvento, setDataEvento] = useState("");
  const [montagem, setMontagem] = useState("");
  const [retirada, setRetirada] = useState("");

  // Endereço montado a partir de CEP + número + complemento. O `address` que
  // vai pro servidor é a junção dos três (campo oculto, mais abaixo).
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState<string | null>(null);

  const enderecoCompleto = [rua.trim(), numero.trim()].filter(Boolean).join(", ")
    + (complemento.trim() ? ` — ${complemento.trim()}` : "");

  /** Troca só a parte da DATA, preservando a hora que a pessoa já digitou. */
  const comData = (valor: string, dia: string) => (dia ? `${dia}T${valor.split("T")[1] ?? ""}` : valor);

  function escolherDataEvento(dia: string) {
    setDataEvento(dia);
    // Já preenche a data nos dois campos: antes era digitar a mesma data três
    // vezes. A hora continua por conta de quem preenche.
    setMontagem((atual) => comData(atual, dia));
    setRetirada((atual) => comData(atual, dia));
  }

  /**
   * Busca o endereço pelo CEP (ViaCEP). Falha não trava nada: os campos
   * continuam editáveis à mão, que é o que já acontecia antes.
   */
  async function buscarCep(bruto: string) {
    const digitos = bruto.replace(/\D/g, "");
    if (digitos.length !== 8) return;
    setBuscandoCep(true);
    setErroCep(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
      const dados = (await res.json()) as { logradouro?: string; bairro?: string; erro?: boolean };
      if (dados.erro) {
        setErroCep("CEP não encontrado. Pode preencher à mão.");
        return;
      }
      if (dados.logradouro) setRua(dados.logradouro);
      if (dados.bairro) setBairro(dados.bairro);
    } catch {
      setErroCep("Não deu pra consultar o CEP agora. Preencha à mão.");
    } finally {
      setBuscandoCep(false);
    }
  }

  function limparCampos() {
    setDataEvento("");
    setMontagem("");
    setRetirada("");
    setCep("");
    setRua("");
    setNumero("");
    setComplemento("");
    setBairro("");
    setErroCep(null);
  }

  function openDialog() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    scrollLocked.current = true;
    dialog.showModal();
    // Foca o primeiro campo que existe no modo atual (responsável ou cliente).
    window.setTimeout(() => (responsavelRef.current ?? firstRef.current)?.focus(), 0);
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function restorePage() {
    if (scrollLocked.current) {
      document.body.style.overflow = previousOverflow.current;
      scrollLocked.current = false;
    }
    if (!initialOpen) {
      dialogRef.current?.querySelector("form")?.reset();
      // `form.reset()` limpa o DOM, mas não o estado do React — sem isto a
      // próxima reserva abriria com a data e o endereço da anterior.
      limparCampos();
    }
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (initialOpen) openDialog();
    return () => {
      if (dialogRef.current?.open) dialogRef.current.close();
      if (scrollLocked.current) {
        document.body.style.overflow = previousOverflow.current;
        scrollLocked.current = false;
      }
    };
    // Abre uma vez só: vindo da Agenda (?nova=1) ou quando a action volta com erro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpen]);

  const field =
    "w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
  const labelText = "mb-1.5 block text-xs font-bold text-[var(--color-muted)]";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-95 sm:w-auto"
      >
        <Plus className="size-4" aria-hidden />
        Nova reserva
      </button>

      <dialog
        ref={dialogRef}
        onClose={restorePage}
        onClick={(event) => {
          const dialog = dialogRef.current;
          if (!dialog) return;
          const rect = dialog.getBoundingClientRect();
          const outside =
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom;
          if (outside) closeDialog();
        }}
        aria-labelledby="new-booking-title"
        aria-modal="true"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border-0 bg-white p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px]"
      >
        <div className="border-b border-black/5 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
                <CalendarPlus className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id="new-booking-title" className="font-extrabold">Nova reserva</h2>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  Brinquedo já reservado no mesmo horário é bloqueado ao salvar.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              aria-label="Fechar nova reserva"
              className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <form action={createBooking} className="space-y-4 p-5">
          {hasError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
              Reserva não criada. Confira os campos abaixo.
            </p>
          )}

          {/*
            Dois modos. Vindo de uma conversa (`phone`), o telefone já é
            conhecido e a única pergunta que falta é QUEM responde pela festa —
            o pushName do WhatsApp raramente é o nome do responsável. O cadastro
            é criado/encontrado na hora pelo telefone.
            Sem conversa, segue a lista de clientes já cadastrados.
          */}
          {phone ? (
            <>
              <input type="hidden" name="phone" value={phone} />
              <label className="block">
                <span className={labelText}>Nome do responsável</span>
                <input
                  ref={responsavelRef}
                  name="responsavel"
                  required
                  defaultValue={contactName ?? ""}
                  placeholder="Quem responde pela festa"
                  className={field}
                />
                <span className="mt-1 block text-[11px] text-[var(--color-muted)]">
                  WhatsApp {phone} — o cadastro é criado se ainda não existir.
                </span>
              </label>
            </>
          ) : (
            <label className="block">
              <span className={labelText}>Cliente</span>
              <select ref={firstRef} name="customerId" required className={field}>
                <option value="">Selecione...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className={labelText}>Data do evento</span>
            <input
              name="eventDate"
              type="date"
              required
              value={dataEvento}
              onChange={(e) => escolherDataEvento(e.target.value)}
              className={field}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelText}>Montagem</span>
              {/* Preso ao dia da festa: montar num dia e a festa em outro é
                  sempre engano de digitação. */}
              <input
                name="setupTime"
                type="datetime-local"
                required
                value={montagem}
                min={dataEvento ? `${dataEvento}T00:00` : undefined}
                max={dataEvento ? `${dataEvento}T23:59` : undefined}
                onChange={(e) => setMontagem(e.target.value)}
                className={field}
              />
            </label>
            <label className="block">
              <span className={labelText}>Retirada</span>
              {/* Só o piso: aluguel de 2 dias existe e é lançado por aqui, na
                  mão — travar no mesmo dia tiraria essa possibilidade. */}
              <input
                name="pickupTime"
                type="datetime-local"
                required
                value={retirada}
                min={montagem || (dataEvento ? `${dataEvento}T00:00` : undefined)}
                onChange={(e) => setRetirada(e.target.value)}
                className={field}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelText}>Valor total</span>
              <input name="total" type="number" inputMode="decimal" step="0.01" min="0" placeholder="0,00" required className={field} />
            </label>
            <label className="block">
              <span className={labelText}>Sinal previsto <span className="font-normal">(opcional)</span></span>
              <input name="depositAmount" type="number" inputMode="decimal" step="0.01" min="0" placeholder="0,00" className={field} />
            </label>
          </div>

          {/*
            Endereço é obrigatório: sem ele a equipe sai pra montar sem saber
            onde, e o aviso de 30 minutos chega sem o "📍". A trava é só do
            formulário — o schema segue aceitando vazio, porque reserva criada
            pela IA nem sempre tem o endereço na primeira conversa.

            O CEP não é gravado (não existe coluna): serve pra buscar rua e
            bairro e poupar digitação. Tudo continua editável à mão, então
            ViaCEP fora do ar não impede ninguém de cadastrar.
          */}
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <label className="block">
              <span className={labelText}>CEP</span>
              <input
                inputMode="numeric"
                value={cep}
                placeholder="00000-000"
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                  setCep(v.length > 5 ? `${v.slice(0, 5)}-${v.slice(5)}` : v);
                  if (v.length === 8) void buscarCep(v);
                }}
                onBlur={(e) => void buscarCep(e.target.value)}
                className={field}
              />
              <span className="mt-1 block text-[11px] text-[var(--color-muted)]">
                {buscandoCep ? "Buscando…" : erroCep ?? "Preenche rua e bairro sozinho."}
              </span>
            </label>
            <label className="block">
              <span className={labelText}>Rua</span>
              <input
                required
                value={rua}
                onChange={(e) => setRua(e.target.value)}
                placeholder="Rua das Flores"
                className={field}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className={labelText}>Número</span>
              <input
                required
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="120"
                className={field}
              />
            </label>
            <label className="block">
              <span className={labelText}>
                Complemento <span className="font-normal">(opcional)</span>
              </span>
              <input
                value={complemento}
                onChange={(e) => setComplemento(e.target.value)}
                placeholder="Apto 32, fundos"
                className={field}
              />
            </label>
            <label className="block">
              <span className={labelText}>Bairro</span>
              <input
                name="neighborhood"
                required
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                className={field}
              />
            </label>
          </div>

          {/*
            O que o servidor recebe como `address`: rua, número e complemento
            juntos. Fica oculto e SEM `required` de propósito — campo escondido
            e obrigatório trava o envio sem o navegador conseguir mostrar onde
            está o erro. Quem garante o preenchimento são Rua e Número acima.
          */}
          <input type="hidden" name="address" value={enderecoCompleto} />

          <fieldset className="rounded-xl border border-black/10 p-3">
            <legend className="px-1 text-xs font-bold text-[var(--color-muted)]">Brinquedos</legend>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {toys.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-[var(--color-surface)]">
                  <input type="checkbox" name="toyIds" value={t.id} className="size-4 accent-[var(--color-primary)]" />
                  {t.name}
                </label>
              ))}
              {toys.length === 0 && (
                <p className="px-1 py-1 text-xs text-[var(--color-muted)]">Nenhum brinquedo ativo no catálogo.</p>
              )}
            </div>
          </fieldset>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeDialog}
              className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface)]"
            >
              Cancelar
            </button>
            <SubmitButton
              pendingText="Criando..."
              className="rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white hover:brightness-95"
            >
              Criar reserva
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
