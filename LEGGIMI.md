# GeoLaw (Radar Geopolitico)

Cruscotto geopolitico in italiano: globo 3D con i paesi colorati per rischio, notizie estere in tempo reale da testate italiane, schede paese, stretti marittimi con navi in diretta, aerei militari dal vivo, mercati sensibili.

## Come si usa
- **Accendere**: doppio clic sull'icona **GeoLaw** sul Desktop (oppure su `Avvia Radar.bat`). Si apre da solo nel browser.
- **Spegnere**: doppio clic su `Spegni Radar.bat`. Chiudere la scheda del browser non lo spegne: resta acceso a raccogliere notizie.
- Serve la connessione a internet. Non c'è niente da installare oltre a Python, che sul PC c'è già.

## Da dove arrivano i dati
| Cosa | Fonte | Ogni quanto |
|---|---|---|
| Notizie | ANSA, Rai News, Sky TG24, la Repubblica, AGI, Il Post, Euronews, Analisi Difesa, Internazionale (feed RSS) | 5 minuti |
| Mercati | Yahoo Finance | 3 minuti |
| Aerei militari | adsb.lol (solo velivoli con transponder acceso) | 25 secondi, quando lo strato è acceso |
| Terremoti, incendi, tempeste | USGS e NASA EONET | 15 minuti |
| Navi in diretta | MarineTraffic (mappa incorporata) | in diretta |
| Diretta TV | Euronews in italiano su YouTube | in diretta |

## Come nasce l'indice di instabilità
`indice = rischio di fondo + spinta delle notizie` (massimo 100).
- Il **rischio di fondo** è una stima scritta a mano paese per paese nel file `dati/conoscenza.json` (voce `base`). Si può cambiare con il Blocco note.
- La **spinta delle notizie** (fino a +22) dipende da quante notizie delle ultime 72 ore parlano del paese e di che tipo sono: un attacco pesa più di un vertice diplomatico, una notizia fresca più di una vecchia.
- Rosso da 60 in su, arancione da 38 a 59, verde sotto.

È uno strumento per orientarsi, non una valutazione ufficiale: le notizie sono classificate in automatico per parole chiave e ogni tanto sbagliano.

## File
- `server.py` — il motore (solo libreria standard di Python).
- `web/` — la pagina (globo, pannelli).
- `dati/conoscenza.json` — paesi, parole chiave, luoghi, stretti, testate, titoli di borsa: tutto modificabile.
- `cache/` — archivio delle notizie (30 giorni) e fotografia giornaliera degli indici. Si può cancellare: si ricrea.
