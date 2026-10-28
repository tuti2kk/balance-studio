// Модуль 4. Кривая прогрессии: формула опыта с настраиваемыми коэффициентами, таблица уровней, график.
(function () {
  const { esc, fmt, toCSV, download } = BPS.utils;
  const F = BPS.formulas;
  let root, chart;

  const FIELDS = [
    { key: 'base', label: 'base — опыт на 1-м уровне', step: 10, min: 1 },
    { key: 'power', label: 'power — крутизна кривой', step: 0.1, min: 0, max: 5 },
    { key: 'linear', label: 'linear — линейная добавка', step: 10, min: 0 },
    { key: 'maxLevel', label: 'Макс. уровень', step: 1, min: 2, max: 200, int: true },
  ];

  const PRESETS = {
    'Линейная':   { base: 100, power: 1, linear: 0 },
    'Умеренная':  { base: 100, power: 1.5, linear: 0 },
    'Крутая':     { base: 50,  power: 2.2, linear: 0 },
    'Плавный старт': { base: 20, power: 2, linear: 80 },
  };

  function render(container) {
    root = container;
    draw();
  }

  function draw() {
    const p = BPS.store.get().progression;
    root.innerHTML = `
      <h2>Кривая прогрессии</h2>
      <div class="card">
        <div class="grid-form">
          ${FIELDS.map(f => `<label>${f.label}
            <input type="number" data-key="${f.key}" value="${p[f.key]}" step="${f.step}" min="${f.min}" ${f.max ? `max="${f.max}"` : ''}></label>`).join('')}
        </div>
        <div class="row" style="margin-top:10px">
          <span class="muted">Пресеты:</span>
          ${Object.keys(PRESETS).map(n => `<button class="ghost" data-preset="${esc(n)}">${esc(n)}</button>`).join('')}
        </div>
        <div id="progMsg"></div>
        <div class="formula muted">Формула: <b>опыт до следующего уровня = round(base × L<sup>power</sup> + linear × L)</b>, где L — текущий уровень.
          Накопленный опыт — сумма по всем предыдущим уровням.</div>
      </div>
      <div class="card"><div id="chartBox" style="position:relative;height:320px"><canvas id="progChart"></canvas></div></div>
      <div class="card" id="progTable"></div>
    `;

    root.querySelectorAll('input[data-key]').forEach(inp => inp.addEventListener('input', () => onParam(inp)));
    root.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => {
      const next = { ...BPS.store.get().progression, ...PRESETS[btn.dataset.preset] };
      BPS.store.set({ progression: next });
      draw();
    }));

    update(p);
  }

  function onParam(inp) {
    const f = FIELDS.find(x => x.key === inp.dataset.key);
    const v = Number(inp.value);
    const bad = inp.value === '' || !isFinite(v) || v < f.min || (f.max !== undefined && v > f.max) || (f.int && !Number.isInteger(v));
    inp.classList.toggle('invalid', bad);
    const msg = root.querySelector('#progMsg');
    if (bad) {
      msg.innerHTML = `<div class="msg err">«${esc(f.label)}»: допустимо ${f.int ? 'целое ' : ''}от ${f.min}${f.max !== undefined ? ` до ${f.max}` : ''}. График не обновлён.</div>`;
      return;
    }
    msg.innerHTML = '';
    const p = { ...BPS.store.get().progression, [f.key]: v };
    BPS.store.set({ progression: p });
    update(p);
  }

  function update(p) {
    const rows = F.levelTable(p);
    drawChart(rows);
    drawTable(rows, p);
  }

  function drawChart(rows) {
    const box = root.querySelector('#chartBox');
    if (typeof Chart === 'undefined') {
      box.style.height = 'auto';
      box.innerHTML = `<div class="msg warn">График не загрузился (нет интернета для Chart.js). Таблица ниже работает.</div>`;
      return;
    }
    const css = getComputedStyle(document.documentElement);
    const text = css.getPropertyValue('--muted').trim();
    const grid = css.getPropertyValue('--border').trim();
    const accent = css.getPropertyValue('--accent').trim();
    const ok = css.getPropertyValue('--ok').trim();

    const data = {
      labels: rows.map(r => r.level),
      datasets: [
        { label: 'Опыт до следующего уровня', data: rows.slice(0, -1).map(r => r.xpToNext),
          borderColor: accent, backgroundColor: accent, yAxisID: 'y', tension: 0.2, pointRadius: 2 },
        { label: 'Накоплено опыта', data: rows.map(r => r.totalXp),
          borderColor: ok, backgroundColor: ok, yAxisID: 'y2', tension: 0.2, pointRadius: 2, borderDash: [5, 4] },
      ],
    };
    const axis = (title, pos, showGrid) => ({
      position: pos, title: { display: true, text: title, color: text },
      ticks: { color: text }, grid: { color: showGrid ? grid : 'transparent' }, beginAtZero: true,
    });
    const options = {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: text } } },
      scales: {
        x: { title: { display: true, text: 'Уровень', color: text }, ticks: { color: text }, grid: { color: grid } },
        y: axis('До следующего', 'left', true),
        y2: axis('Накоплено', 'right', false),
      },
    };
    if (chart) chart.destroy();
    chart = new Chart(root.querySelector('#progChart'), { type: 'line', data, options });
  }

  function drawTable(rows, p) {
    const box = root.querySelector('#progTable');
    const total = rows[rows.length - 1].totalXp;
    const first = rows[0].xpToNext, last = rows[rows.length - 2]?.xpToNext ?? first;
    box.innerHTML = `
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <h3 style="margin:0">Таблица уровней</h3>
        <div class="row">
          <button class="ghost" id="progCsv">Экспорт CSV</button>
          <button class="ghost" id="progJson">Экспорт JSON</button>
        </div>
      </div>
      <div class="stats" style="margin-bottom:12px">
        <div><span class="muted">Всего опыта до ${p.maxLevel} ур.</span><b>${total.toLocaleString('ru-RU')}</b></div>
        <div><span class="muted">Последний уровень дороже первого</span><b>×${fmt(last / first)}</b></div>
      </div>
      <details style="margin-bottom:12px">
        <summary>Расчёт по шагам для уровня 2 и 3 (для ручной проверки)</summary>
        <pre class="steps">${[2, 3].filter(L => L < p.maxLevel).map(L =>
          `L=${L}: round(${p.base} × ${L}^${p.power} + ${p.linear} × ${L}) = round(${fmt(p.base * Math.pow(L, p.power) + p.linear * L)}) = ${F.xpToNext(L, p)}`).join('\n')}</pre>
      </details>
      <div class="table-wrap" style="max-height:360px;overflow-y:auto">
        <table>
          <thead><tr><th class="num">Уровень</th><th class="num">Опыт до следующего</th><th class="num">Накоплено к уровню</th></tr></thead>
          <tbody>${rows.map(r => `<tr><td class="num">${r.level}</td><td class="num">${r.xpToNext || '—'}</td><td class="num">${r.totalXp}</td></tr>`).join('')}</tbody>
        </table>
      </div>`;
    const cols = ['level', 'xpToNext', 'totalXp'];
    box.querySelector('#progCsv').addEventListener('click', () => download('progression.csv', toCSV(rows, cols), 'text/csv'));
    box.querySelector('#progJson').addEventListener('click', () =>
      download('progression.json', JSON.stringify({ formula: p, levels: rows }, null, 2), 'application/json'));
  }

  // При смене темы перерисовываем график, чтобы обновились цвета осей
  document.addEventListener('bps:theme', () => { if (root && chart) update(BPS.store.get().progression); });

  BPS.modules = BPS.modules || {};
  BPS.modules.progression = { render };
})();
