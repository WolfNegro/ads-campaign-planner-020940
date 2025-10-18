/* app/static/js/builder.js
   Wizard de planificación de campañas (sin dependencias).
   - Maneja steps, estado, localStorage, UI dinámica de Conjuntos y Anuncios
   - Export JSON / CSV y panel de revisión
*/
(() => {
  // ---------- Utilidades DOM ----------
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const on = (el, ev, fn) => el.addEventListener(ev, fn, {passive:true});
  const ce = (t, cls) => { const n=document.createElement(t); if(cls) n.className=cls; return n; };

  const STORAGE_KEY = "builder.state.v1";

  // ---------- Formatos ----------
  const SYMBOL = { PEN: "S/ ", USD: "$ " };
  const sym = (code) => SYMBOL[code] || SYMBOL.USD;

  const money = (v, currency) => {
    if (isNaN(v) || v === null || v === undefined) return "-";
    return sym(currency) + Number(v).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  };

  const csvEscape = (v) => {
    const s = (v ?? "").toString();
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const downloadText = (filename, text) => {
    const blob = new Blob([text], {type: "text/plain;charset=utf-8"});
    const url  = URL.createObjectURL(blob);
    const a = ce("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  };

  // ---------- Estado ----------
  const defaultState = () => ({
    campaign: {
      client: "",
      name: "",
      objective: "MESSAGES",
      buyingType: "ABO",      // ABO | CBO
      budget: "",            // solo si CBO
      currency: "PEN",
      dateStart: "",
      dateEnd: "",
      ongoing: false,
      platforms: ["FACEBOOK","INSTAGRAM"],
      placements: [], // lista de strings (Feed, Stories, etc)
      advPlacements: false,
      advAudience: false,
      advCreative: false,
    },
    adsets: [
      // { id, name, budget, ageMin, ageMax, genders:[], locations:"PE;Lima", radius:0, interests:["Dermatología"], advAudience:false, placementsOverride:[] }
    ],
    ads: [
      // { id, adsetId, usePostId, postId, name, destination, utm:{source,medium,campaign,content}, copies:[], headlines:[], descriptions:[], ctas:"LEARN_MORE" }
    ],
  });

  const state = loadState();

  function loadState() {
    try {
      const j = localStorage.getItem(STORAGE_KEY);
      if (!j) return defaultState();
      const parsed = JSON.parse(j);
      // sanity
      if (!parsed.campaign || !Array.isArray(parsed.adsets) || !Array.isArray(parsed.ads)) return defaultState();
      return parsed;
    } catch {
      return defaultState();
    }
  }

  const saveState = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  // ---------- Stepper ----------
  const stepButtons = $$(".steps .step");
  const panes = $$(".step-pane");
  function goStep(n) {
    stepButtons.forEach(b => b.classList.toggle("is-active", b.dataset.step === String(n)));
    panes.forEach(p => p.classList.toggle("is-active", p.dataset.pane === String(n)));
    if (n === 4) renderReview();
  }
  stepButtons.forEach(b => on(b, "click", () => goStep(b.dataset.step)));
  $$("#builder-root .next").forEach(b => on(b, "click", () => goStep(b.dataset.next)));
  $$("#builder-root [data-prev]").forEach(b => on(b, "click", () => goStep(b.dataset.prev)));

  // ---------- Form campaña (Step 1) ----------
  const el = {
    client: $("#cmp-client"),
    name: $("#cmp-name"),
    objective: $("#cmp-objective"),
    buyABO: $('[data-cmp-buy="ABO"]'),
    buyCBO: $('[data-cmp-buy="CBO"]'),
    budget: $("#cmp-budget"),
    currency: $("#cmp-currency"),
    dateStart: $("#cmp-date-start"),
    dateEnd: $("#cmp-date-end"),
    ongoing: $("#cmp-ongoing"),
    platforms: $$('[data-cmp-platform]'),
    placementsWrap: $("#cmp-placements"),
    advPlacements: $("#cmp-adv-placements"),
    advAudience: $("#cmp-adv-audience"),
    advCreative: $("#cmp-adv-creative"),
  };

  // render opciones de placements
  const ALL_PLACEMENTS = [
    "Feed", "Stories", "Reels", "Marketplace",
    "Right column", "In-stream video", "Search results",
    "Explorar Instagram", "Reels Overlay", "Artículos instantáneos"
  ];
  function renderPlacementChips() {
    el.placementsWrap.innerHTML = "";
    ALL_PLACEMENTS.forEach(p => {
      const lab = ce("label", "chip-check");
      const cb  = ce("input");
      cb.type = "checkbox";
      cb.value = p;
      cb.checked = state.campaign.placements.includes(p);
      on(cb, "change", () => {
        const arr = state.campaign.placements;
        if (cb.checked) { if (!arr.includes(p)) arr.push(p); }
        else state.campaign.placements = arr.filter(x => x !== p);
        saveState();
      });
      lab.appendChild(cb);
      lab.append(" " + p);
      el.placementsWrap.appendChild(lab);
    });
  }

  // binding inicial
  function bindCampaign() {
    const c = state.campaign;
    el.client.value = c.client;
    el.name.value = c.name;
    el.objective.value = c.objective;
    el.currency.value = c.currency;
    el.dateStart.value = c.dateStart || "";
    el.dateEnd.value = c.dateEnd || "";
    el.ongoing.checked = !!c.ongoing;
    el.budget.value = c.budget || "";

    const setBuy = (t) => {
      state.campaign.buyingType = t;
      el.buyABO.classList.toggle("is-active", t === "ABO");
      el.buyCBO.classList.toggle("is-active", t === "CBO");
      // mostrar/ocultar fila de presupuesto CBO
      $$('[data-show-if="CBO"]').forEach(n => n.style.display = (t === "CBO" ? "" : "none"));
      saveState();
    };
    setBuy(c.buyingType);

    on(el.buyABO, "click", () => setBuy("ABO"));
    on(el.buyCBO, "click", () => setBuy("CBO"));

    [ ["client","value"], ["name","value"], ["objective","value"], ["currency","value"],
      ["dateStart","value"], ["dateEnd","value"], ["budget","value"],
    ].forEach(([k, prop]) => on(el[k], "input", () => { c[k] = el[k][prop]; saveState(); renderReviewIf(); }));

    on(el.ongoing, "change", () => {
      c.ongoing = el.ongoing.checked;
      if (c.ongoing) { el.dateEnd.value = ""; c.dateEnd = ""; }
      saveState(); renderReviewIf();
    });

    el.platforms.forEach(cb => {
      cb.checked = c.platforms.includes(cb.value);
      on(cb, "change", () => {
        const arr = c.platforms;
        if (cb.checked) { if (!arr.includes(cb.value)) arr.push(cb.value); }
        else c.platforms = arr.filter(x => x !== cb.value);
        saveState(); renderReviewIf();
      });
    });

    [ ["advPlacements"], ["advAudience"], ["advCreative"] ].forEach(([k]) => {
      el[k].checked = !!c[k];
      on(el[k], "change", () => { c[k] = el[k].checked; saveState(); renderReviewIf(); });
    });

    renderPlacementChips();
  }

  // ---------- Conjuntos (Step 2) ----------
  const adsetsList = $("#adsets-list");
  const btnAddAdset = $("#btn-add-adset");

  const newId = () => Math.random().toString(36).slice(2,9);

  function addAdset() {
    const s = state.campaign;
    const i = {
      id: newId(),
      name: `Conjunto ${state.adsets.length+1}`,
      budget: s.buyingType === "ABO" ? "" : "", // si ABO podrá llenarlo
      ageMin: 18,
      ageMax: 55,
      genders: ["ALL"], // ALL | M | F
      locations: "PE; Lima",
      radius: 0,
      interests: [],
      advAudience: false,
      placementsOverride: [],
      notes: ""
    };
    state.adsets.push(i);
    saveState();
    renderAdsets();
    refreshAdsetSelector();
  }

  function removeAdset(id) {
    state.adsets = state.adsets.filter(a => a.id !== id);
    // borrar ads relacionados
    state.ads = state.ads.filter(ad => ad.adsetId !== id);
    saveState();
    renderAdsets();
    renderAds();
    refreshAdsetSelector();
    renderReviewIf();
  }

  function renderAdsets() {
    adsetsList.innerHTML = "";
    const isABO = state.campaign.buyingType === "ABO";

    if (!state.adsets.length) {
      const empty = ce("div","muted"); empty.textContent = "Sin conjuntos aún. Agrega uno para empezar.";
      adsetsList.appendChild(empty);
      return;
    }

    state.adsets.forEach(adset => {
      const card = ce("div","adset-card review-card");
      card.dataset.adsetId = adset.id;

      // Header
      const head = ce("div","hstack");
      const title = ce("input");
      title.type="text"; title.value = adset.name; title.className="input-like";
      title.placeholder="Nombre del conjunto";
      on(title,"input",()=>{ adset.name=title.value; saveState(); refreshAdsetSelector(); renderReviewIf(); });

      const del = ce("button","btn ghost");
      del.textContent = "Eliminar";
      on(del,"click",()=> removeAdset(adset.id));

      head.append(title, del);
      card.append(head);

      // Grid body
      const g = ce("div","grid");
      // Presupuesto (solo ABO)
      const rBudget = ce("div","row");
      rBudget.style.display = isABO ? "" : "none";
      rBudget.innerHTML = `
        <label>Presupuesto diario</label>
        <input type="number" step="0.01" min="0" placeholder="Ej: 20" value="${adset.budget||""}">
      `;
      const rBudgetInput = $("input", rBudget);
      on(rBudgetInput,"input",()=>{ adset.budget=rBudgetInput.value; saveState(); renderReviewIf(); });

      // Segmentación básica
      const rAge = ce("div","row"); rAge.innerHTML = `
        <label>Edad</label>
        <div class="hstack">
          <input type="number" min="13" max="65" value="${adset.ageMin}">
          <span>a</span>
          <input type="number" min="13" max="65" value="${adset.ageMax}">
        </div>`;
      const [ageMin, , ageMax] = $$("input", rAge);
      on(ageMin,"input",()=>{ adset.ageMin=Number(ageMin.value||18); saveState(); renderReviewIf(); });
      on(ageMax,"input",()=>{ adset.ageMax=Number(ageMax.value||55); saveState(); renderReviewIf(); });

      const rGender = ce("div","row"); rGender.innerHTML = `
        <label>Sexo</label>
        <div class="chips">
          <label class="chip-check"><input type="radio" name="g-${adset.id}" value="ALL" ${adset.genders.includes("ALL")?"checked":""}> Todos</label>
          <label class="chip-check"><input type="radio" name="g-${adset.id}" value="M" ${adset.genders.includes("M")?"checked":""}> Hombres</label>
          <label class="chip-check"><input type="radio" name="g-${adset.id}" value="F" ${adset.genders.includes("F")?"checked":""}> Mujeres</label>
        </div>`;
      $$(`input[name="g-${adset.id}"]`, rGender).forEach(r=>{
        on(r,"change",()=>{ adset.genders=[r.value]; saveState(); renderReviewIf(); });
      });

      const rLoc = ce("div","row"); rLoc.innerHTML = `
        <label>Ubicaciones geográficas</label>
        <input type="text" placeholder="País; Ciudad; (separar con ;)" value="${adset.locations}">
        <small class="muted">Ej: PE; Lima; Callao</small>
      `;
      const rLocInput = $("input", rLoc);
      on(rLocInput,"input",()=>{ adset.locations=rLocInput.value; saveState(); renderReviewIf(); });

      const rInterests = ce("div","row"); rInterests.innerHTML = `
        <label>Intereses (separar con coma)</label>
        <input type="text" placeholder="Dermatología, Cuidado de la piel" value="${adset.interests.join(", ")}">
      `;
      const rIntInput = $("input", rInterests);
      on(rIntInput,"input",()=>{
        adset.interests = rIntInput.value.split(",").map(s=>s.trim()).filter(Boolean);
        saveState(); renderReviewIf();
      });

      const rAdv = ce("div","row"); rAdv.innerHTML = `
        <label>IA / Audiencia Advantage+</label>
        <label class="chip-check"><input type="checkbox" ${adset.advAudience?"checked":""}> Permitir ampliación</label>
      `;
      const rAdvCb = $("input", rAdv);
      on(rAdvCb,"change",()=>{ adset.advAudience = rAdvCb.checked; saveState(); renderReviewIf(); });

      const rNotes = ce("div","row"); rNotes.innerHTML = `
        <label>Notas</label>
        <input type="text" placeholder="Observaciones del conjunto" value="${adset.notes||""}">
      `;
      on($("input", rNotes),"input", e=>{ adset.notes = e.target.value; saveState(); renderReviewIf(); });

      g.append(rBudget, rAge, rGender, rLoc, rInterests, rAdv, rNotes);
      card.append(g);
      adsetsList.append(card);
    });
  }
  on(btnAddAdset,"click", addAdset);

  // ---------- Anuncios (Step 3) ----------
  const adsTargetAdset = $("#ads-target-adset");
  const adsList = $("#ads-list");
  const btnAddAd = $("#btn-add-ad");

  function refreshAdsetSelector() {
    // para dropdown de step 3
    adsTargetAdset.innerHTML = "";
    state.adsets.forEach(a => {
      const opt = ce("option");
      opt.value = a.id; opt.textContent = a.name;
      adsTargetAdset.appendChild(opt);
    });
  }

  function addAd() {
    if (!state.adsets.length) { alert("Primero crea un conjunto."); return; }
    const ad = {
      id: newId(),
      adsetId: adsTargetAdset.value || state.adsets[0].id,
      usePostId: false,
      postId: "",
      name: `Anuncio ${state.ads.length+1}`,
      ctas: "LEARN_MORE",
      destination: "",
      utm: { source:"fb", medium:"cpc", campaign:"", content:"" },
      copies: [""],
      headlines: [""],
      descriptions: [""],
    };
    state.ads.push(ad);
    saveState();
    renderAds();
    renderReviewIf();
  }
  on(btnAddAd,"click", addAd);

  function removeAd(id) {
    state.ads = state.ads.filter(a => a.id !== id);
    saveState();
    renderAds();
    renderReviewIf();
  }

  function renderAds() {
    adsList.innerHTML = "";
    if (!state.adsets.length) {
      adsList.innerHTML = `<div class="muted">Crea al menos un conjunto para añadir anuncios.</div>`;
      return;
    }
    if (!state.ads.length) {
      const empty = ce("div","muted"); empty.textContent = "Sin anuncios todavía.";
      adsList.appendChild(empty);
      return;
    }

    state.ads.forEach(ad => {
      const card = ce("div","ad-card review-card"); card.dataset.adId = ad.id;

      const head = ce("div","hstack");
      const title = ce("input"); title.type="text"; title.className="input-like"; title.placeholder="Nombre del anuncio"; title.value = ad.name;
      on(title,"input",()=>{ ad.name=title.value; saveState(); renderReviewIf(); });

      const del = ce("button","btn ghost"); del.textContent="Eliminar";
      on(del,"click",()=> removeAd(ad.id));

      head.append(title, del);
      card.append(head);

      // Grid
      const g = ce("div","grid");

      // Conjunto destino
      const rSet = ce("div","row");
      rSet.innerHTML = `<label>Conjunto</label>`;
      const sel = ce("select");
      state.adsets.forEach(a => {
        const o=ce("option"); o.value=a.id; o.textContent=a.name; if(a.id===ad.adsetId) o.selected=true; sel.appendChild(o);
      });
      on(sel,"change",()=>{ ad.adsetId=sel.value; saveState(); renderReviewIf(); });
      rSet.appendChild(sel);

      // Toggle ID
      const rToggle = ce("div","row");
      rToggle.innerHTML = `
        <label>Fuente</label>
        <div class="chips"><label class="chip-check"><input type="checkbox" ${ad.usePostId?"checked":""}> Usar Post ID</label></div>
      `;
      const cbId = $("input", rToggle);
      on(cbId,"change",()=>{ ad.usePostId = cbId.checked; saveState(); renderAds(); renderReviewIf(); });

      g.append(rSet, rToggle);

      if (ad.usePostId) {
        const rPid = ce("div","row");
        rPid.innerHTML = `<label>Post ID</label><input type="text" placeholder="XXXXXXXXXXXX" value="${ad.postId||""}">`;
        on($("input", rPid),"input", e=>{ ad.postId = e.target.value; saveState(); renderReviewIf(); });
        g.append(rPid);
      } else {
        // CTA & Destino
        const rCta = ce("div","row");
        rCta.innerHTML = `
          <label>CTA</label>
          <select>
            ${["LEARN_MORE","SIGN_UP","GET_QUOTE","BOOK_NOW","CONTACT_US","SEND_WHATSAPP_MESSAGE"].map(cta => `<option value="${cta}" ${ad.ctas===cta?"selected":""}>${cta}</option>`).join("")}
          </select>`;
        on($("select", rCta),"change", e=>{ ad.ctas = e.target.value; saveState(); renderReviewIf(); });

        const rDest = ce("div","row");
        rDest.innerHTML = `<label>Destino (URL)</label><input type="url" placeholder="https://tudominio.com/landing" value="${ad.destination||""}">`;
        on($("input", rDest),"input", e=>{ ad.destination = e.target.value; saveState(); renderReviewIf(); });

        // UTM
        const rUtm = ce("div","row");
        rUtm.innerHTML = `
          <label>UTMs</label>
          <div class="grid">
            <div class="row"><label>utm_source</label><input type="text" value="${ad.utm.source||""}"></div>
            <div class="row"><label>utm_medium</label><input type="text" value="${ad.utm.medium||""}"></div>
            <div class="row"><label>utm_campaign</label><input type="text" value="${ad.utm.campaign||""}"></div>
            <div class="row"><label>utm_content</label><input type="text" value="${ad.utm.content||""}"></div>
          </div>
          <small class="muted">Se añadirá a la URL final al exportar.</small>
        `;
        const [u1,u2,u3,u4] = $$(".row input", rUtm);
        on(u1,"input",()=>{ ad.utm.source=u1.value; saveState(); });
        on(u2,"input",()=>{ ad.utm.medium=u2.value; saveState(); });
        on(u3,"input",()=>{ ad.utm.campaign=u3.value; saveState(); });
        on(u4,"input",()=>{ ad.utm.content=u4.value; saveState(); });

        // Variaciones
        const rVar = ce("div","row");
        rVar.innerHTML = `<label>Variaciones</label>`;
        const varWrap = ce("div","stack gap-12");

        const makeVarBlock = (label, arr, key) => {
          const block = ce("div","review-card");
          const h = ce("div","hstack"); const ttl=ce("strong"); ttl.textContent = label; h.appendChild(ttl);

          const add = ce("button","btn ghost"); add.textContent = "+ agregar";
          on(add,"click",()=>{ arr.push(""); saveState(); renderAds(); });
          h.appendChild(add);
          block.appendChild(h);

          arr.forEach((val, idx) => {
            const row = ce("div","hstack");
            const inp = ce("input"); inp.type="text"; inp.value=val; inp.placeholder = `${label} #${idx+1}`;
            on(inp,"input",()=>{ arr[idx]=inp.value; saveState(); });
            const rm = ce("button","btn ghost"); rm.textContent="– quitar";
            on(rm,"click",()=>{ arr.splice(idx,1); saveState(); renderAds(); });
            row.append(inp, rm);
            block.appendChild(row);
          });

          return block;
        };

        varWrap.append(
          makeVarBlock("Copy", ad.copies, "copies"),
          makeVarBlock("Título", ad.headlines, "headlines"),
          makeVarBlock("Descripción", ad.descriptions, "descriptions"),
        );

        rVar.appendChild(varWrap);

        g.append(rCta, rDest, rUtm, rVar);
      }

      card.append(g);
      adsList.append(card);
    });
  }

  // ---------- Revisión & Export (Step 4) ----------
  const rCampaign = $("#review-campaign");
  const rAdsets   = $("#review-adsets");
  const rAds      = $("#review-ads");
  const btnSave   = $("#btn-save-draft");
  const btnJson   = $("#btn-export-json");
  const btnCsv    = $("#btn-export-csv");
  const btnPdf    = $("#btn-export-pdf");

  function renderReview() {
    rCampaign.textContent = JSON.stringify(state.campaign, null, 2);
    rAdsets.textContent   = JSON.stringify(state.adsets,   null, 2);
    rAds.textContent      = JSON.stringify(state.ads,      null, 2);
  }
  const renderReviewIf = () => { if ($('.step-pane.is-active[data-pane="4"]')) renderReview(); };

  on(btnSave, "click", () => {
    saveState();
    alert("Borrador guardado en este navegador.");
  });

  on(btnJson, "click", () => {
    const payload = JSON.stringify(state, null, 2);
    downloadText("campaign-builder.json", payload);
  });

  on(btnCsv, "click", () => {
    // Export simple: 3 CSVs concatenados con separador visual
    const c = state.campaign;
    const adsets = state.adsets;
    const ads = state.ads;

    // Campaign CSV
    const cHeaders = ["client","name","objective","buyingType","budget","currency","dateStart","dateEnd","ongoing","platforms","placements","advPlacements","advAudience","advCreative"];
    const cRow = [c.client,c.name,c.objective,c.buyingType,c.budget,c.currency,c.dateStart,c.dateEnd,c.ongoing, c.platforms.join("|"), c.placements.join("|"), c.advPlacements, c.advAudience, c.advCreative]
      .map(csvEscape).join(",");
    const csvCampaign = cHeaders.join(",") + "\n" + cRow;

    // Adsets CSV
    const aHeaders = ["id","name","budget","ageMin","ageMax","genders","locations","radius","interests","advAudience","notes"];
    const csvAdsets = [aHeaders.join(",")].concat(
      adsets.map(a => [
        a.id, a.name, a.budget, a.ageMin, a.ageMax, a.genders.join("|"),
        a.locations, a.radius, a.interests.join("|"), a.advAudience, a.notes || ""
      ].map(csvEscape).join(","))
    ).join("\n");

    // Ads CSV
    const dHeaders = ["id","adsetId","usePostId","postId","name","ctas","destination","utm_source","utm_medium","utm_campaign","utm_content","copies","headlines","descriptions"];
    const csvAds = [dHeaders.join(",")].concat(
      ads.map(d => [
        d.id, d.adsetId, d.usePostId, d.postId, d.name, d.ctas || "",
        d.destination || "",
        d.utm?.source || "", d.utm?.medium || "", d.utm?.campaign || "", d.utm?.content || "",
        (d.copies||[]).join("|"), (d.headlines||[]).join("|"), (d.descriptions||[]).join("|")
      ].map(csvEscape).join(","))
    ).join("\n");

    const full = [
      "### campaign.csv",
      csvCampaign,
      "",
      "### adsets.csv",
      csvAdsets,
      "",
      "### ads.csv",
      csvAds
    ].join("\n");

    downloadText("campaign-export.csv.txt", full);
  });

  on(btnPdf, "click", () => {
    // Prototipo: abre ventana con contenido imprimible
    const w = window.open("", "_blank");
    const style = `
      <style>
        body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;margin:24px;}
        h2{margin:0 0 8px;}
        pre{background:#111827;color:#e5e7eb;padding:12px;border-radius:8px;white-space:pre-wrap;}
        .grid{display:grid;grid-template-columns:1fr;gap:12px}
        @media(min-width:1000px){.grid{grid-template-columns:1fr 1fr 1fr}}
      </style>
    `;
    w.document.write(`
      <html><head><title>Resumen de Campaña</title>${style}</head><body>
      <h2>Campaña</h2>
      <pre>${escapeHtml(JSON.stringify(state.campaign, null, 2))}</pre>
      <h2>Conjuntos</h2>
      <pre>${escapeHtml(JSON.stringify(state.adsets, null, 2))}</pre>
      <h2>Anuncios</h2>
      <pre>${escapeHtml(JSON.stringify(state.ads, null, 2))}</pre>
      </body></html>
    `);
    w.document.close();
    w.focus();
  });

  const escapeHtml = (s) => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  // ---------- Bootstrap ----------
  bindCampaign();
  renderAdsets();
  refreshAdsetSelector();
  renderAds();

  // Exponer por si quieres inspeccionar en consola
  window.__BUILDER__ = { state, saveState, goStep, money };

})();
