# GeoLaw

A geopolitical dashboard that runs on your own PC: a globe with every country coloured by risk level, foreign news from Italian outlets as it comes out, and a few tools to see where tension is rising.

*[Leggi in italiano](#in-italiano)*

![The conflict map](docs/geolaw.png)

## Why I made it

I kept seeing a dashboard like this on TikTok: in English, built on American sources, behind a subscription. I wanted my own, one that reads ANSA and Rai News instead of CNN and asks for neither an account nor a card. This is what came out.

It is not a professional tool and does not pretend to be. It is a tidy way to look at the news.

One thing to know up front: **the interface and the news are in Italian**, because that was the whole point. The code and the data files are easy to repoint at feeds in another language, see below.

## What it does

On the **map**, each country is red, amber or green depending on an instability index. Alerts on the left, latest news on the right, and on top a ticker with the markets that react to crises: defence stocks, oil, gas, gold, wheat.

Click a country, or search for it, and its card opens: index, news volume over the last month, a short brief, the topics being discussed and the countries that show up most often next to it.

![Country card](docs/scheda-paese.png)

The **daily report** lines up the hottest fronts of the last 24 hours, the indices that moved since yesterday, and the markets.

![Daily report](docs/rapporto.png)

There is also the full **news flow**, the **straits and routes** view (Hormuz, Suez, Bab el-Mandeb, Malacca and the others, with a live ship map) and three layers you can switch on over the globe: live military aircraft, earthquakes and natural events, straits.

## Running it

You only need Python 3. I use 3.11 on Windows 11; it should work on Mac and Linux but I have not tried. Nothing to `pip install`: the engine uses the standard library only.

```
python server.py --apri
```

(`--apri` means "open": it launches the browser for you.) On Windows you can double-click `Avvia Radar.bat`. To stop it use `Spegni Radar.bat`: closing the browser tab does not stop it, it keeps collecting news in the background.

The server listens on `127.0.0.1` only. It tries port 4747 and, if that is taken, moves on to 5757, 6767 and so on. That is not fussiness: on Windows whole blocks of ports sometimes turn out to be reserved by the system for no visible reason, and with a fixed port it would randomly fail to start.

## How the index works

`index = baseline risk + news push`, capped at 100.

The baseline is a number I wrote by hand, country by country, in `dati/conoscenza.json`. It is an estimate and you can argue with it: if you disagree, change it in a text editor.

The news push goes up to +22 and depends on how many headlines from the last 72 hours mention the country and what they are about. An attack weighs 3, an escalation 2, military news 1.4, diplomacy 0.5. A headline from an hour ago counts more than one from two days ago.

Red from 60 up, amber from 38 to 59, green below.

## Changing it without touching the code

Everything that is knowledge rather than program lives in `dati/conoscenza.json`: countries, places, straits, outlets, market symbols.

Adding an outlet is one line:

```json
{"nome": "ANSA", "url": "https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml"}
```

Countries and places are spotted in headlines with regular expressions. A leading `=` makes the match case-sensitive, which helps with ambiguous words:

```json
{"nome": "Gaza", "re": "gaza|=Striscia|rafah|khan yun[ie]s", "lat": 31.45, "lon": 34.4, "iso": "PSE"}
```

False alarms are handled in `server.py`: `RE_RUMORE` is the list of words that get a headline thrown away (football, weather, royal family, horoscope...) and `CATEGORIE` decides what counts as an attack and what counts as diplomacy. To use it in another language you would swap the feeds, the country aliases and those two lists.

## Limits I know about

- Headlines are classified by keywords, so it gets things wrong now and then. "Attack" in a football headline is filtered out almost every time. Almost.
- Market data comes from a Yahoo Finance address that is not an official service. It can stop working overnight.
- Military aircraft are the ones flying with their transponder on. The interesting ones often fly with it off.
- The ship map and the live TV are embeds from MarineTraffic and YouTube: if they change their rules, those panels go away. Sky TG24 refuses to be embedded, which is why the live stream is Euronews.
- The Analisi Difesa feed has an expired certificate. For that feed only, the engine accepts the unverified connection (it is a public RSS, read-only).
- The archive keeps 30 days.
- It is meant to run locally. Do not put it on an internet-facing server as it is.

## Dead ends

Writing these down because they cost me time and might save someone else's.

- **GDELT**: the GEO API answers 404, the DOC API allows one request every five seconds and often comes back empty.
- **restcountries**: shut down. The country list comes from [mledoze/countries](https://github.com/mledoze/countries).
- **Stooq** for market data: 404.

## Things I would like to add

A daily summary that reads better than a list, a history longer than 30 days, and something about forecasts (Polymarket is the only decent source).

If you try it and something breaks, open an issue and I will have a look.

## Data and credits

News from the RSS feeds of ANSA, Rai News, Sky TG24, la Repubblica, AGI, Il Post, Euronews, Analisi Difesa, Internazionale: only the title, the feed's short summary and the link are stored, the article is read on the outlet's site. Markets: Yahoo Finance. Aircraft: [adsb.lol](https://adsb.lol). Earthquakes and natural events: USGS and NASA EONET. Ships: MarineTraffic. Globe: [globe.gl](https://globe.gl), borders from [world-atlas](https://github.com/topojson/world-atlas), flags from flagcdn.com. Country list from mledoze/countries (ODbL).

## License

MIT. Made by Lorenzo Paoletta.

---

## In italiano

GeoLaw è un cruscotto geopolitico che gira sul tuo PC: un globo con i paesi colorati per livello di rischio, le notizie estere delle testate italiane man mano che escono, e qualche strumento per capire dove sta salendo la tensione.

**Perché l'ho fatto.** Vedevo girare su TikTok un cruscotto di questo tipo: in inglese, con fonti americane, in abbonamento. Ne volevo uno mio, che leggesse ANSA e Rai News invece della CNN e che non mi chiedesse né un account né una carta. Non è uno strumento professionale e non vuole sembrarlo: è un modo ordinato di guardare le notizie.

**Cosa fa.** Nella mappa ogni paese è rosso, arancione o verde in base a un indice di instabilità; a sinistra le allerte, a destra le ultime notizie, sopra i titoli di borsa che reagiscono alle crisi. Cliccando un paese si apre la sua scheda con indice, andamento delle notizie nell'ultimo mese, quadro della situazione e temi. Il rapporto del giorno mette in fila i fronti più caldi delle ultime 24 ore. Poi ci sono il flusso notizie, gli stretti e le rotte con le navi in diretta, e gli strati con aerei militari, terremoti ed eventi naturali.

**Come si avvia.** Serve solo Python 3, senza niente da installare con pip:

```
python server.py --apri
```

Su Windows basta il doppio clic su `Avvia Radar.bat`; per spegnerlo c'è `Spegni Radar.bat` (chiudere la scheda del browser non lo ferma). Ascolta solo su `127.0.0.1` e prova le porte 4747, 5757, 6767... perché su Windows capita che blocchi di porte risultino riservati senza motivo.

**L'indice.** `indice = rischio di fondo + spinta delle notizie`, massimo 100. Il rischio di fondo l'ho scritto io paese per paese in `dati/conoscenza.json`, è una stima e si può cambiare con il Blocco note. La spinta (fino a +22) dipende da quante notizie delle ultime 72 ore parlano del paese e di che tipo sono: un attacco pesa 3, la diplomazia 0,5. Rosso da 60, arancione da 38 a 59, verde sotto.

**Cambiarlo.** Paesi, luoghi, stretti, testate e titoli di borsa stanno tutti in `dati/conoscenza.json`. I falsi allarmi si tolgono in `server.py` con `RE_RUMORE` e `CATEGORIE`.

**Limiti.** Classifica per parole chiave e ogni tanto sbaglia; i dati di borsa vengono da un indirizzo non ufficiale di Yahoo; gli aerei sono solo quelli con il transponder acceso; mappa navi e diretta TV dipendono da MarineTraffic e YouTube; l'archivio tiene 30 giorni; è pensato per girare in locale, non su un server esposto.

Se lo provi e qualcosa non funziona, apri una issue: la guardo.
