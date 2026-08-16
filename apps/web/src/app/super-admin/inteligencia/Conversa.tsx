"use client";
import { useRef, useState, useTransition } from "react";
import { Sparkles, AlertTriangle, Send } from "lucide-react";

import { perguntarAction } from "./actions";

/**
 * Atalhos: as perguntas que valem fazer toda semana, prontas.
 *
 * Existem porque tela de chat em branco não sugere o que ela sabe responder —
 * e o valor aqui está justamente em perguntas que a pessoa não pensaria em
 * fazer sozinha.
 */
const ATALHOS = [
  { rotulo: "Leads prioritários", pergunta: "Quais são os melhores leads para eu abordar hoje, e por quê?" },
  { rotulo: "Analisar carteira", pergunta: "Faça um diagnóstico da minha carteira de prospecção. O que os números mostram?" },
  { rotulo: "Analisar funil", pergunta: "Como está meu funil? Onde estou perdendo mais gente entre as etapas?" },
  { rotulo: "Oportunidades", pergunta: "Que oportunidades eu não estou aproveitando na carteira?" },
  { rotulo: "Alertas", pergunta: "O que está parado ou esquecido e precisa de atenção agora?" },
];

type Turno = { pergunta: string; resposta: string | null; erro: string | null };

export function Conversa() {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [pendente, iniciar] = useTransition();
  const fim = useRef<HTMLDivElement>(null);

  function perguntar(pergunta: string) {
    const limpa = pergunta.trim();
    if (!limpa || pendente) return;
    setTexto("");
    setTurnos((t) => [...t, { pergunta: limpa, resposta: null, erro: null }]);

    iniciar(async () => {
      const r = await perguntarAction(limpa);
      setTurnos((t) => {
        const copia = [...t];
        const ultimo = copia[copia.length - 1];
        if (ultimo) {
          if (r.ok) ultimo.resposta = r.texto;
          else ultimo.erro = r.erro;
        }
        return copia;
      });
      requestAnimationFrame(() => fim.current?.scrollIntoView({ behavior: "smooth" }));
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-2">
        {ATALHOS.map((a) => (
          <button
            key={a.rotulo}
            type="button"
            disabled={pendente}
            onClick={() => perguntar(a.pergunta)}
            className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-bold shadow-sm hover:bg-[var(--color-surface)] disabled:opacity-50"
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {turnos.length === 0 && (
        <section className="rounded-2xl border border-black/5 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto grid size-10 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
            <Sparkles className="size-5" />
          </span>
          <p className="mt-2 font-bold">Pergunte à Inteligência</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Ela lê sua carteira e seu funil, e responde com os números que encontrar.
            Não executa nada — apenas observa e recomenda.
          </p>
        </section>
      )}

      {turnos.map((t, i) => (
        <div key={i} className="space-y-2">
          <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">
            {t.pergunta}
          </p>

          {t.erro ? (
            <p className="flex max-w-[85%] items-start gap-2 rounded-2xl rounded-bl-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {t.erro}
            </p>
          ) : t.resposta === null ? (
            <p className="max-w-[85%] rounded-2xl rounded-bl-sm border border-black/5 bg-white px-4 py-3 text-sm text-[var(--color-muted)] shadow-sm">
              Analisando...
            </p>
          ) : (
            <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-black/5 bg-white px-4 py-3 text-sm shadow-sm">
              {t.resposta}
            </div>
          )}
        </div>
      ))}
      <div ref={fim} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          perguntar(texto);
        }}
        className="sticky bottom-4 flex gap-2 rounded-2xl border border-black/5 bg-white p-2 shadow-lg"
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={pendente}
          placeholder="Quais são os melhores leads para eu abordar hoje?"
          className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={pendente || !texto.trim()}
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--color-primary)] text-white disabled:opacity-40"
          aria-label="Perguntar"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
