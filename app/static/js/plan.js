/*
 * Front‑end logic for the simulador de campañas.
 *
 * Handles form submission without reloading the page, sends
 * the payload to `/api/simulate`, validates inputs, and renders
 * a summary, a table and a mini line chart using pure Canvas.
 */

function $(q, ctx = document) {
  return ctx.querySelector(q);
}

function fmtMoney(v) {
  return (v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('plan.js loaded');
  const form = document.getElementById('sim-form');
  const btn = document.getElementById('simulate');

  // Bridge: click on button triggers form submit
  btn.addEventListener('click', () => {
    form.dispatchEvent(new Event('submit'));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const budget = parseFloat($('#budget').value || '0');
    const cpa    = parseFloat($('#cpa').value    || '0');
    const days   = parseInt($('#days').value     || '0', 10);

    if (!budget || !cpa) {
      alert('Por favor ingresa un presupuesto y un CPA mayores a 0');
      return;
    }

    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget, cpa, days }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error' }));
        throw new Error(err.error || 'Error de simulación');
      }
      const data = await res.json();
      renderSummary(data);
      renderTable(data.series);
      renderChart(data.series);
    } catch (err) {
      alert(err.message || 'Error inesperado');
    }
  });
});

function renderSummary(d) {
  const box = $('#summary');
  box.hidden = false;
  box.innerHTML = `
    <div class="kpis">
      <div><div class="k">Presupuesto</div><div class="v">S/ ${fmtMoney(d.totals.budget)}</div></div>
      <div><div class="k">CPA</div><div class="v">S/ ${fmtMoney(d.totals.cpa)}</div></div>
      <div><div class="k">Leads</div><div class="v">${fmtMoney(d.totals.leads)}</div></div>
      <div><div class="k">Días</div><div class="v">${d.totals.days}</div></div>
    </div>
  `;
}

function renderTable(series) {
  const wrap = $('#table-wrap');
  const tbody = $('#result-table tbody');
  wrap.hidden = false;
  tbody.innerHTML = series
    .map(
      (r) => `
      <tr>
        <td>${r.day}</td>
        <td>${r.phase}</td>
        <td>S/ ${fmtMoney(r.spend)}</td>
        <td>${fmtMoney(r.leads)}</td>
      </tr>
    `
    )
    .join('');
}

// Mini chart sencillo en canvas (sin librerías externas)
function renderChart(series) {
  const c = $('#chart');
  const ctx = c.getContext('2d');
  const W = (c.width = c.clientWidth * (window.devicePixelRatio || 1));
  const H = c.height;
  ctx.clearRect(0, 0, W, H);
  const maxLeads = Math.max(...series.map((s) => s.leads)) || 1;
  const pad = 20;
  const stepX = (W - pad * 2) / Math.max(1, series.length - 1);
  const toY = (v) => H - pad - (v / maxLeads) * (H - pad * 2);

  // Ejes
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, H - pad);
  ctx.lineTo(W - pad, H - pad);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Línea
  ctx.beginPath();
  ctx.strokeStyle = '#7c3aed';
  ctx.lineWidth = 2;
  series.forEach((s, i) => {
    const x = pad + i * stepX;
    const y = toY(s.leads);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Área
  ctx.beginPath();
  ctx.moveTo(pad, toY(series[0].leads));
  series.forEach((s, i) => {
    const x = pad + i * stepX;
    const y = toY(s.leads);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(W - pad, H - pad);
  ctx.lineTo(pad, H - pad);
  ctx.closePath();
  ctx.fillStyle = 'rgba(124, 58, 237, 0.08)';
  ctx.fill();
}
