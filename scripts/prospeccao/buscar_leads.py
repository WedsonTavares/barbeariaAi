#!/usr/bin/env python3
"""
Prospecção de barbearias e salões pela Google Places API (New).

Descobre estabelecimentos numa região, qualifica cada um e devolve um CSV
ordenado por prioridade — para você atacar de cima para baixo no contato manual.

POR QUE A PLACES API E NÃO SCRAPING DO MAPS
  Raspar o Maps funciona, mas viola os termos do Google, quebra quando eles
  mudam o HTML e leva bloqueio de IP. Para uma lista que você vai usar uma vez,
  tanto faz; para um processo comercial recorrente, não é fundação. A API custa
  pouco no volume de prospecção e não quebra.

COMO O CUSTO É CONTROLADO (a parte que mais economiza)
  A Places API cobra por SKU conforme os campos pedidos. Telefone e site são do
  SKU mais caro. Por isso a busca roda em duas fases:
    1. DESCOBERTA — campos baratos (nome, endereço, nota, nº de avaliações).
       Varre a região inteira.
    2. ENRIQUECIMENTO — telefone e site, SÓ para quem passou no filtro.
  Numa cidade média isso costuma cortar 60–80% das chamadas caras.

POR QUE UMA GRADE DE CÍRCULOS
  O `searchNearby` devolve no máximo 20 lugares por chamada e não tem paginação.
  Uma única busca com raio de 10 km devolveria 20 resultados e esconderia o
  resto. A saída é varrer a região com vários círculos pequenos e sobrepostos,
  removendo repetidos pelo id do lugar.

USO
  export GOOGLE_MAPS_API_KEY="..."
  python3 buscar_leads.py --lat -21.1775 --lng -47.8103 --raio 8000
  python3 buscar_leads.py --lat -21.1775 --lng -47.8103 --raio 8000 --simular

  A chave sai do Google Cloud Console com a "Places API (New)" habilitada.
  Restrinja a chave a essa API — ela vai ficar no seu ambiente.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request

BASE = "https://places.googleapis.com/v1/places"

# Tipos do Google que correspondem ao nosso público. "hair_care" pega barbearia
# e cabeleireiro; "beauty_salon" pega salão e estética. Manicure e spa entram
# porque também são serviço com hora marcada — o produto atende os dois.
TIPOS = ["hair_care", "beauty_salon", "nail_salon", "spa"]

# Raio de cada círculo da grade. Menor = mais cobertura e mais chamadas.
# 1200 m equilibra bem em cidade de porte médio.
RAIO_CELULA_M = 1200


# ─────────────────────────────── HTTP ────────────────────────────────────────

def _post(url: str, corpo: dict, api_key: str, field_mask: str) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(corpo).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": field_mask,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def _get(url: str, api_key: str, field_mask: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={"X-Goog-Api-Key": api_key, "X-Goog-FieldMask": field_mask},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


# ─────────────────────────── grade de varredura ──────────────────────────────

def grade(lat: float, lng: float, raio_total_m: int, raio_celula_m: int) -> list[tuple[float, float]]:
    """
    Pontos que cobrem o círculo pedido, espaçados para os círculos se sobreporem.

    O passo é raio*1.5 em vez de raio*2 de propósito: círculos que só se tocam
    deixam vãos nos cantos entre eles, e é exatamente ali que some um lead.
    """
    passo_m = raio_celula_m * 1.5
    graus_lat = passo_m / 111_320
    graus_lng = passo_m / (111_320 * math.cos(math.radians(lat)))
    n = int(raio_total_m / passo_m) + 1

    pontos = []
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            p_lat = lat + i * graus_lat
            p_lng = lng + j * graus_lng
            # Distância aproximada até o centro, para não varrer fora do raio.
            dx = (p_lng - lng) * 111_320 * math.cos(math.radians(lat))
            dy = (p_lat - lat) * 111_320
            if math.hypot(dx, dy) <= raio_total_m:
                pontos.append((p_lat, p_lng))
    return pontos


# ───────────────────────── fase 1: descoberta ────────────────────────────────

# Campos baratos. Note que telefone e site NÃO estão aqui — é isso que segura o
# custo na varredura, que é a parte com muitas chamadas.
MASK_BUSCA = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.rating",
    "places.userRatingCount",
    "places.businessStatus",
    "places.primaryType",
])


def descobrir(api_key: str, pontos, pausa: float) -> dict[str, dict]:
    achados: dict[str, dict] = {}
    for n, (lat, lng) in enumerate(pontos, 1):
        corpo = {
            "includedTypes": TIPOS,
            "maxResultCount": 20,
            "locationRestriction": {
                "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": RAIO_CELULA_M}
            },
            "languageCode": "pt-BR",
        }
        try:
            r = _post(f"{BASE}:searchNearby", corpo, api_key, MASK_BUSCA)
        except urllib.error.HTTPError as e:
            print(f"  ! célula {n}: HTTP {e.code} — {e.read().decode()[:200]}", file=sys.stderr)
            continue

        novos = 0
        for p in r.get("places", []):
            if p["id"] not in achados:
                achados[p["id"]] = p
                novos += 1
        print(f"  célula {n}/{len(pontos)}: +{novos} novos (total {len(achados)})")
        time.sleep(pausa)
    return achados


# ─────────────────────────── filtro e pontuação ──────────────────────────────

def passa_no_filtro(p: dict, min_avaliacoes: int) -> bool:
    """
    Quem nem vale gastar a chamada cara de telefone.

    Estabelecimento fechado não interessa, e um com pouquíssima avaliação
    costuma ser cadastro morto, autônomo sem movimento, ou registro duplicado.
    """
    if p.get("businessStatus") != "OPERATIONAL":
        return False
    return (p.get("userRatingCount") or 0) >= min_avaliacoes


def pontuar(p: dict) -> tuple[int, list[str]]:
    """
    Prioridade do lead, de 0 a 100, com o motivo escrito.

    A lógica vem do que a gente vende: um negócio com MOVIMENTO e SEM SISTEMA.
    Volume de avaliação é a melhor proxy pública de movimento; a ausência de
    site é a melhor proxy de "atende tudo no braço, pelo WhatsApp".
    """
    pontos = 0
    motivos: list[str] = []

    n = p.get("userRatingCount") or 0
    if n >= 300:
        pontos += 40; motivos.append("muito movimento (300+ avaliações)")
    elif n >= 100:
        pontos += 32; motivos.append("bom movimento (100+ avaliações)")
    elif n >= 40:
        pontos += 22; motivos.append("movimento moderado (40+ avaliações)")
    else:
        pontos += 10; motivos.append("pouco movimento")

    # O sinal mais forte de todos: tem cliente e não tem sistema.
    if not p.get("websiteUri"):
        pontos += 30; motivos.append("SEM SITE — atende no braço")
    else:
        site = p["websiteUri"].lower()
        # Link de agregador não é sistema próprio: continua sendo bom lead.
        if any(x in site for x in ("instagram.", "facebook.", "linktr.ee", "linktree", "wa.me", "beacons.")):
            pontos += 22; motivos.append("só rede social, sem sistema próprio")
        else:
            pontos += 4; motivos.append("já tem site próprio")

    nota = p.get("rating")
    if nota is None:
        pontos += 5
    elif nota >= 4.8:
        pontos += 10; motivos.append(f"reputação excelente ({nota})")
    elif nota >= 4.3:
        # A faixa mais fértil para o pós-atendimento: liga para reputação e
        # ainda tem o que melhorar.
        pontos += 20; motivos.append(f"nota {nota} — cabe pós-atendimento")
    elif nota >= 3.5:
        pontos += 14; motivos.append(f"nota {nota} — precisa de reputação")
    else:
        pontos += 6; motivos.append(f"nota baixa ({nota})")

    # Sem telefone você não consegue abordar — o lead não serve, por melhor
    # que seja o resto.
    if p.get("nationalPhoneNumber"):
        pontos += 10
    else:
        pontos -= 25; motivos.append("SEM TELEFONE")

    return max(0, min(100, pontos)), motivos


# ──────────────────────── fase 2: enriquecimento ─────────────────────────────

# Campos caros (SKU superior). Só para quem passou no filtro.
MASK_DETALHE = "id,nationalPhoneNumber,websiteUri,googleMapsUri"


def enriquecer(api_key: str, achados: dict[str, dict], min_avaliacoes: int, pausa: float) -> list[dict]:
    candidatos = [p for p in achados.values() if passa_no_filtro(p, min_avaliacoes)]
    print(f"\n[2] Enriquecendo {len(candidatos)} de {len(achados)} "
          f"({len(achados) - len(candidatos)} descartados sem gastar chamada cara)")

    for n, p in enumerate(candidatos, 1):
        try:
            d = _get(f"{BASE}/{p['id']}", api_key, MASK_DETALHE)
            p["nationalPhoneNumber"] = d.get("nationalPhoneNumber")
            p["websiteUri"] = d.get("websiteUri")
            p["googleMapsUri"] = d.get("googleMapsUri")
        except urllib.error.HTTPError as e:
            print(f"  ! {p['id']}: HTTP {e.code}", file=sys.stderr)
        if n % 25 == 0:
            print(f"  {n}/{len(candidatos)}")
        time.sleep(pausa)
    return candidatos


# ─────────────────────────────── saída ───────────────────────────────────────

def gravar(leads: list[dict], caminho: str) -> None:
    linhas = []
    for p in leads:
        score, motivos = pontuar(p)
        linhas.append({
            "score": score,
            "nome": (p.get("displayName") or {}).get("text", ""),
            "telefone": p.get("nationalPhoneNumber") or "",
            "avaliacoes": p.get("userRatingCount") or 0,
            "nota": p.get("rating") or "",
            "site": p.get("websiteUri") or "",
            "endereco": p.get("formattedAddress", ""),
            "por_que": " · ".join(motivos),
            "maps": p.get("googleMapsUri") or "",
            "place_id": p.get("id", ""),
        })

    linhas.sort(key=lambda x: x["score"], reverse=True)
    with open(caminho, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()) if linhas else ["score"])
        w.writeheader()
        w.writerows(linhas)

    quentes = [l for l in linhas if l["score"] >= 70]
    print(f"\n✓ {len(linhas)} leads em {caminho}")
    print(f"  {len(quentes)} com score 70+ — comece por eles\n")
    for l in linhas[:10]:
        tel = l["telefone"] or "sem telefone"
        print(f"  {l['score']:3d}  {l['nome'][:34]:36s} {tel:18s} {l['por_que'][:52]}")


# ──────────────────────────────── main ───────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="Prospecção de barbearias e salões via Google Places API")
    ap.add_argument("--lat", type=float, required=True, help="latitude do centro (ex.: -21.1775 Ribeirão Preto)")
    ap.add_argument("--lng", type=float, required=True, help="longitude do centro (ex.: -47.8103)")
    ap.add_argument("--raio", type=int, default=8000, help="raio total em metros (padrão 8000)")
    ap.add_argument("--min-avaliacoes", type=int, default=15,
                    help="descarta quem tiver menos que isso (padrão 15)")
    ap.add_argument("--saida", default="leads.csv")
    ap.add_argument("--pausa", type=float, default=0.15, help="segundos entre chamadas")
    ap.add_argument("--simular", action="store_true",
                    help="só mostra quantas chamadas faria, sem gastar cota")
    args = ap.parse_args()

    pontos = grade(args.lat, args.lng, args.raio, RAIO_CELULA_M)

    if args.simular:
        print(f"Grade: {len(pontos)} células de {RAIO_CELULA_M} m cobrindo {args.raio} m de raio")
        print(f"  fase 1 (barata): até {len(pontos)} chamadas de busca")
        print(f"  fase 2 (cara):   1 por lead aprovado — só se sabe depois da fase 1")
        print("\nRode sem --simular para valer. Confira sua cota no Google Cloud antes.")
        return 0

    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        print("Defina GOOGLE_MAPS_API_KEY no ambiente.", file=sys.stderr)
        return 1

    print(f"[1] Varrendo {len(pontos)} células de {RAIO_CELULA_M} m…")
    achados = descobrir(api_key, pontos, args.pausa)
    if not achados:
        print("Nada encontrado. Confira a chave e se a Places API (New) está habilitada.", file=sys.stderr)
        return 1

    leads = enriquecer(api_key, achados, args.min_avaliacoes, args.pausa)
    gravar(leads, args.saida)
    return 0


if __name__ == "__main__":
    sys.exit(main())
