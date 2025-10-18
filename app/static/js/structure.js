// app/static/js/structure.js
(function () {
  const $$ = (sel, root = document) => root.querySelector(sel);
  const $$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const API = "/api/campaigns";

  const elList = $$("#campaigns");
  const btnCreate = $$("#btn-create");

  async function getJSON(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  function currencySym(code) {
    return code === "USD" ? "$ " : "S/ ";
  }

  function fmtMoney(n, code) {
    const s = currencySym(code);
    const val = Number(n || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    return s + val;
  }

  function card(c) {
    const wrap = document.createElement("div");
    wrap.className = "camp-card";

    wrap.innerHTML = `
      <h4>${c.name}</h4>
      <div class="meta">
        Cliente: <b>${c.project_name || c.project_id || "-"}</b> ·
        Obj: <b>${c.objective}</b> ·
        Presupuesto: <b>${fmtMoney(c.budget_total, c.currency)}</b> ·
        CPA: <b>${fmtMoney(c.cpa_expected, c.currency)}</b> ·
        Días: <b>${c.days}</b>
      </div>
      <div class="actions">
        <button data-act="dup">Duplicar</button>
        <button data-act="proj">Proyección</button>
        <button data-act="del" style="background:#b91c1c">Eliminar</button>
      </div>
    `;

    wrap.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const act = btn.dataset.act;

      if (act === "dup") {
        if (!confirm("¿Duplicar campaña?")) return;
        await getJSON(`${API}/${c.id}/duplicate`, { method: "POST" });
        await load();
      }

      if (act === "del") {
        if (!confirm("¿Eliminar campaña?")) return;
        await getJSON(`${API}/${c.id}`, { method: "DELETE" });
        await load();
      }

      if (act === "proj") {
        const rows = await getJSON(`${API}/${c.id}/projection`);
        const txt = rows.slice(0, 10).map(r =>
          `Día ${r.day} · Fase: ${r.phase} · Inversión: ${fmtMoney(r.investment, c.currency)} · Leads: ${r.leads}`
        ).join("\n");
        alert((txt || "Sin datos") + (rows.length > 10 ? "\n\n… (ver API para todos los días)" : ""));
      }
    });

    return wrap;
  }

  async function load() {
    elList.innerHTML = `<div class="meta">Cargando campañas…</div>`;
    try {
      const rows = await getJSON(API);
      elList.innerHTML = "";
      if (!rows.length) {
        elList.innerHTML = `<div class="meta">Aún no hay campañas. Crea la primera con el formulario de arriba.</div>`;
        return;
      }
      rows.forEach(c => elList.appendChild(card(c)));
    } catch (e) {
      elList.innerHTML = `<div class="meta" style="color:#fca5a5">Error: ${e.message}</div>`;
    }
  }

  btnCreate?.addEventListener("click", async () => {
    const payload = {
      project_name: $$("#nc-project").value.trim() || "Cliente",
      name: $$("#nc-name").value.trim() || "Campaña",
      objective: $$("#nc-obj").value,
      currency: $$("#nc-currency").value,
      budget_total: parseFloat($$("#nc-budget").value || "0"),
      cpa_expected: parseFloat($$("#nc-cpa").value || "0"),
      days: parseInt($$("#nc-days").value || "30", 10)
    };

    // Validaciones básicas
    if (payload.budget_total <= 0 || payload.cpa_expected <= 0 || payload.days <= 0) {
      alert("Completa presupuesto, CPA y días con valores válidos.");
      return;
    }

    try {
      await getJSON(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // limpiar nombre para forzar variaciones
      $$("#nc-name").value = "";
      await load();
    } catch (e) {
      alert("Error al crear: " + e.message);
    }
  });

  // Primer render
  load();
})();
