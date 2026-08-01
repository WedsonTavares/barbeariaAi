# Base de Conhecimento — Diny Festas

> **O que é este documento.** É a fonte de verdade que a IA consulta pela tool
> `base_conhecimento` sempre que precisar de um detalhe que não está no prompt dela: medidas e
> capacidade dos brinquedos, itens de segurança, horário, bairros atendidos, **preços acima do
> mínimo**, pagamento, sinal, cancelamento e regra de chuva. Nada aqui foi inventado — o que
> ainda não temos está marcado como `[PREENCHER: ...]`, e a IA foi instruída a **nunca
> adivinhar** um campo assim: ela diz que confirma com a equipe.
>
> **Como usar:** edite este arquivo local, preencha os `[PREENCHER]` com o dado real, e copie o
> conteúdo pro Google Doc que a tool lê:
> https://docs.google.com/document/d/1AOPG2XvxeIeZeNQPN1LPVUOqmFybUA6yDc3BZT3vq2s/edit
>
> **Formato pergunta-e-resposta de propósito:** a tool busca um trecho relevante neste texto
> pra responder — perguntas curtas e diretas na FAQ ajudam a achar a resposta certa mais rápido
> do que uma ficha técnica corrida.

---

## Identidade

**Nome:** Diny Festas
**O que fazemos:** locação de brinquedos infláveis para festas infantis, com foco principal em **pula-pulas**.
**Clima da marca:** alegre, animado e acolhedor, girando em torno de festa e comemoração. A
festa é da criança, mas **quem contrata é adulto** (mãe, pai, avó, quem organiza) — o tom é de
vendedora simpática que entende do assunto e resolve rápido, nunca linguagem infantilizada
com quem está contratando.

## Local de atendimento

Atendemos em **Ribeirão Preto – SP**.

**Bairros/regiões atendidos:** `[PREENCHER: lista de bairros ou "toda a cidade + região X"]`
**Taxa de deslocamento:** `[PREENCHER: existe taxa? a partir de qual distância/bairro? valor?]`

## Horário de atendimento

Atendemos em horário comercial.

**Horário exato de abertura e encerramento:** `[PREENCHER: ex. Seg a Sáb, 8h às 18h]`
**Atende domingo/feriado?** `[PREENCHER]`

## Contato

**Telefone/WhatsApp da empresa:** `[PREENCHER]`
**Endereço (se o cliente quiser visitar/retirar):** `[PREENCHER: endereço completo, ou "não temos loja física, só entrega"]`

## Serviços oferecidos

Locação de pula-pulas para festas e eventos. A equipe da Diny Festas:

- leva o brinquedo até o local;
- monta e deixa pronto para uso;
- desmonta depois do evento;
- retira do local.

O cliente não precisa montar, desmontar ou transportar nada.

---

## Catálogo de brinquedos

> ⚠️ **Nunca escreva aqui quantidade de unidades em estoque.** O cliente não precisa saber
> quantas unidades existem de cada modelo — a disponibilidade já é resolvida sozinha pela
> checagem de data/horário (`/api/agent/disponibilidade`). Este documento descreve o
> **produto**, não o estoque. Quando comprar mais unidades do mesmo brinquedo, isso é só uma
> linha nova em `Toy` no painel; este texto não muda.

### Como adicionar um novo brinquedo aqui

Quando comprar um brinquedo novo, copie o bloco `### Nome do Brinquedo` abaixo, cole no fim
desta seção e preencha os campos com os dados reais (geralmente vêm da ficha técnica do
fabricante/loja). Cadastre o brinquedo também no painel (`/admin/brinquedos`) — são dois
lugares diferentes: o painel controla estoque/disponibilidade, este doc só descreve o produto
pra IA conseguir responder dúvida técnica sobre ele.

```
### Nome do Brinquedo

- **Tipo:** inflável / cama elástica / outro
- **Tamanho/diâmetro:**
- **Peso máximo suportado:**
- **Itens de segurança:** (rede, escada, outros)
- **Idade mínima recomendada:**
- **Capacidade de crianças ao mesmo tempo:**
- **Precisa de tomada elétrica perto?**
- **Observações:**
```

### Pula Pula Profissional

- **Tipo:** `[PREENCHER: inflável — precisa de soprador ligado — ou cama elástica sem motor?]`
- **Tamanho/diâmetro:** 3,05 m
- **Peso máximo suportado:** 500 kg
- **Itens de segurança:** rede de proteção nas laterais, escada de acesso
- **Idade mínima recomendada:** a partir de 1 ano, sempre com supervisão de um adulto
- **Capacidade de crianças ao mesmo tempo:** `[PREENCHER]`
- **Precisa de tomada elétrica perto?** `[PREENCHER]` (depende do tipo, acima)
- **Observações:** cor da lona de salto preta

