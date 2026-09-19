# -*- coding: utf-8 -*-
"""GeoLaw (Radar Geopolitico) - motore locale.
(c) 2026 Lorenzo Paoletta, licenza MIT.

Raccoglie notizie estere da testate italiane, le associa a paesi e luoghi,
calcola un indice di instabilita' e serve il cruscotto su http://localhost:4747
Solo libreria standard di Python: niente da installare.
"""
import gzip
import hashlib
import html
import json
import math
import os
import re
import socket
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORTE = [4747, 5757, 6767, 3737, 12321]   # Windows a volte riserva dei blocchi di porte: si prova la prima libera
QUI = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(QUI, "web")
DATI = os.path.join(QUI, "dati")
CACHE = os.path.join(QUI, "cache")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

GIORNI_MEMORIA = 30
OGNI_NOTIZIE = 300      # secondi tra un giro di notizie e l'altro
OGNI_MERCATI = 180

os.makedirs(CACHE, exist_ok=True)


def carica(percorso, vuoto):
    try:
        with open(percorso, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return vuoto


def salva(percorso, dati):
    tmp = percorso + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dati, f, ensure_ascii=False)
    os.replace(tmp, percorso)


def scarica(url, attesa=20, tollerante=False):
    """tollerante=True: se il certificato del sito e' scaduto si legge lo stesso (solo per i feed pubblici)."""
    rich = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip", "Accept": "*/*"})
    try:
        r = urllib.request.urlopen(rich, timeout=attesa)
    except urllib.error.URLError as e:
        if not (tollerante and isinstance(e.reason, ssl.SSLCertVerificationError)):
            raise
        r = urllib.request.urlopen(rich, timeout=attesa, context=ssl._create_unverified_context())
    with r:
        corpo = r.read()
        if r.headers.get("Content-Encoding") == "gzip" or corpo[:2] == b"\x1f\x8b":
            corpo = gzip.decompress(corpo)
        return corpo


# ---------------------------------------------------------------- conoscenza

PAESI = carica(os.path.join(DATI, "paesi_base.json"), {})
SAPERE = carica(os.path.join(DATI, "conoscenza.json"), {})
BASE_PER_REGIONE = {"Europe": 10, "Americas": 16, "Asia": 20, "Africa": 28, "Oceania": 6, "Antarctic": 0}


def compila(alias):
    """Due regex (una insensibile alle maiuscole, una no) da una lista di alias."""
    ci = [a for a in alias if not a.startswith("=")]
    cs = [a[1:] for a in alias if a.startswith("=")]
    fai = lambda lista, flag: re.compile(r"(?<!\w)(?:" + "|".join(lista) + r")(?!\w)", flag) if lista else None
    return fai(ci, re.I), fai(cs, 0)


def trova(regex, testo):
    ci, cs = regex
    return bool((ci and ci.search(testo)) or (cs and cs.search(testo)))


def posizione(regex, testo):
    """Dove compare per la prima volta (-1 se non compare): il paese citato per primo e' il protagonista."""
    trovati = [m.start() for m in (rx.search(testo) for rx in regex if rx) if m]
    return min(trovati) if trovati else -1


RE_PAESI = {}
for iso, p in PAESI.items():
    sap = SAPERE.get("paesi", {}).get(iso, {})
    alias = list(sap.get("alias", []))
    if not alias:
        nome = p["nome"]
        if len(nome) < 5 or " " not in nome and nome.lower() in ("georgia", "guinea", "niger", "mali", "ciad", "cuba", "oman", "india", "cina", "togo", "palau", "jersey", "man"):
            alias = ["=" + re.escape(nome)]
        else:
            alias = [re.escape(nome)]
    try:
        RE_PAESI[iso] = compila(alias)
    except re.error as e:
        print("alias non valido per", iso, e)

RE_LUOGHI = [(l, compila(l["re"].split("|"))) for l in SAPERE.get("luoghi", [])]
RE_STRETTI = {s["id"]: compila(s["re"].split("|")) for s in SAPERE.get("stretti", [])}

CATEGORIE = {
    "attacco": r"attacc\w+|raid|bombard\w+|missil\w+|esplosion\w+|colpit\w+|uccis\w+|strage|razz[oi]|offensiva|invas\w+|battagli\w+|scontri|sparatoria|attentat\w+|abbattut\w+|bombe|assalt\w+|kamikaze|cecchin\w+",
    "escalation": r"escalation|minacc\w+|ultimatum|mobilitazion\w+|allerta|tension\w+|ritorsion\w+|rappresagli\w+|nuclear\w+|esercitazion\w+|schiera\w+|avvertiment\w+|provocazion\w+|sconfinament\w+|violazion\w+|sabotagg\w+",
    "militare": r"esercit\w+|truppe|armi|armament\w+|difesa|nato|cacciabombardier\w+|jet|f-16|f-35|eurofighter|flotta|portaere\w+|carri armati|soldat\w+|militar\w+|aeronautica|riarmo|sottomarin\w+|contingent\w+|pentagono|guerra|fronte|base aerea|dron[ei]|marines",
    "diplomazia": r"negoziat\w+|tregua|cessate il fuoco|accord\w+|vertice|summit|colloqui\w*|incontr\w+|pace|mediazion\w+|ambasciat\w+|onu|risoluzion\w+|diplomat\w+|trattativ\w+|piano di pace|telefonata",
    "economia": r"sanzion\w+|dazi\w*|petrolio|gas|export\w*|tariff\w+|bors[ae]|prezz\w+|greggio|embargo|commerc\w+|inflazion\w+|pil|debito|energia|gasdott\w+|oleodott\w+|terre rare|chip|semiconduttor\w+",
    "politica": r"elezion\w+|govern\w+|president\w+|premier|golpe|colpo di stato|protest\w+|manifestazion\w+|parlament\w+|dimission\w+|arrest\w+|referendum|voto|opposizion\w+|regime|ministr\w+|condann\w+|processo",
    "umanitario": r"profugh\w+|sfollat\w+|carestia|fame|aiuti|umanitari\w+|ospedal\w+|civili|rifugiat\w+|epidemi\w+|migrant\w+|ostagg\w+|flotilla|unicef|oms|croce rossa",
}
RE_RUMORE = re.compile(r"(?<!\w)(?:squal[oi]|ors[oi]|maltempo|alluvion\w+|allagament\w+|incendi\w*|terremot\w+|uragan\w+|tifon\w+|valang\w+|incidente|serial killer|omicidi\w*|femminicidi\w*|calcio|tennis|olimpiad\w+|film|festival|regina|principe|principessa|windsor|re carlo|royal|oroscopo|meteo|lotteria|restaur\w+|piogg\w+|inondazion\w+|nubifrag\w+|frana|addio a|squalo|turist\w+)(?!\w)", re.I)
RE_CAT = {k: re.compile(r"(?<!\w)(?:" + v + r")(?!\w)", re.I) for k, v in CATEGORIE.items()}
PESO_CAT = {"attacco": 3.0, "escalation": 2.0, "militare": 1.4, "umanitario": 1.0, "politica": 0.7, "economia": 0.6, "diplomazia": 0.5}
ETICHETTA = {"attacco": "ATTACCO", "escalation": "ESCALATION", "militare": "MILITARE", "diplomazia": "DIPLOMAZIA",
             "economia": "ECONOMIA", "politica": "POLITICA", "umanitario": "UMANITARIO"}
ORDINE_TIPO = ["attacco", "escalation", "diplomazia", "militare", "umanitario", "economia", "politica"]

# ---------------------------------------------------------------- stato

BLOCCO = threading.Lock()
NOTIZIE = carica(os.path.join(CACHE, "notizie.json"), [])
STORICO_INDICI = carica(os.path.join(CACHE, "indici.json"), {})
MERCATI = []
STATO_FONTI = {}
ULTIMO_GIRO = 0
CACHE_RETE = {}


def pulisci(testo):
    testo = re.sub(r"<[^>]+>", " ", testo or "")
    testo = html.unescape(html.unescape(testo))
    return re.sub(r"\s+", " ", testo).strip()


MESI_IT = {"gen": "jan", "feb": "feb", "mar": "mar", "apr": "apr", "mag": "may", "giu": "jun", "lug": "jul", "ago": "aug", "set": "sep", "ott": "oct", "nov": "nov", "dic": "dec"}


def quando(testo):
    if not testo:
        return None
    testo = testo.strip()
    basso = testo.lower()
    if re.match(r"(lun|mar|mer|gio|ven|sab|dom),", basso):   # date scritte all'italiana
        basso = basso.split(",", 1)[1]
        pezzi = basso.split()
        if len(pezzi) > 1:
            pezzi[1] = MESI_IT.get(pezzi[1][:3], pezzi[1])
        testo = " ".join(pezzi).replace("gmt", "+0000")
    try:
        d = parsedate_to_datetime(testo)
    except Exception:
        try:
            d = datetime.fromisoformat(testo.replace("Z", "+00:00"))
        except Exception:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.timestamp()


def senza_ns(tag):
    return tag.rsplit("}", 1)[-1].lower()


def leggi_feed(corpo):
    corpo = corpo.lstrip()
    if corpo.startswith(b"\xef\xbb\xbf"):
        corpo = corpo[3:].lstrip()
    radice = ET.fromstring(corpo)
    voci = []
    for el in radice.iter():
        if senza_ns(el.tag) not in ("item", "entry"):
            continue
        v = {"titolo": "", "link": "", "sommario": "", "data": ""}
        for f in el:
            t = senza_ns(f.tag)
            if t == "title":
                v["titolo"] = pulisci(f.text)
            elif t == "link":
                v["link"] = (f.text or "").strip() or f.attrib.get("href", "") or v["link"]
            elif t in ("guid", "id") and not v["link"] and (f.text or "").strip().startswith("http"):
                v["link"] = f.text.strip()
            elif t in ("description", "summary") and not v["sommario"]:
                v["sommario"] = pulisci(f.text)
            elif t in ("pubdate", "published", "updated", "date") and not v["data"]:
                v["data"] = f.text or ""
        if v["titolo"] and v["link"]:
            voci.append(v)
    return voci


def analizza(voce, fonte, filtro_stretto=False):
    # certi feed mettono nel sommario l'articolo intero (con altri titoli dentro): se ne guarda solo l'attacco
    voce = dict(voce, sommario=voce["sommario"][:300])
    testo = voce["titolo"] + ". " + voce["sommario"]
    def in_ordine(testo, esclusi=()):
        pos = ((posizione(rx, testo), iso) for iso, rx in RE_PAESI.items() if iso not in esclusi)
        return [iso for p, iso in sorted(x for x in pos if x[0] >= 0)]
    paesi_titolo = in_ordine(voce["titolo"])
    paesi = paesi_titolo + in_ordine(voce["sommario"], paesi_titolo)
    luogo = None
    for l, rx in RE_LUOGHI:
        if trova(rx, voce["titolo"]):
            luogo = l
            break
    if not luogo:
        for l, rx in RE_LUOGHI:
            if trova(rx, voce["sommario"]):
                luogo = l
                break
    if luogo and luogo["iso"] and luogo["iso"] not in paesi:
        paesi.insert(0, luogo["iso"])
    cat = [k for k, rx in RE_CAT.items() if rx.search(testo)]
    if not paesi and not luogo:
        return None
    if RE_RUMORE.search(voce["titolo"]):   # cronaca, animali, maltempo, famiglie reali
        cat = [k for k in cat if k in ("escalation", "militare") and RE_CAT[k].search(voce["titolo"])]
    duri = {"attacco", "escalation", "militare", "diplomazia", "economia", "umanitario"}
    if not cat or (filtro_stretto and not (duri & set(cat))):
        return None
    # l'Italia da sola, senza temi di politica estera, e' cronaca interna: si scarta
    cat_titolo = [k for k in cat if RE_CAT[k].search(voce["titolo"])]
    if paesi == ["ITA"] and not ({"attacco", "escalation", "militare", "diplomazia"} & set(cat_titolo)):
        return None
    tipo = next((k for k in ORDINE_TIPO if k in cat_titolo), None) or next((k for k in ORDINE_TIPO if k in cat), "politica")
    grav = "alta" if "attacco" in cat_titolo else "media" if ("escalation" in cat or "attacco" in cat) else "bassa"
    ts = quando(voce["data"]) or time.time()
    ts = min(ts, time.time())
    stretti = [sid for sid, rx in RE_STRETTI.items() if trova(rx, testo)]
    return {
        "id": hashlib.md5(voce["link"].encode("utf-8")).hexdigest()[:12],
        "titolo": voce["titolo"][:240], "sommario": voce["sommario"][:320], "link": voce["link"], "fonte": fonte,
        "ts": int(ts), "paesi": paesi[:6], "cat": cat, "tipo": tipo, "grav": grav, "stretti": stretti,
        "luogo": {"nome": luogo["nome"], "lat": luogo["lat"], "lon": luogo["lon"]} if luogo else None,
    }


def chiave_titolo(t):
    return re.sub(r"\W+", "", t.lower())[:70]


def giro_notizie():
    global NOTIZIE, ULTIMO_GIRO, _PRESSIONI
    nuove = []
    for f in SAPERE.get("fonti", []):
        try:
            voci = leggi_feed(scarica(f["url"], tollerante=True))
            buone = [n for n in (analizza(v, f["nome"], f["nome"] == "Internazionale") for v in voci) if n]
            nuove += buone
            STATO_FONTI[f["nome"]] = {"ok": True, "voci": len(buone), "ts": int(time.time())}
        except Exception as e:
            STATO_FONTI[f["nome"]] = {"ok": False, "errore": str(e)[:120], "ts": int(time.time())}
    with BLOCCO:
        visti_link = {n["link"] for n in NOTIZIE}
        visti_tit = {chiave_titolo(n["titolo"]) for n in NOTIZIE}
        for n in nuove:
            k = chiave_titolo(n["titolo"])
            if n["link"] in visti_link or k in visti_tit:
                continue
            visti_link.add(n["link"])
            visti_tit.add(k)
            NOTIZIE.append(n)
        limite = time.time() - GIORNI_MEMORIA * 86400
        NOTIZIE = sorted((n for n in NOTIZIE if n["ts"] > limite), key=lambda n: -n["ts"])
        salva(os.path.join(CACHE, "notizie.json"), NOTIZIE)
        ULTIMO_GIRO = int(time.time())
    _PRESSIONI = (0, {})
    fotografa_indici()


def punto_paese(iso):
    sap = SAPERE.get("paesi", {}).get(iso, {})
    if "punto" in sap:
        return sap["punto"]
    p = PAESI.get(iso)
    return [p["lat"], p["lon"]] if p else None


def base_paese(iso):
    sap = SAPERE.get("paesi", {}).get(iso, {})
    if "base" in sap:
        return sap["base"]
    return BASE_PER_REGIONE.get(PAESI.get(iso, {}).get("reg", ""), 12)


_PRESSIONI = (0, {})


def pressioni(ore=72):
    """Quanto 'scottano' le notizie recenti su ogni paese: peso per categoria, sfumato nel tempo."""
    global _PRESSIONI
    ora = time.time()
    if ora - _PRESSIONI[0] < 15:
        return _PRESSIONI[1]
    tot = {}
    for n in list(NOTIZIE):
        eta = (ora - n["ts"]) / 3600
        if eta < 0 or eta > ore:
            continue
        peso = max((PESO_CAT.get(c, 0.3) for c in n["cat"]), default=0.3) * (1 - eta / ore * 0.7)
        for i, iso in enumerate(n["paesi"]):
            tot[iso] = tot.get(iso, 0.0) + (peso if i == 0 else peso * 0.5)
    _PRESSIONI = (ora, tot)
    return tot


def indice(iso):
    base = base_paese(iso)
    pr = pressioni().get(iso, 0.0)
    spinta = min(22.0, (100 - base) * 0.6 * (1 - math.exp(-pr / 40.0)))
    return int(round(min(100, base + spinta))), base, round(spinta, 1), round(pr, 1)


def livello(v):
    return "alto" if v >= 60 else "medio" if v >= 38 else "basso"


def fotografa_indici():
    oggi = datetime.now().strftime("%Y-%m-%d")
    with BLOCCO:
        STORICO_INDICI[oggi] = {iso: indice(iso)[0] for iso in PAESI}
        for g in sorted(STORICO_INDICI)[:-GIORNI_MEMORIA]:
            del STORICO_INDICI[g]
        salva(os.path.join(CACHE, "indici.json"), STORICO_INDICI)


def giro_mercati():
    global MERCATI
    fuori = []
    for simbolo, nome in SAPERE.get("mercati", []):
        try:
            u = "https://query1.finance.yahoo.com/v8/finance/chart/" + urllib.parse.quote(simbolo) + "?range=1d&interval=1d"
            m = json.loads(scarica(u, 12))["chart"]["result"][0]["meta"]
            prezzo = m.get("regularMarketPrice")
            prima = m.get("chartPreviousClose") or m.get("previousClose")
            var = m.get("regularMarketChangePercent")
            if var is None and prezzo is not None and prima:
                var = (prezzo - prima) / prima * 100
            if prezzo is None or var is None:
                continue
            fuori.append({"s": simbolo, "nome": nome, "prezzo": prezzo, "var": round(var, 2), "valuta": m.get("currency", "")})
        except Exception:
            pass
        time.sleep(0.25)
    if fuori:
        MERCATI = fuori


def ciclo(funzione, ogni):
    def gira():
        while True:
            try:
                funzione()
            except Exception as e:
                print("errore in", funzione.__name__, e)
            time.sleep(ogni)
    threading.Thread(target=gira, daemon=True).start()


# ---------------------------------------------------------------- risposte

def stato():
    ora = time.time()
    with BLOCCO:
        notizie = list(NOTIZIE)
        giorni = sorted(STORICO_INDICI)
        ieri = STORICO_INDICI.get(giorni[-2]) if len(giorni) > 1 else None
    paesi = {}
    for iso, p in PAESI.items():
        v, base, spinta, pr = indice(iso)
        paesi[iso] = {"n": p["n"], "a2": p["a2"], "nome": p["nome"], "ind": v, "liv": livello(v), "pr": pr,
                      "delta": (v - ieri[iso]) if ieri and iso in ieri else 0, "pt": punto_paese(iso)}
    recenti = [n for n in notizie if ora - n["ts"] < 72 * 3600][:260]
    allerte = [n for n in notizie if n["grav"] == "alta" and ora - n["ts"] < 18 * 3600][:10]

    # focolai: un segnale per luogo (o per paese se il luogo non e' noto)
    focolai = {}
    for n in recenti:
        if ora - n["ts"] > 48 * 3600:
            continue
        if n["luogo"]:
            k, nome, lat, lon, iso = "L:" + n["luogo"]["nome"], n["luogo"]["nome"], n["luogo"]["lat"], n["luogo"]["lon"], (n["paesi"] or [""])[0]
        elif n["paesi"]:
            iso = n["paesi"][0]
            pt = punto_paese(iso)
            if not pt:
                continue
            k, nome, lat, lon = "P:" + iso, PAESI[iso]["nome"], pt[0], pt[1]
        else:
            continue
        f = focolai.setdefault(k, {"k": k, "nome": nome, "lat": lat, "lon": lon, "iso": iso, "n": 0, "alta": 0, "media": 0, "ultimo": 0, "titolo": ""})
        f["n"] += 1
        f["alta"] += n["grav"] == "alta"
        f["media"] += n["grav"] == "media"
        if n["ts"] > f["ultimo"]:
            f["ultimo"], f["titolo"] = n["ts"], n["titolo"]

    # rapporto del giorno
    ultime24 = [n for n in notizie if ora - n["ts"] < 24 * 3600]
    conta = {}
    for n in ultime24:
        for iso in n["paesi"][:2]:
            c = conta.setdefault(iso, {"iso": iso, "n": 0, "alta": 0, "titoli": []})
            c["n"] += 1
            c["alta"] += n["grav"] == "alta"
            if len(c["titoli"]) < 3:
                c["titoli"].append({"t": n["titolo"], "f": n["fonte"], "l": n["link"], "ts": n["ts"]})
    caldi = sorted(conta.values(), key=lambda c: -(c["n"] + 2 * c["alta"]))[:8]
    temi = {}
    for n in ultime24:
        temi[n["tipo"]] = temi.get(n["tipo"], 0) + 1
    movimenti = sorted(({"iso": i, "delta": p["delta"], "ind": p["ind"]} for i, p in paesi.items() if p["delta"]), key=lambda x: -abs(x["delta"]))[:6]

    stretti = []
    for s in SAPERE.get("stretti", []):
        rel = [n for n in notizie if s["id"] in n.get("stretti", []) and ora - n["ts"] < 7 * 86400]
        gravi = sum(1 for n in rel if n["grav"] != "bassa")
        # anche gli attacchi nel paese che controlla lo stretto contano, ma la meta'
        gravi += sum(1 for n in notizie if n not in rel and n["grav"] == "alta" and n["paesi"][:1] and n["paesi"][0] in s.get("paesi", []) and ora - n["ts"] < 7 * 86400) // 2
        stretti.append({**{k: s[k] for k in ("id", "nome", "lat", "lon", "zoom", "scheda", "merci")}, "notizie7g": len(rel), "gravi7g": gravi,
                        "stato": "critico" if gravi >= 6 else "sorvegliato" if gravi >= 2 else "regolare"})

    return {"ora": int(ora), "ultimoGiro": ULTIMO_GIRO, "paesi": paesi, "notizie": recenti, "allerte": allerte,
            "focolai": list(focolai.values()), "mercati": MERCATI, "fonti": STATO_FONTI, "etichette": ETICHETTA,
            "rapporto": {"totale24": len(ultime24), "gravi24": sum(1 for n in ultime24 if n["grav"] == "alta"), "caldi": caldi, "temi": temi, "movimenti": movimenti},
            "stretti": stretti}


def scheda_paese(iso):
    if iso not in PAESI:
        return {"errore": "paese sconosciuto"}
    ora = time.time()
    with BLOCCO:
        mie = [n for n in NOTIZIE if iso in n["paesi"]]
        storico = {g: v.get(iso) for g, v in STORICO_INDICI.items()}
    v, base, spinta, pr = indice(iso)
    serie = []
    for g in range(GIORNI_MEMORIA - 1, -1, -1):
        inizio = datetime.fromtimestamp(ora - g * 86400).replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
        giorno = [n for n in mie if inizio <= n["ts"] < inizio + 86400]
        serie.append({"g": datetime.fromtimestamp(inizio).strftime("%d/%m"), "n": len(giorno), "gravi": sum(1 for n in giorno if n["grav"] != "bassa")})
    ultime72 = [n for n in mie if ora - n["ts"] < 72 * 3600]
    assi = {k: 0 for k in CATEGORIE}
    for n in (ultime72 or mie[:40]):
        for c in n["cat"]:
            assi[c] += 1
    sap = SAPERE.get("paesi", {}).get(iso, {})
    collegati = {}
    for n in ultime72:
        for altro in n["paesi"]:
            if altro != iso:
                collegati[altro] = collegati.get(altro, 0) + 1
    return {"iso": iso, "a2": PAESI[iso]["a2"], "nome": PAESI[iso]["nome"], "ind": v, "liv": livello(v), "base": base, "spinta": spinta,
            "pressione": pr, "contesto": sap.get("contesto", ""), "serie": serie, "assi": assi, "n72": len(ultime72),
            "gravi72": sum(1 for n in ultime72 if n["grav"] == "alta"), "notizie": mie[:40], "storico": storico,
            "collegati": [{"iso": k, "nome": PAESI[k]["nome"], "n": c} for k, c in sorted(collegati.items(), key=lambda x: -x[1])[:6]]}


def con_cache(chiave, durata, funzione):
    ora = time.time()
    c = CACHE_RETE.get(chiave)
    if c and ora - c[0] < durata:
        return c[1]
    try:
        dati = funzione()
        CACHE_RETE[chiave] = (ora, dati)
        return dati
    except Exception as e:
        return c[1] if c else {"errore": str(e)[:160]}


def aerei():
    d = json.loads(scarica("https://api.adsb.lol/v2/mil", 20))
    fuori = []
    for a in d.get("ac", []):
        if a.get("lat") is None or a.get("lon") is None or a.get("alt_baro") in (None, "ground"):
            continue
        fuori.append({"id": a.get("hex"), "volo": (a.get("flight") or "").strip(), "tipo": a.get("t", ""), "reg": a.get("r", ""),
                      "lat": round(a["lat"], 3), "lon": round(a["lon"], 3), "quota": a.get("alt_baro"), "vel": a.get("gs"), "rotta": a.get("track")})
    return {"ts": int(time.time()), "aerei": fuori}


def natura():
    fuori = []
    try:
        q = json.loads(scarica("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"))
        for f in q["features"]:
            c = f["geometry"]["coordinates"]
            fuori.append({"tipo": "terremoto", "titolo": "Terremoto M%.1f" % f["properties"]["mag"], "dove": f["properties"]["place"],
                          "lat": c[1], "lon": c[0], "forza": f["properties"]["mag"], "ts": int(f["properties"]["time"] / 1000), "link": f["properties"]["url"]})
    except Exception:
        pass
    try:
        nomi = {"wildfires": "Incendio", "severeStorms": "Tempesta", "volcanoes": "Vulcano", "floods": "Alluvione", "seaLakeIce": "Ghiacci", "drought": "Siccità"}
        e = json.loads(scarica("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=10&limit=120", 25))
        for ev in e["events"]:
            g = ev["geometry"][-1]
            if g["type"] != "Point":
                continue
            cid = ev["categories"][0]["id"]
            if cid == "seaLakeIce":
                continue
            fuori.append({"tipo": cid, "titolo": nomi.get(cid, "Evento"), "dove": ev["title"], "lat": g["coordinates"][1], "lon": g["coordinates"][0],
                          "forza": 0, "ts": int(quando(g["date"]) or 0), "link": ev.get("link", "")})
    except Exception:
        pass
    return {"ts": int(time.time()), "eventi": fuori}


class Gestore(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=WEB, **k)

    def log_message(self, *a):
        pass

    def json(self, dati):
        corpo = json.dumps(dati, ensure_ascii=False).encode("utf-8")
        if "gzip" in self.headers.get("Accept-Encoding", ""):
            corpo = gzip.compress(corpo, 5)
            extra = [("Content-Encoding", "gzip")]
        else:
            extra = []
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        for k, v in extra:
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        try:
            if u.path == "/api/ping":
                return self.json({"radar": True})
            if u.path == "/api/stato":
                return self.json(stato())
            if u.path == "/api/paese":
                return self.json(scheda_paese((q.get("iso") or [""])[0].upper()))
            if u.path == "/api/aerei":
                return self.json(con_cache("aerei", 20, aerei))
            if u.path == "/api/natura":
                return self.json(con_cache("natura", 900, natura))
        except Exception as e:
            return self.json({"errore": str(e)})
        return super().do_GET()


def gia_acceso():
    """Se il radar gira gia', restituisce la sua porta."""
    try:
        porta = int(open(os.path.join(CACHE, "porta.txt")).read())
        with urllib.request.urlopen("http://127.0.0.1:%d/api/ping" % porta, timeout=1.5) as r:
            return porta if json.load(r).get("radar") else None
    except Exception:
        return None


if __name__ == "__main__":
    apri = "--apri" in sys.argv
    porta = gia_acceso()
    if porta:
        if apri:
            webbrowser.open("http://localhost:%d" % porta)
        sys.exit(0)
    candidate = ([int(sys.argv[sys.argv.index("--porta") + 1])] if "--porta" in sys.argv else []) + PORTE
    srv = None
    for porta in candidate:
        try:
            srv = ThreadingHTTPServer(("127.0.0.1", porta), Gestore)
            break
        except OSError:
            continue
    if not srv:
        sys.exit("Nessuna porta libera tra " + str(candidate))
    with open(os.path.join(CACHE, "porta.txt"), "w") as f:
        f.write(str(porta))
    indirizzo = "http://localhost:%d" % porta
    ciclo(giro_notizie, OGNI_NOTIZIE)
    ciclo(giro_mercati, OGNI_MERCATI)
    if apri:
        threading.Timer(1.0, lambda: webbrowser.open(indirizzo)).start()
    print("Radar Geopolitico acceso su", indirizzo, flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
