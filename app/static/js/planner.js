/* =========================================================
   planner.js — Lógica del Asistente de Campañas (Flask)
   Estructura compatible con app/templates/plan.html
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  // --------- Cache de nodos globales ---------
  const navSteps = document.querySelectorAll('.step');
  const stepSections = document.querySelectorAll('.step-content');

  const sinFinCheckbox = document.getElementById('sin-fin');
  const fechaFinInput  = document.getElementById('fecha-fin');

  const setsContainer = document.getElementById('sets-container');
  const adsContainer  = document.getElementById('ads-container');

  const summaryBox    = document.getElementById('summary-container');

  // Simulación / Export
  const simBudgetInp  = document.getElementById('sim-budget');
  const simCpaInp     = document.getElementById('sim-cpa');
  const simDaysInp    = document.getElementById('sim-days');
  const phasesEditor  = document.getElementById('phases-editor');
  const addPhaseBtn   = document.getElementById('add-phase');
  const simulateBtn   = document.getElementById('simulate-btn');
  const exportJsonBtn = document.getElementById('export-json-btn');
  const exportCsvBtn  = document.getElementById('export-csv-btn');
  const simStatus     = document.getElementById('simulate-status');

  // Toolbar estructura (ya viene en el HTML)
  const btnStructCsv  = document.getElementById('export-structure-csv');
  const btnStructJson = document.getElementById('export-structure-json');
  const btnStructPrev = document.getElementById('preview-structure');

  // Contadores para IDs amigables
  let setCount = 0;
  let adCount  = 0;

  // --------- Navegación entre pasos ---------
  function switchStep(stepId) {
    navSteps.forEach(btn => btn.classList.toggle('active', btn.dataset.step === stepId));
    stepSections.forEach(sec => sec.classList.toggle('active', sec.id === `step-${stepId}`));
  }

  navSteps.forEach(btn => btn.addEventListener('click', () => switchStep(btn.dataset.step)));
  document.querySelectorAll('.next-step').forEach(btn => {
    btn.addEventListener('click', () => switchStep(btn.dataset.next));
  });
  document.querySelectorAll('.prev-step').forEach(btn => {
    btn.addEventListener('click', () => switchStep(btn.dataset.prev));
  });

  // --------- Fecha fin (sin fin) ---------
  if (sinFinCheckbox && fechaFinInput) {
    const toggleEnd = () => {
      const disabled = sinFinCheckbox.checked;
      fechaFinInput.disabled = disabled;
      if (disabled) fechaFinInput.value = '';
    };
    sinFinCheckbox.addEventListener('change', toggleEnd);
    toggleEnd();
  }

  // --------- Utilidades ---------
  function updateConjuntoOptions() {
    const setCards = setsContainer.querySelectorAll('.ad-card');
    const sets = Array.from(setCards).map((card, i) => {
      const name = card.querySelector('.set-name-input')?.value?.trim() || `Conjunto ${i + 1}`;
      return { id: `set-${i + 1}`, label: name };
    });

    const selects = adsContainer.querySelectorAll('.conjunto-select');
    selects.forEach(select => {
      const current = select.value;
      select.innerHTML = '';
      sets.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.label;
        select.appendChild(opt);
      });
      if (sets.some(s => s.id === current)) select.value = current;
    });
  }

  function generateVariationHTML(index) {
    return `
      <div class="variation-group" data-variation-index="${index}">
        <div class="variation-header">
          <span>Variación #${index}</span>
          <button class="remove-variation" type="button">Eliminar</button>
        </div>
        <div class="variation-fields">
          <input type="text" placeholder="Copy #${index}">
          <input type="text" placeholder="Título #${index}">
          <input type="text" placeholder="Descripción #${index}">
        </div>
      </div>
    `;
  }

  function reindexVariations(card) {
    const groups = card.querySelectorAll('.variation-group');
    groups.forEach((g, i) => {
      g.dataset.variationIndex = i + 1;
      const header = g.querySelector('.variation-header span');
      if (header) header.textContent = `Variación #${i + 1}`;
      const inputs = g.querySelectorAll('.variation-fields input');
      if (inputs.length === 3) {
        inputs[0].placeholder = `Copy #${i + 1}`;
        inputs[1].placeholder = `Título #${i + 1}`;
        inputs[2].placeholder = `Descripción #${i + 1}`;
      }
    });
  }

  function attachRemoveVariationHandlers(card) {
    card.querySelectorAll('.remove-variation').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.variation-group');
        if (!group) return;
        group.remove();
        reindexVariations(card);
      });
    });
  }

  // --------- Conjuntos (Ad Sets) ---------
  function createSetCard(index) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ad-card';
    wrapper.dataset.setId = `set-${index}`;

    wrapper.innerHTML = `
      <button class="remove-ad" title="Eliminar conjunto">Eliminar</button>
      <div class="ad-form-row">
        <div class="ad-form-group">
          <label>Nombre del conjunto</label>
          <input type="text" class="set-name-input" placeholder="Conjunto ${index}" value="Conjunto ${index}">
        </div>
        <div class="ad-form-group">
          <label>Presupuesto</label>
          <input type="text" class="set-budget-input" placeholder="Presupuesto (PEN)">
        </div>
      </div>
    `;
    return wrapper;
  }

  function addSet() {
    setCount += 1;
    const card = createSetCard(setCount);
    setsContainer.appendChild(card);

    card.querySelector('.remove-ad').addEventListener('click', () => {
      card.remove();
      const cards = setsContainer.querySelectorAll('.ad-card');
      setCount = cards.length;
      cards.forEach((c, i) => {
        c.dataset.setId = `set-${i + 1}`;
        const input = c.querySelector('.set-name-input');
        if (input && !input.dataset.userEdited) input.value = `Conjunto ${i + 1}`;
      });
      updateConjuntoOptions();
    });

    const nameInput = card.querySelector('.set-name-input');
    nameInput.addEventListener('input', () => {
      nameInput.dataset.userEdited = 'true';
      updateConjuntoOptions();
    });

    updateConjuntoOptions();
  }

  // --------- Anuncios (Ads) ---------
  function createAdCard(index) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ad-card';
    wrapper.dataset.adId = `ad-${index}`;

    wrapper.innerHTML = `
      <button class="remove-ad" title="Eliminar anuncio">Eliminar</button>

      <div class="ad-form-row">
        <div class="ad-form-group">
          <label>Conjunto</label>
          <select class="conjunto-select"></select>
        </div>
        <div class="ad-form-group">
          <label>Fuente (ID de publicación)</label>
          <input type="text" class="source-input" placeholder="ID o dejar en blanco">
        </div>
        <div class="ad-form-group">
          <label>CTA</label>
          <select class="cta-select">
            <option value="LEARN_MORE">LEARN_MORE</option>
            <option value="SIGN_UP">SIGN_UP</option>
            <option value="BOOK_NOW">BOOK_NOW</option>
            <option value="SHOP_NOW">SHOP_NOW</option>
            <option value="CONTACT_US">CONTACT_US</option>
          </select>
        </div>
        <div class="ad-form-group">
          <label>Destino (URL)</label>
          <input type="text" class="url-input" placeholder="https://...">
        </div>
      </div>

      <div class="ad-form-row">
        <div class="ad-form-group">
          <label>utm_source</label>
          <input type="text" class="utm-input utm-source" placeholder="ej. fb">
        </div>
        <div class="ad-form-group">
          <label>utm_medium</label>
          <input type="text" class="utm-input utm-medium" placeholder="ej. cpc">
        </div>
        <div class="ad-form-group">
          <label>utm_campaign</label>
          <input type="text" class="utm-input utm-campaign" placeholder="campaña">
        </div>
        <div class="ad-form-group">
          <label>utm_content</label>
          <input type="text" class="utm-input utm-content" placeholder="contenido">
        </div>
      </div>

      <div class="variations">
        ${generateVariationHTML(1)}
      </div>
      <button class="primary-btn add-variation" type="button">+ Agregar variación</button>
    `;

    return wrapper;
  }

  function addAd() {
    adCount += 1;
    const card = createAdCard(adCount);
    adsContainer.appendChild(card);

    updateConjuntoOptions();

    card.querySelector('.remove-ad').addEventListener('click', () => {
      card.remove();
    });

    const addVarBtn = card.querySelector('.add-variation');
    const variationsContainer = card.querySelector('.variations');

    addVarBtn.addEventListener('click', () => {
      const total = variationsContainer.querySelectorAll('.variation-group').length + 1;
      const temp = document.createElement('div');
      temp.innerHTML = generateVariationHTML(total);
      const newGroup = temp.firstElementChild;
      variationsContainer.appendChild(newGroup);
      attachRemoveVariationHandlers(card);
      reindexVariations(card);
    });

    attachRemoveVariationHandlers(card);
  }

  // --------- Vínculos de botones ---------
  const addSetBtn = document.getElementById('add-set');
  if (addSetBtn) addSetBtn.addEventListener('click', addSet);

  const addAdBtn = document.getElementById('add-ad');
  if (addAdBtn) addAdBtn.addEventListener('click', addAd);

  // --------- Exportación / Resumen visual ---------
  function buildSummary() {
    const getVal = id => document.getElementById(id)?.value || '';
    const getRadio = name => (document.querySelector(`input[name="${name}"]:checked`)?.value || '').toUpperCase();

    const cliente   = getVal('cliente');
    const campana   = getVal('campana');
    const objetivo  = getVal('objetivo');
    const compra    = getRadio('compra');
    const fInicio   = getVal('fecha-inicio');
    const fFin      = sinFinCheckbox?.checked ? 'Sin fin' : (getVal('fecha-fin') || '—');

    const platforms = Array.from(document.querySelectorAll('.checkbox-chip-group input[type="checkbox"]'))
      .filter(i => i.checked).map(i => i.value);
    const placements = Array.from(document.querySelectorAll('.placements-grid input[type="checkbox"]'))
      .filter(i => i.checked).map(i => i.value);
    const advantage = Array.from(document.querySelectorAll('#advantage-placements, #expansion, #creative-optimization'))
      .filter(i => i.checked).map(i => i.id);

    const sets = Array.from(setsContainer.querySelectorAll('.ad-card')).map((c, i) => ({
      nombre: c.querySelector('.set-name-input')?.value?.trim() || `Conjunto ${i + 1}`,
      presupuesto: c.querySelector('.set-budget-input')?.value?.trim() || ''
    }));

    const ads = Array.from(adsContainer.querySelectorAll('.ad-card')).map((c, i) => {
      const select = c.querySelector('.conjunto-select');
      const conjuntoText = select?.options[select.selectedIndex]?.text || '—';
      const vars = Array.from(c.querySelectorAll('.variation-group')).map((v, idx) => {
        const inputs = v.querySelectorAll('.variation-fields input');
        return {
          index: idx + 1,
          copy: inputs[0]?.value || '',
          titulo: inputs[1]?.value || '',
          descripcion: inputs[2]?.value || ''
        };
      });
      return {
        nombre: `Anuncio ${i + 1}`,
        conjunto: conjuntoText,
        cta: c.querySelector('.cta-select')?.value || '',
        url: c.querySelector('.url-input')?.value || '',
        utm_source: c.querySelector('.utm-source')?.value || '',
        utm_medium: c.querySelector('.utm-medium')?.value || '',
        utm_campaign: c.querySelector('.utm-campaign')?.value || '',
        utm_content: c.querySelector('.utm-content')?.value || '',
        variaciones: vars
      };
    });

    return { cliente, campana, objetivo, compra, fInicio, fFin, platforms, placements, advantage, sets, ads };
  }

  function renderSummary(data) {
    if (!summaryBox) return;
    const htmlSets = data.sets.map(s =>
      `<li><strong>${s.nombre}</strong>${s.presupuesto ? ` — ${s.presupuesto}` : ''}</li>`
    ).join('');

    const htmlAds = data.ads.map((a, idx) => {
      const v = a.variaciones.map(vv => `
        <li>
          <em>Copy:</em> ${vv.copy || '—'}<br>
          <em>Título:</em> ${vv.titulo || '—'}<br>
          <em>Descripción:</em> ${vv.descripcion || '—'}
        </li>`).join('');
      return `
        <li>
          <strong>${a.nombre}</strong> — Conjunto: <em>${a.conjunto}</em> — CTA: ${a.cta}<br>
          URL: ${a.url || '—'}<br>
          UTM: ${a.utm_source || '—'} / ${a.utm_medium || '—'} / ${a.utm_campaign || '—'} / ${a.utm_content || '—'}
          <ul>${v}</ul>
        </li>`;
    }).join('');

    summaryBox.innerHTML = `
      <div class="summary">
        <p><strong>Cliente:</strong> ${data.cliente || '—'}</p>
        <p><strong>Campaña:</strong> ${data.campana || '—'}</p>
        <p><strong>Objetivo:</strong> ${data.objetivo || '—'} &nbsp;|&nbsp;
           <strong>Compra:</strong> ${data.compra || '—'}</p>
        <p><strong>Fechas:</strong> ${data.fInicio || '—'} → ${data.fFin || '—'}</p>
        <p><strong>Plataformas:</strong> ${data.platforms.join(', ') || '—'}</p>
        <p><strong>Ubicaciones:</strong> ${data.placements.join(', ') || '—'}</p>
        <hr style="border-color:#24314a">
        <p><strong>Conjuntos (${data.sets.length}):</strong></p>
        <ul>${htmlSets || '<li>—</li>'}</ul>
        <p><strong>Anuncios (${data.ads.length}):</strong></p>
        <ul>${htmlAds || '<li>—</li>'}</ul>
      </div>
    `;
  }

  // --------- Simulación (server) ---------
  function addPhaseRow(name = '', share = '', days = '') {
    const row = document.createElement('div');
    row.className = 'variation-group';
    row.innerHTML = `
      <div class="variation-header">
        <span>Fase</span>
        <button class="remove-variation" type="button">Eliminar</button>
      </div>
      <div class="variation-fields">
        <input type="text" class="phase-name" placeholder="Nombre (p.ej. Testing)" value="${name}">
        <input type="number" step="0.01" class="phase-share" placeholder="% presupuesto (ej. 0.2)" value="${share}">
        <input type="number" class="phase-days" placeholder="Días (opcional)" value="${days}">
      </div>
    `;
    phasesEditor.appendChild(row);
    row.querySelector('.remove-variation').addEventListener('click', () => row.remove());
  }

  function readPhases() {
    const rows = phasesEditor?.querySelectorAll('.variation-group') || [];
    return Array.from(rows).map(r => ({
      name:  r.querySelector('.phase-name')?.value?.trim(),
      share: parseFloat(r.querySelector('.phase-share')?.value || 0) || 0,
      days:  parseInt(r.querySelector('.phase-days')?.value || 0, 10) || 0
    })).filter(p => p.name);
  }

  async function simulate(payload) {
    simStatus.textContent = 'Simulando…';
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error en simulación');

      const box = document.createElement('div');
      box.className = 'summary-container';
      box.style.marginTop = '14px';

      const header = `
        <p><strong>Totales</strong> — Presupuesto: S/ ${data.totals.budget.toFixed(2)} ·
        CPA: S/ ${data.totals.cpa.toFixed(2)} · Leads: ${data.totals.leads} · Días: ${data.totals.days}</p>
      `;

      const rows = data.series.map(r => `
        <tr>
          <td>${r.day}</td>
          <td>${r.phase}</td>
          <td>S/ ${r.spend.toFixed(2)}</td>
          <td>${r.leads}</td>
        </tr>
      `).join('');

      box.innerHTML = `
        ${header}
        <div style="overflow:auto; max-height:320px; border:1px solid #24314a; border-radius:8px">
          <table style="width:100%; border-collapse:collapse; font-size:13px">
            <thead style="position:sticky; top:0; background:#101625">
              <tr>
                <th style="text-align:left; padding:8px; border-bottom:1px solid #24314a">Día</th>
                <th style="text-align:left; padding:8px; border-bottom:1px solid #24314a">Fase</th>
                <th style="text-align:left; padding:8px; border-bottom:1px solid #24314a">Inversión</th>
                <th style="text-align:left; padding:8px; border-bottom:1px solid #24314a">Resultados</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;

      summaryBox.appendChild(box);
      simStatus.textContent = 'OK';
    } catch (e) {
      simStatus.textContent = e.message || 'Error';
    }
  }

  // --------- Exportación de serie (backend) ---------
  async function exportPlan(format = 'json', payload = {}) {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...payload, format})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || 'Error al exportar');
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = (format === 'csv' ? 'plan.csv' : 'plan.json');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // --------- Exportación de ESTRUCTURA (Excel/Sheets) ---------
  function buildStructureRows() {
    const data = buildSummary();
    const rows = [];

    data.ads.forEach(ad => {
      const base = {
        campaign_name: data.campana,
        objective: data.objetivo,
        buy_type: data.compra,
        start_date: data.fInicio,
        end_date: data.fFin,
        platforms: (data.platforms || []).join('|'),
        placements: (data.placements || []).join('|'),
        adset_name: ad.conjunto,
        daily_budget: (data.sets.find(s => s.nombre === ad.conjunto)?.presupuesto) || '',
        advantage_flags: (data.advantage || []).join('|'),
        ad_name: ad.nombre,
        cta: ad.cta,
        url: ad.url,
        utm_source: ad.utm_source,
        utm_medium: ad.utm_medium,
        utm_campaign: ad.utm_campaign,
        utm_content: ad.utm_content
      };

      if (!ad.variaciones.length) {
        rows.push({...base, variation_index:'', copy:'', title:'', description:''});
      } else {
        ad.variaciones.forEach(v => {
          rows.push({
            ...base,
            variation_index: v.index,
            copy: v.copy,
            title: v.titulo,
            description: v.descripcion
          });
        });
      }
    });

    if (!rows.length) {
      rows.push({
        campaign_name: data.campana, objective: data.objetivo, buy_type: data.compra,
        start_date: data.fInicio, end_date: data.fFin, platforms:(data.platforms||[]).join('|'),
        placements:(data.placements||[]).join('|'), adset_name:'', daily_budget:'', advantage_flags:'',
        ad_name:'', cta:'', url:'', utm_source:'', utm_medium:'', utm_campaign:'', utm_content:'',
        variation_index:'', copy:'', title:'', description:''
      });
    }
    return rows;
  }

  function toCSV(rows) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const esc = v => {
      const s = (v ?? '').toString();
      return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
    };
    const lines = [headers.join(',')];
    rows.forEach(r => lines.push(headers.map(h => esc(r[h])).join(',')));
    return lines.join('\n');
  }

  function downloadBlob(filename, mime, data) {
    const blob = (data instanceof Blob) ? data : new Blob([data], {type: mime});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function exportStructureCSV() {
    const rows = buildStructureRows();
    const csv  = toCSV(rows);
    downloadBlob('estructura-campana.csv', 'text/csv;charset=utf-8', csv);
  }

  function exportStructureJSON() {
    const rows = buildStructureRows();
    downloadBlob('estructura-campana.json', 'application/json', JSON.stringify(rows, null, 2));
  }

  function renderStructurePreview() {
    // limpia previa anterior
    const existing = document.getElementById('structure-preview');
    if (existing) existing.remove();

    const rows = buildStructureRows();
    const headers = Object.keys(rows[0] || {
      campaign_name:'', objective:'', buy_type:'', start_date:'', end_date:''
    });
    const tableRows = rows.map(r => `
      <tr>
        ${headers.map(h => `<td style="padding:8px;border-bottom:1px solid #24314a">${(r[h] ?? '')}</td>`).join('')}
      </tr>
    `).join('');

    const box = document.createElement('div');
    box.id = 'structure-preview';
    box.className = 'summary-container';
    box.style.marginTop = '14px';
    box.innerHTML = `
      <p><strong>Estructura de campaña (vista previa)</strong></p>
      <div style="overflow:auto; max-height:360px; border:1px solid #24314a; border-radius:8px">
        <table style="width:100%; border-collapse:collapse; font-size:13px">
          <thead style="position:sticky; top:0; background:#101625">
            <tr>
              ${headers.map(h => `<th style="text-align:left;padding:8px;border-bottom:1px solid #24314a">${h.replace(/_/g,' ')}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    `;
    summaryBox.appendChild(box);
    box.scrollIntoView({behavior:'smooth', block:'start'});
  }

  // ---- Enganchar SIEMPRE los botones del toolbar ya presente en el HTML ----
  if (btnStructCsv)  btnStructCsv.addEventListener('click', exportStructureCSV);
  if (btnStructJson) btnStructJson.addEventListener('click', exportStructureJSON);
  if (btnStructPrev) btnStructPrev.addEventListener('click', renderStructurePreview);

  // --------- Listeners de simulación ---------
  if (addPhaseBtn && phasesEditor) {
    addPhaseBtn.addEventListener('click', () => addPhaseRow());
    addPhaseRow('Testing', '0.2', '7');
    addPhaseRow('Escalado', '0.8', '');
  }

  if (simulateBtn) {
    simulateBtn.addEventListener('click', () => {
      const payload = {
        budget: parseFloat(simBudgetInp?.value || 0),
        cpa:    parseFloat(simCpaInp?.value || 0),
        days:   parseInt(simDaysInp?.value || 0, 10),
        phases: readPhases()
      };
      simulate(payload);
    });
  }

  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', async () => {
      const payload = {
        budget: parseFloat(simBudgetInp?.value || 0),
        cpa:    parseFloat(simCpaInp?.value || 0),
        days:   parseInt(simDaysInp?.value || 0, 10),
        phases: readPhases()
      };
      try { await exportPlan('json', payload); } catch (e) { alert(e.message); }
    });
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', async () => {
      const payload = {
        budget: parseFloat(simBudgetInp?.value || 0),
        cpa:    parseFloat(simCpaInp?.value || 0),
        days:   parseInt(simDaysInp?.value || 0, 10),
        phases: readPhases()
      };
      try { await exportPlan('csv', payload); } catch (e) { alert(e.message); }
    });
  }

  // --------- Inicialización ---------
  addSet(); // uno por defecto
  addAd();  // uno por defecto
  switchStep('1'); // iniciar en paso 1
});