---

## Requisitos do espaço

**Espaço mínimo necessário para montagem:** `[PREENCHER: ex. área plana de Xm x Ym]`
**Precisa de tomada elétrica perto?** `[PREENCHER: sim/não em geral, qual distância máxima do ponto de energia]`
**Pode ser em área com grama, laje, terra?** `[PREENCHER]`

## Duração da locação

- **Mínimo: 4 horas.** Não alugamos por menos.
- Acima do mínimo, o cliente escolhe quanto tempo quiser, **em blocos de 30 minutos** (4h, 4h30, 5h, 7h, 12h...).
- **Não existe limite máximo de pacote** — quem limita é o horário livre na agenda.
- A agenda trabalha em slots de 30 minutos e é consultada em tempo real; não há "pacotes" fixos de 4h ou 7h.

## Valores

- **Valor mínimo: R$ 150,00 pelas 4 horas.** Esse é o único valor que a IA informa de cabeça, sempre como "a partir de".

**Tabela por quantidade de horas acima do mínimo:** `[PREENCHER: quanto custa 5h, 6h, 7h, 12h, dia todo — ou a regra de cálculo, ex. "R$ X por hora adicional"]`

**Mais de um brinquedo na mesma festa:** `[PREENCHER: soma os valores? tem desconto de combo? qual?]`

> ⚠️ **Esta seção é a única fonte de preço acima do mínimo.** A IA está proibida de estimar
> valor ou calcular proporção ("7 horas dá quase o dobro" é proibido). O que não estiver
> preenchido aqui vira encaminhamento para o suporte humano.

### Pagamento

**Formas de pagamento aceitas:** `[PREENCHER: Pix, cartão, dinheiro?]`
**Valor de sinal/entrada para reservar:** `[PREENCHER: valor fixo ou % do total]`
**Quando o restante deve ser pago:** `[PREENCHER: na entrega, antes, etc.]`

### Cancelamento

**Política de cancelamento:** `[PREENCHER: prazo mínimo, se o sinal é devolvido, taxa de cancelamento]`

### Chuva / mau tempo

**Regra para dia de chuva:** `[PREENCHER: reagenda sem custo? tem carência de X horas antes pra avisar? brinquedo é coberto?]`

## Negociação

A Diny Festas está aberta a negociações. Pedidos de desconto, condição especial de pagamento
ou proposta fora dos valores acima são sempre encaminhados para o **suporte humano** (a IA não
fecha negociação sozinha).

Período personalizado **não** é negociação: qualquer duração a partir de 4 horas, em blocos de
30 minutos, é atendida normalmente pela agenda. O que vai para o humano é só o **valor**, se a
tabela acima não cobrir aquela duração.

---

## Perguntas frequentes

**O pula-pula é seguro?**
Sim — o Pula Pula Profissional tem rede de proteção nas laterais e escada de acesso, e suporta até 500 kg.

**A partir de que idade pode usar?**
O Pula Pula Profissional é indicado a partir de 1 ano, sempre com um adulto por perto acompanhando a criançada.

**Qual o tamanho do pula-pula?**
O Pula Pula Profissional tem 3,05 metros de diâmetro — cabe bem em quintais, garagens e salões de festa de tamanho médio.

`[PREENCHER: adicione aqui outras perguntas que os clientes costumam fazer e ainda não foram cobertas acima — ex: "posso escolher o horário de montagem?", "vocês atendem condomínio?", "o brinquedo é higienizado?"]`

---

## Checklist do que falta preencher

- [ ] Bairros/regiões atendidos + taxa de deslocamento
- [ ] Horário comercial exato (dias e horas)
- [ ] Telefone/WhatsApp oficial e endereço
- [ ] Pula Pula Profissional: tipo (inflável/cama elástica), capacidade de crianças, necessidade de tomada
- [ ] Espaço necessário para montagem + tipo de piso aceito
- [ ] **Tabela de preços acima do mínimo de 4h** (5h, 6h, 7h, dia todo — ou regra por hora adicional)
- [ ] **Valor de combo / mais de um brinquedo na mesma festa**
- [ ] Formas de pagamento + valor de sinal
- [ ] Política de cancelamento
- [ ] Regra para chuva
- [ ] FAQs adicionais
