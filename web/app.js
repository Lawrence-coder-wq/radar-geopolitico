/* Radar Geopolitico - interfaccia */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const COLORI = {
    alto: { cima: "rgba(255,59,78,.46)", bordo: "#ff5a6a", lato: "rgba(255,59,78,.18)" },
    medio: { cima: "rgba(255,176,46,.40)", bordo: "#ffc257", lato: "rgba(255,176,46,.15)" },
    basso: { cima: "rgba(61,255,139,.20)", bordo: "#48f08e", lato: "rgba(61,255,139,.08)" },
    nullo: { cima: "rgba(120,140,160,.10)", bordo: "#52606e", lato: "rgba(0,0,0,0)" },
  };
  const TAVOLOZZA = ["#ff3b4e", "#ffb02e", "#4fd8ff", "#3dff8b", "#c9a2ff", "#8492a3"];
  const NOMI_ASSI = { attacco: "Attacchi", escalation: "Escalation", militare: "Militare", diplomazia: "Diplomazia", economia: "Economia", politica: "Politica", umanitario: "Umanitario" };

  let S = null;                      // ultimo stato ricevuto dal motore
  let perNumero = {};                // codice numerico ISO -> iso3
  let sopra = null;                  // poligono sotto il mouse
  let aerei = [], natura = [];
  const strati = { conflitti: true, aerei: false, natura: false, stretti: true, gira: true };
  let filtroFlusso = "tutte";
  let timerAerei = null;

  // ------------------------------------------------------------ utilita'
  const fa = ts => {
    const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60));
    if (m < 1) return "adesso";
    if (m < 60) return m + " min fa";
    const h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? " ora fa" : " ore fa");
    const g = Math.round(h / 24);
    return g + (g === 1 ? " giorno fa" : " giorni fa");
  };
  const num = (v, d = 2) => Number(v).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
  const isoDi = f => {
    if (!f) return null;
    const nome = f.properties && f.properties.name;
    if (nome === "Kosovo") return "UNK";
    if (nome === "N. Cyprus") return "CYP";
    if (nome === "Somaliland") return "SOM";
    return perNumero[String(f.id).padStart(3, "0")] || null;
  };
  const paeseDi = f => { const i = isoDi(f); return i && S ? S.paesi[i] : null; };
  const tinta = f => COLORI[(paeseDi(f) || {}).liv || "nullo"];

  function voceHtml(n, conSommario) {
    const dove = n.luogo ? n.luogo.nome : (n.paesi[0] && S.paesi[n.paesi[0]] ? S.paesi[n.paesi[0]].nome : "");
    return `<div class="voce ${n.grav}" data-id="${n.id}">
      <div class="capo"><span class="tipo ${n.tipo}">${esc(S.etichette[n.tipo] || n.tipo)}</span><span class="dove">${esc(dove)}</span><span style="margin-left:auto">${fa(n.ts)}</span></div>
      <div class="titolo">${esc(n.titolo)}</div>
      ${conSommario && n.sommario ? `<div class="sommario">${esc(n.sommario)}</div>` : ""}
      <div class="piede"><span>${esc(n.fonte)}</span><a href="${esc(n.link)}" target="_blank" rel="noopener">leggi l'articolo ↗</a></div>
    </div>`;
  }

  // ------------------------------------------------------------ globo
  const mondo = new Globe($("#globo"), { animateIn: true })
    .globeImageUrl("https://cdn.jsdelivr.net/npm/three-globe@2/example/img/earth-blue-marble.jpg")
    .bumpImageUrl("https://cdn.jsdelivr.net/npm/three-globe@2/example/img/earth-topology.png")
    .backgroundImageUrl("https://cdn.jsdelivr.net/npm/three-globe@2/example/img/night-sky.png")
    .atmosphereColor("#ff5a6a").atmosphereAltitude(0.16)
    .polygonAltitude(f => (f === sopra ? 0.035 : 0.008))
    .polygonCapColor(f => (strati.conflitti ? (f === sopra ? tinta(f).bordo + "99" : tinta(f).cima) : "rgba(0,0,0,0)"))
    .polygonSideColor(f => (strati.conflitti ? tinta(f).lato : "rgba(0,0,0,0)"))
    .polygonStrokeColor(f => (strati.conflitti ? tinta(f).bordo : "#3b4652"))
    .polygonsTransitionDuration(250)
    .polygonLabel(f => {
      const p = paeseDi(f);
      if (!p) return "";
      const nome = { alto: "ALTO RISCHIO", medio: "TENSIONE", basso: "STABILE" }[p.liv];
      return `<div class="suggerimento"><b>${esc(p.nome)}</b> · indice ${p.ind}/100<small>${nome} — clicca per la scheda</small></div>`;
    })
    .onPolygonHover(f => { sopra = f; mondo.polygonAltitude(mondo.polygonAltitude()).polygonCapColor(mondo.polygonCapColor()); $("#globo").style.cursor = f ? "pointer" : "grab"; })
    .onPolygonClick(f => { const i = isoDi(f); if (i) apriPaese(i); })
    .pointLat("lat").pointLng("lon")
    .pointAltitude(d => d.alt).pointRadius(d => d.r).pointColor(d => d.col).pointResolution(8)
    .pointLabel(d => d.etichetta)
    .onPointClick(d => d.clic && d.clic())
    .ringLat("lat").ringLng("lon").ringColor(d => t => `rgba(${d.rgb},${1 - t})`)
    .ringMaxRadius(d => d.max).ringPropagationSpeed(2.2).ringRepeatPeriod(d => d.periodo)
    .htmlLat("lat").htmlLng("lon").htmlAltitude(0.012)
    .htmlElementVisibilityModifier((el, visibile) => { el.style.opacity = visibile ? 1 : 0; el.style.pointerEvents = visibile ? "auto" : "none"; })
    .htmlElement(d => {
      const el = document.createElement("div");
      el.className = "segna-stretto " + d.stato;
      el.innerHTML = `<i></i><span>${esc(d.nome.toUpperCase())}</span>`;
      el.onclick = e => { e.stopPropagation(); apriStretto(d.id); };
      return el;
    });

  mondo.pointOfView({ lat: 36, lng: 32, altitude: 1.9 }, 0);
  const comandi = mondo.controls();
  comandi.autoRotate = true; comandi.autoRotateSpeed = 0.22; comandi.minDistance = 130; comandi.maxDistance = 520;
  $("#globo").addEventListener("pointerdown", () => { comandi.autoRotate = false; });
  $("#globo").addEventListener("pointerup", () => { setTimeout(() => { comandi.autoRotate = strati.gira && $("#cassetto").hidden; }, 4000); });
  comandi.addEventListener("change", () => $("#globo").classList.toggle("vicino", mondo.pointOfView().altitude < 1.45));
  const misura = () => { const r = $("#palco").getBoundingClientRect(); mondo.width(r.width).height(r.height); };
  addEventListener("resize", misura); misura();

  fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json").then(r => r.json()).then(t => {
    const paesi = topojson.feature(t, t.objects.countries).features.filter(f => f.properties.name !== "Antarctica");
    mondo.polygonsData(paesi);
  });

  function disegnaPunti() {
    const punti = [], anelli = [];
    if (S && strati.conflitti) {
      for (const f of S.focolai) {
        const grave = f.alta > 0, medio = f.media > 0;
        const col = grave ? "#ff3b4e" : medio ? "#ffb02e" : "#9fb1c6";
        punti.push({
          lat: f.lat, lon: f.lon, alt: 0.012 + Math.min(0.09, f.n * 0.007), r: 0.22 + Math.min(0.5, f.n * 0.035), col,
          etichetta: `<div class="suggerimento"><b>${esc(f.nome)}</b> · ${f.n} notizie in 48 ore${f.alta ? ` · ${f.alta} gravi` : ""}<small>${esc(f.titolo)}</small></div>`,
          clic: () => (f.k.startsWith("P:") ? apriPaese(f.iso) : apriLuogo(f)),
        });
        if (grave && Date.now() / 1000 - f.ultimo < 12 * 3600)
          anelli.push({ lat: f.lat, lon: f.lon, rgb: "255,59,78", max: 3 + Math.min(4, f.alta), periodo: 1100 });
      }
    }
    if (strati.aerei) for (const a of aerei) punti.push({
      lat: a.lat, lon: a.lon, alt: 0.02, r: 0.12, col: "#4fd8ff",
      etichetta: `<div class="suggerimento"><b>${esc(a.volo || a.reg || a.id)}</b> · ${esc(a.tipo || "velivolo militare")}<small>quota ${a.quota ? Math.round(a.quota * 0.3048).toLocaleString("it-IT") + " m" : "n.d."} · velocità ${a.vel ? Math.round(a.vel * 1.852) + " km/h" : "n.d."}</small></div>`,
    });
    if (strati.natura) for (const e of natura) {
      punti.push({
        lat: e.lat, lon: e.lon, alt: 0.015, r: e.tipo === "terremoto" ? 0.15 + (e.forza - 4) * 0.16 : 0.2, col: e.tipo === "terremoto" ? "#ffb02e" : "#ff7a3a",
        etichetta: `<div class="suggerimento"><b>${esc(e.titolo)}</b><small>${esc(e.dove)} · ${fa(e.ts)}</small></div>`,
        clic: () => e.link && window.open(e.link, "_blank", "noopener"),
      });
      if (e.tipo === "terremoto" && e.forza >= 5.5) anelli.push({ lat: e.lat, lon: e.lon, rgb: "255,176,46", max: e.forza - 2, periodo: 1600 });
    }
    mondo.pointsData(punti).ringsData(anelli);
    mondo.htmlElementsData(S && strati.stretti ? S.stretti : []);
  }
  const ricolora = () => mondo.polygonCapColor(mondo.polygonCapColor()).polygonSideColor(mondo.polygonSideColor()).polygonStrokeColor(mondo.polygonStrokeColor());

  // ------------------------------------------------------------ interruttori
  $("#interruttori").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const k = b.dataset.strato;
    strati[k] = !strati[k]; b.classList.toggle("acceso", strati[k]);
    if (k === "gira") comandi.autoRotate = strati.gira;
    if (k === "conflitti") ricolora();
    if (k === "aerei") { clearInterval(timerAerei); if (strati.aerei) { prendiAerei(); timerAerei = setInterval(prendiAerei, 25000); } }
    if (k === "natura" && strati.natura && !natura.length) prendiNatura();
    disegnaPunti();
  });
  async function prendiAerei() {
    avviso("Ricezione dei transponder militari…");
    try { const d = await (await fetch("/api/aerei")).json(); aerei = d.aerei || []; avviso(aerei.length + " velivoli militari in volo con transponder acceso", 4000); }
    catch { avviso("Tracciamento aerei non raggiungibile", 4000); }
    disegnaPunti();
  }
  async function prendiNatura() {
    avviso("Carico terremoti ed eventi naturali…");
    try { const d = await (await fetch("/api/natura")).json(); natura = d.eventi || []; avviso(natura.length + " eventi naturali in corso", 4000); }
    catch { avviso("Dati non raggiungibili", 4000); }
    disegnaPunti();
  }
  let timerAvviso;
  function avviso(t, durata) {
    const el = $("#avviso"); el.textContent = t; el.classList.remove("via");
    clearTimeout(timerAvviso); if (durata) timerAvviso = setTimeout(() => el.classList.add("via"), durata);
  }

  // ------------------------------------------------------------ stato e pannelli fissi
  async function aggiorna() {
    try {
      const d = await (await fetch("/api/stato")).json();
      if (d.errore) throw new Error(d.errore);
      const primo = !S; S = d;
      perNumero = {}; for (const [iso, p] of Object.entries(S.paesi)) if (p.n) perNumero[p.n] = iso;
      if (!S.ultimoGiro) { avviso("Prima raccolta delle notizie in corso…"); setTimeout(aggiorna, 3000); return; }
      if (primo) avviso("GeoLaw acceso · " + S.notizie.length + " notizie dalle ultime 72 ore", 5000);
      ricolora(); disegnaPunti(); pannelli(); nastro(); vistaCorrente();
      $("#aggiornato").textContent = "notizie aggiornate " + fa(S.ultimoGiro);
    } catch (e) {
      avviso("Motore spento: riapri GeoLaw dal Desktop");
    }
  }
  function pannelli() {
    $("#nAllerte").textContent = S.allerte.length || "";
    $("#allerte").innerHTML = S.allerte.length ? S.allerte.map(n => voceHtml(n)).join("") : `<div class="voce"><div class="titolo" style="color:var(--tenue)">Nessuna allerta grave nelle ultime 18 ore.</div></div>`;
    $("#nNotizie").textContent = S.notizie.length;
    $("#ultime").innerHTML = S.notizie.slice(0, 60).map(n => voceHtml(n)).join("");
  }
  function nastro() {
    if (!S.mercati.length) { $("#nastroCorsa").innerHTML = "<span><b>MERCATI</b> in caricamento…</span>"; return; }
    const pezzo = S.mercati.map(m => `<span><b>${esc(m.nome)}</b>${num(m.prezzo, m.prezzo < 10 ? 4 : 2)} <span class="${m.var >= 0 ? "su" : "giu"}">${m.var >= 0 ? "▲ +" : "▼ "}${num(m.var)}%</span></span>`).join("");
    $("#nastroCorsa").innerHTML = pezzo + pezzo;
  }
  setInterval(() => { $("#ora").textContent = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }, 1000);

  // clic su una notizia: vola sul posto e apre la scheda del paese
  document.addEventListener("click", e => {
    if (e.target.closest("a")) return;
    const v = e.target.closest(".voce[data-id]"); if (!v || !S) return;
    const n = S.notizie.find(x => x.id === v.dataset.id) || (schedaAperta && schedaAperta.notizie || []).find(x => x.id === v.dataset.id);
    if (!n) return;
    if (n.paesi[0] && !(schedaAperta && schedaAperta.iso === n.paesi[0])) { mostraVista("mappa"); apriPaese(n.paesi[0], n.luogo); }
    else window.open(n.link, "_blank", "noopener");
  });

  // ------------------------------------------------------------ scheda paese
  let schedaAperta = null;
  function apriCassetto(html) {
    $("#cassettoCorpo").innerHTML = html; $("#cassetto").hidden = false; $("#cassetto").scrollTop = 0;
    $("#colonnaDestra").style.visibility = "hidden"; comandi.autoRotate = false;
  }
  function chiudiCassetto() {
    $("#cassetto").hidden = true; $("#cassettoCorpo").innerHTML = ""; schedaAperta = null;
    $("#colonnaDestra").style.visibility = ""; comandi.autoRotate = strati.gira;
  }
  $("#chiudiCassetto").onclick = chiudiCassetto;
  addEventListener("keydown", e => { if (e.key === "Escape") chiudiCassetto(); });

  function scintilla(serie) {
    const L = 400, A = 70, max = Math.max(3, ...serie.map(s => s.n));
    const x = i => (i / (serie.length - 1)) * L, y = v => A - 4 - (v / max) * (A - 12);
    const linea = serie.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.n).toFixed(1)}`).join("");
    return `<svg viewBox="0 0 ${L} ${A}" width="100%" height="${A}" preserveAspectRatio="none" role="img" aria-label="Notizie al giorno">
      <defs><linearGradient id="sfuma" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff3b4e" stop-opacity=".45"/><stop offset="1" stop-color="#ff3b4e" stop-opacity="0"/></linearGradient></defs>
      <path d="${linea}L${L},${A}L0,${A}Z" fill="url(#sfuma)"/><path d="${linea}" fill="none" stroke="#ff3b4e" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function ragno(assi) {
    const chiavi = Object.keys(NOMI_ASSI), max = Math.max(1, ...chiavi.map(k => assi[k] || 0)), C = 130, R = 86;
    const pt = (i, r) => { const a = -Math.PI / 2 + (i / chiavi.length) * Math.PI * 2; return [C + Math.cos(a) * r, C + 6 + Math.sin(a) * r]; };
    const giri = [0.33, 0.66, 1].map(f => `<polygon points="${chiavi.map((_, i) => pt(i, R * f).map(v => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="#232c37"/>`).join("");
    const raggi = chiavi.map((_, i) => `<line x1="${C}" y1="${C + 6}" x2="${pt(i, R)[0].toFixed(1)}" y2="${pt(i, R)[1].toFixed(1)}" stroke="#1b222b"/>`).join("");
    const forma = chiavi.map((k, i) => pt(i, R * Math.max(0.06, Math.sqrt((assi[k] || 0) / max))).map(v => v.toFixed(1)).join(",")).join(" ");
    const nomi = chiavi.map((k, i) => { const [px, py] = pt(i, R + 16); return `<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" text-anchor="${px < C - 8 ? "end" : px > C + 8 ? "start" : "middle"}" dominant-baseline="middle" fill="#8492a3" font-size="9.5" font-family="JetBrains Mono,monospace">${NOMI_ASSI[k].toUpperCase()} ${assi[k] || 0}</text>`; }).join("");
    return `<svg viewBox="-40 -6 340 284" width="100%" style="max-height:270px" role="img" aria-label="Profilo della crisi">${giri}${raggi}<polygon points="${forma}" fill="rgba(255,59,78,.28)" stroke="#ff3b4e" stroke-width="1.5"/>${nomi}</svg>`;
  }
  function quadro(p) {
    const righe = [];
    if (p.contesto) righe.push(`<p class="contesto">${esc(p.contesto)}</p>`);
    if (!p.n72) { righe.push(`<p>Nelle ultime 72 ore le testate seguite non hanno pubblicato notizie rilevanti su ${esc(p.nome)}: l'indice coincide con il rischio di fondo.</p>`); return righe.join(""); }
    const ord = Object.entries(p.assi).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
    const temi = ord.slice(0, 3).map(([k, v]) => `${NOMI_ASSI[k].toLowerCase()} (${v})`).join(", ");
    let t = `Nelle ultime 72 ore il radar ha raccolto <b>${p.n72} notizie</b> su ${esc(p.nome)}`;
    t += p.gravi72 ? `, di cui <b>${p.gravi72}</b> su attacchi o azioni armate.` : `, nessuna su attacchi armati.`;
    if (temi) t += ` I temi più presenti: ${temi}.`;
    righe.push(`<p>${t}</p>`);
    const u = p.notizie[0];
    if (u) righe.push(`<p>Ultimo sviluppo (${fa(u.ts)}, ${esc(u.fonte)}): «${esc(u.titolo)}».</p>`);
    if (p.collegati.length) righe.push(`<p>Compare più spesso insieme a: ${p.collegati.slice(0, 4).map(c => esc(c.nome)).join(", ")}.</p>`);
    return righe.join("");
  }
  async function apriPaese(iso, luogo) {
    const base = S && S.paesi[iso]; if (!base) return;
    const pt = luogo || (base.pt ? { lat: base.pt[0], lon: base.pt[1] } : null);
    if (pt) mondo.pointOfView({ lat: pt.lat, lng: pt.lon + 14, altitude: 1.35 }, 1100);
    apriCassetto(`<div class="testa"><div><div class="liv ${base.liv}">CARICAMENTO…</div><h2>${esc(base.nome)}</h2></div></div>`);
    let p; try { p = await (await fetch("/api/paese?iso=" + iso)).json(); } catch { return; }
    if (p.errore) return;
    schedaAperta = p;
    const nomeLiv = { alto: "ALTO RISCHIO", medio: "TENSIONE", basso: "STABILE" }[p.liv];
    const colore = { alto: "var(--rosso)", medio: "var(--ambra)", basso: "var(--verde)" }[p.liv];
    const delta = base.delta ? `<span class="delta ${base.delta > 0 ? "giu" : "su"}">${base.delta > 0 ? "▲ +" : "▼ "}${base.delta} da ieri</span>` : "";
    const totale = p.serie.reduce((a, s) => a + s.n, 0), picco = Math.max(...p.serie.map(s => s.n));
    apriCassetto(`
      <div class="testa"><img src="https://flagcdn.com/w80/${p.a2.toLowerCase()}.png" alt="" onerror="this.remove()">
        <div><div class="liv ${p.liv}">${nomeLiv}</div><h2>${esc(p.nome)}</h2></div></div>
      <div class="blocco"><h4>INDICE DI INSTABILITÀ</h4>
        <div class="numerone" style="color:${colore}">${p.ind}<small>/ 100</small>${delta}</div>
        <div class="asta"><i style="width:${p.base}%;background:${colore};opacity:.45"></i><i style="width:${Math.max(0, p.ind - p.base)}%;background:${colore}"></i></div>
        <div class="spiega"><span>rischio di fondo <b>${p.base}</b></span><span>spinta delle notizie <b>+${Math.max(0, p.ind - p.base)}</b></span></div></div>
      <div class="blocco"><h4>COPERTURA DELLE NOTIZIE <span>${p.serie[0].g} → ${p.serie[p.serie.length - 1].g}</span></h4>${scintilla(p.serie)}
        <div class="spiega"><span><b>${totale}</b> notizie in archivio</span><span>picco <b>${picco}</b> al giorno</span></div></div>
      <div class="blocco"><h4>QUADRO DELLA SITUAZIONE</h4><div class="prosa">${quadro(p)}</div></div>
      <div class="blocco"><h4>PROFILO DELLA CRISI <span>notizie per tema, 72 ore</span></h4>${ragno(p.assi)}</div>
      ${p.collegati.length ? `<div class="blocco"><h4>PAESI COLLEGATI</h4><div class="etichette">${p.collegati.map(c => `<button data-iso="${c.iso}">${esc(c.nome)}<b>${c.n}</b></button>`).join("")}</div></div>` : ""}
      <div class="blocco" style="padding-left:0;padding-right:0"><h4 style="padding:0 18px">NOTIZIE SUL PAESE <span>${p.notizie.length}</span></h4>
        ${p.notizie.length ? p.notizie.map(n => voceHtml(n, true)).join("") : `<div class="prosa" style="padding:0 18px">Niente in archivio per ora.</div>`}</div>`);
    schedaAperta = p;
  }
  $("#cassettoCorpo").addEventListener("click", e => { const b = e.target.closest("button[data-iso]"); if (b) apriPaese(b.dataset.iso); });

  function apriLuogo(f) {
    mondo.pointOfView({ lat: f.lat, lng: f.lon + 10, altitude: 1.1 }, 1000);
    const nn = S.notizie.filter(n => n.luogo && n.luogo.nome === f.nome);
    schedaAperta = { iso: null, notizie: nn };
    apriCassetto(`<div class="testa"><div><div class="liv ${f.alta ? "alto" : f.media ? "medio" : "basso"}">FOCOLAIO</div><h2>${esc(f.nome)}</h2></div></div>
      ${f.iso && S.paesi[f.iso] ? `<div class="blocco"><div class="etichette"><button data-iso="${f.iso}">Apri la scheda: ${esc(S.paesi[f.iso].nome)}<b>${S.paesi[f.iso].ind}</b></button></div></div>` : ""}
      <div class="blocco" style="padding-left:0;padding-right:0"><h4 style="padding:0 18px">NOTIZIE DA QUI <span>${nn.length} in 72 ore</span></h4>${nn.map(n => voceHtml(n, true)).join("")}</div>`);
  }

  // ------------------------------------------------------------ stretti
  function ciambella(merci) {
    let a0 = -Math.PI / 2; const R = 52, r = 32, C = 60, tot = merci.reduce((s, m) => s + m[1], 0);
    const spicchi = merci.map((m, i) => {
      const a1 = a0 + (m[1] / tot) * Math.PI * 2, g = a1 - a0 > Math.PI ? 1 : 0;
      const P = (a, rr) => `${(C + Math.cos(a) * rr).toFixed(2)},${(C + Math.sin(a) * rr).toFixed(2)}`;
      const d = `M${P(a0, R)}A${R},${R} 0 ${g} 1 ${P(a1, R)}L${P(a1, r)}A${r},${r} 0 ${g} 0 ${P(a0, r)}Z`; a0 = a1;
      return `<path d="${d}" fill="${TAVOLOZZA[i % TAVOLOZZA.length]}" stroke="#07090d" stroke-width="1.5"/>`;
    }).join("");
    return `<svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="Merci in transito">${spicchi}</svg>`;
  }
  function apriStretto(id) {
    const s = S.stretti.find(x => x.id === id); if (!s) return;
    mostraVista("mappa");
    mondo.pointOfView({ lat: s.lat, lng: s.lon + 8, altitude: 0.9 }, 1100);
    const nn = S.notizie.filter(n => (n.stretti || []).includes(id));
    schedaAperta = { iso: null, notizie: nn };
    const mappa = `https://www.marinetraffic.com/it/ais/embed/zoom:${s.zoom}/centery:${s.lat}/centerx:${s.lon}/maptype:4/shownames:false/mmsi:0/shipid:0/fleet:/fleet_id:/vtypes:/showmenu:false/remember:false`;
    apriCassetto(`<div class="testa"><div><span class="bollino ${s.stato}">${s.stato.toUpperCase()}</span><h2 style="margin-top:8px">${esc(s.nome)}</h2></div></div>
      <div class="blocco"><h4>PERCHÉ CONTA</h4><div class="prosa"><p>${esc(s.scheda)}</p></div>
        <div class="spiega"><span>notizie collegate in 7 giorni <b>${s.notizie7g}</b></span><span>di cui gravi <b>${s.gravi7g}</b></span></div></div>
      <div class="blocco"><h4>MERCI IN TRANSITO <span>stima indicativa</span></h4><div class="merci">${ciambella(s.merci)}<ul>${s.merci.map((m, i) => `<li><i style="background:${TAVOLOZZA[i % TAVOLOZZA.length]}"></i>${esc(m[0])}<b>${m[1]}%</b></li>`).join("")}</ul></div></div>
      <div class="blocco"><h4>TRAFFICO NAVALE IN DIRETTA <span>MarineTraffic</span></h4><iframe class="mappa-navi" src="${mappa}" loading="lazy" title="Navi in diretta"></iframe></div>
      <div class="blocco" style="padding-left:0;padding-right:0"><h4 style="padding:0 18px">NOTIZIE COLLEGATE <span>${nn.length} in 72 ore</span></h4>
        ${nn.length ? nn.map(n => voceHtml(n, true)).join("") : `<div class="prosa" style="padding:0 18px">Nessuna notizia recente su questa rotta.</div>`}</div>`);
  }

  // ------------------------------------------------------------ viste
  let vistaAttiva = "mappa";
  function mostraVista(v) {
    vistaAttiva = v;
    $$("#schede button").forEach(b => b.classList.toggle("attiva", b.dataset.vista === v));
    $$(".vista").forEach(el => (el.hidden = el.id !== "vista-" + v));
    if (v !== "mappa") chiudiCassetto();
    vistaCorrente();
  }
  $("#schede").addEventListener("click", e => { const b = e.target.closest("button"); if (b) mostraVista(b.dataset.vista); });
  function vistaCorrente() { if (!S) return; if (vistaAttiva === "flusso") vistaFlusso(); if (vistaAttiva === "rapporto") vistaRapporto(); if (vistaAttiva === "stretti") vistaStretti(); }

  function vistaFlusso() {
    const tipi = ["tutte", "gravi", ...Object.keys(S.etichette)];
    const nn = S.notizie.filter(n => filtroFlusso === "tutte" || (filtroFlusso === "gravi" ? n.grav === "alta" : n.tipo === filtroFlusso));
    $("#vista-flusso").innerHTML = `<h1>FLUSSO NOTIZIE<small>${S.notizie.length} notizie di politica estera nelle ultime 72 ore, da ${Object.keys(S.fonti).length} testate italiane. Clic su una notizia: si apre la scheda del paese.</small></h1>
      <div class="filtri">${tipi.map(t => `<button data-f="${t}" class="${t === filtroFlusso ? "attivo" : ""}">${t === "tutte" ? "TUTTE" : t === "gravi" ? "SOLO GRAVI" : S.etichette[t]}</button>`).join("")}</div>
      <div class="griglia-flusso">${nn.map(n => voceHtml(n, true)).join("")}</div>`;
  }
  $("#vista-flusso").addEventListener("click", e => { const b = e.target.closest("button[data-f]"); if (b) { filtroFlusso = b.dataset.f; vistaFlusso(); } });

  function vistaRapporto() {
    const r = S.rapporto, oggi = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const alti = Object.values(S.paesi).filter(p => p.liv === "alto").length;
    const maxTema = Math.max(1, ...Object.values(r.temi));
    $("#vista-rapporto").innerHTML = `<h1>RAPPORTO DEL GIORNO<small>${oggi} · generato in automatico dalle notizie raccolte nelle ultime 24 ore</small></h1>
      <div class="cifre"><div><b>${r.totale24}</b><span>NOTIZIE IN 24 ORE</span></div><div><b style="color:var(--rosso)">${r.gravi24}</b><span>SU ATTACCHI ARMATI</span></div>
        <div><b>${alti}</b><span>PAESI AD ALTO RISCHIO</span></div><div><b>${S.stretti.filter(s => s.stato !== "regolare").length}</b><span>ROTTE SOTTO PRESSIONE</span></div></div>
      <div class="due"><div><div class="sez">I FRONTI PIÙ CALDI DELLE ULTIME 24 ORE</div>
        ${r.caldi.map((c, i) => `<div class="caldo" data-iso="${c.iso}"><div class="pos">${String(i + 1).padStart(2, "0")}</div><h5>${esc(S.paesi[c.iso].nome)}<span>indice ${S.paesi[c.iso].ind} · ${c.n} notizie${c.alta ? ` · ${c.alta} gravi` : ""}</span></h5><ul>${c.titoli.map(t => `<li>${esc(t.t)}</li>`).join("")}</ul></div>`).join("") || "<p class='prosa'>Ancora poche notizie: riprova tra qualche minuto.</p>"}
      </div><div>
        <div class="sez">DI COSA SI PARLA</div><div class="barre">${Object.entries(r.temi).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div><span>${S.etichette[k]}</span><i style="width:${(v / maxTema) * 100}%"></i><b>${v}</b></div>`).join("")}</div>
        <div class="sez">INDICI CHE SI MUOVONO DA IERI</div>${r.movimenti.length ? r.movimenti.map(m => `<div class="mov" data-iso="${m.iso}">${esc(S.paesi[m.iso].nome)}<span class="${m.delta > 0 ? "giu" : "su"}">${m.delta > 0 ? "▲ +" : "▼ "}${m.delta} → ${m.ind}</span></div>`).join("") : `<p class="prosa" style="font-size:12.5px">Il confronto con ieri parte dal secondo giorno di utilizzo: il radar salva una fotografia degli indici ogni giorno.</p>`}
        <div class="sez">MERCATI SENSIBILI</div>${S.mercati.map(m => `<div class="mov" style="cursor:default">${esc(m.nome)}<span>${num(m.prezzo, m.prezzo < 10 ? 4 : 2)} <span class="${m.var >= 0 ? "su" : "giu"}">${m.var >= 0 ? "+" : ""}${num(m.var)}%</span></span></div>`).join("")}
        <div class="sez">FONTI</div><div class="fonti">${Object.entries(S.fonti).map(([k, f]) => `<span class="${f.ok ? "" : "ko"}" title="${esc(f.errore || "")}">${esc(k)} ${f.ok ? "· " + f.voci : "· non risponde"}</span>`).join("")}</div>
      </div></div>`;
  }
  $("#vista-rapporto").addEventListener("click", e => { const c = e.target.closest("[data-iso]"); if (c) { mostraVista("mappa"); apriPaese(c.dataset.iso); } });

  function vistaStretti() {
    $("#vista-stretti").innerHTML = `<h1>STRETTI E ROTTE MARITTIME<small>I passaggi obbligati del commercio mondiale. Lo stato dipende da quante notizie gravi li riguardano negli ultimi 7 giorni. Clic per navi in diretta e notizie.</small></h1>
      <div class="carte">${S.stretti.map(s => `<button class="carta" data-stretto="${s.id}"><h5>${esc(s.nome)}<span class="bollino ${s.stato}">${s.stato.toUpperCase()}</span></h5><p>${esc(s.scheda)}</p><footer>${s.notizie7g} notizie in 7 giorni · ${s.gravi7g} gravi</footer></button>`).join("")}</div>`;
  }
  $("#vista-stretti").addEventListener("click", e => { const c = e.target.closest("[data-stretto]"); if (c) apriStretto(c.dataset.stretto); });

  // ------------------------------------------------------------ ricerca
  const senzaAccenti = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  $("#cerca").addEventListener("input", e => {
    const q = senzaAccenti(e.target.value.trim()), box = $("#cercaEsiti");
    if (!q || !S) { box.hidden = true; return; }
    const esiti = Object.entries(S.paesi).filter(([, p]) => p.n && senzaAccenti(p.nome).includes(q)).sort((a, b) => senzaAccenti(a[1].nome).indexOf(q) - senzaAccenti(b[1].nome).indexOf(q) || b[1].ind - a[1].ind).slice(0, 8);
    box.innerHTML = esiti.map(([iso, p], i) => `<button data-iso="${iso}" class="${i ? "" : "primo"}">${esc(p.nome)}<span class="liv ${p.liv}">${p.ind}</span></button>`).join("") || `<button disabled>Nessun paese trovato</button>`;
    box.hidden = false;
  });
  $("#cerca").addEventListener("keydown", e => { if (e.key === "Enter") { const b = $("#cercaEsiti button[data-iso]"); if (b) b.click(); } });
  $("#cercaEsiti").addEventListener("click", e => { const b = e.target.closest("button[data-iso]"); if (!b) return; $("#cercaEsiti").hidden = true; $("#cerca").value = ""; mostraVista("mappa"); apriPaese(b.dataset.iso); });
  document.addEventListener("click", e => { if (!e.target.closest(".cerca")) $("#cercaEsiti").hidden = true; });

  // ------------------------------------------------------------ diretta tv
  let canale = "UC1mX9vuLOYf8fhaXS_KcDRg";
  const accendiTv = () => { $("#tv").innerHTML = `<iframe src="https://www.youtube.com/embed/live_stream?channel=${canale}&autoplay=1&mute=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Diretta TV"></iframe>`; };
  $("#tv").addEventListener("click", e => { if (e.target.id === "tvAvvia") accendiTv(); });
  $("#canali").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; $$("#canali button").forEach(x => x.classList.toggle("attivo", x === b)); canale = b.dataset.canale; accendiTv(); });

  aggiorna();
  setInterval(aggiorna, 60000);
})();
