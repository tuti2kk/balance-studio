// Модуль 3. Калькулятор урона и TTK (time to kill) для пары «атакующий → цель» + матрица всех пар.
(function () {
  const { esc, fmt } = BPS.utils;
  const F = BPS.formulas;
  const MATRIX_LIMIT = 25;
  let root;

  const FIELDS = [
    { key: 'multiplier', label: 'Множитель урона', step: 0.1, min: 0 },
    { key: 'critChance', label: 'Шанс крита, %', step: 1, min: 0, max: 100 },
    { key: 'critMult', label: 'Множитель крита', step: 0.1, min: 1 },
    { key: 'interval', label: 'Интервал атаки, с', step: 0.1, min: 0.01 },
  ];

  function render(container) {
    root = container;
    draw();
    BPS.store.subscribe(() => { if (!root.contains(document.activeElement)) draw(); });
  }

  function settings() {
    const st = BPS.store.get();
    const s = { ...st.ttk };
    const ids = st.units.map(u => String(u.id));
    // Если выбранного юнита удалили — берём первого/второго
    if (!ids.includes(String(s.attackerId))) s.attackerId = ids[0] ?? null;
    if (!ids.includes(String(s.targetId))) s.targetId = ids[1] ?? ids[0] ?? null;
    return s;
  }

  function draw() {
    const units = BPS.store.get().units;
    if (!units.length) {
      root.innerHTML = `<h2>Урон / TTK</h2><div class="card muted">Сначала загрузите юнитов на вкладке «Импорт».</div>`;
      return;
    }
    const s = settings();
    const options = sel => units.map(u =>
      `<option value="${esc(u.id)}" ${String(u.id) === String(sel) ? 'selected' : ''}>${esc(u.name)} (#${esc(u.id)})</option>`).join('');

    root.innerHTML = `
      <h2>Урон / TTK</h2>
      <div class="card">
        <div class="grid-form">
          <label>Атакующий<select id="attacker">${options(s.attackerId)}</select></label>
          <label>Цель<select id="target">${options(s.targetId)}</select></label>
          ${FIELDS.map(f => `<label>${f.label}
            <input type="number" data-key="${f.key}" value="${s[f.key]}" step="${f.step}"
              ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''}></label>`).join('')}
        </div>
        <div id="ttkMsg"></div>
        <div class="formula muted">
          Формула: <b>урон = атака × множитель × 100 / (100 + защита)</b> ·
          крит = урон × множитель крита · средний урон = урон × (1 + шанс × (множитель крита − 1)) ·
          удары = ⌈hp / урон⌉ · TTK = удары × интервал
        </div>
      </div>
      <div id="ttkResult"></div>
      <div id="ttkMatrix"></div>
    `;

    root.querySelector('#attacker').addEventListener('change', e => save({ attackerId: e.target.value }));
    root.querySelector('#target').addEventListener('change', e => save({ targetId: e.target.value }));
    root.querySelectorAll('input[data-key]').forEach(inp =>
      inp.addEventListener('input', () => onParam(inp)));

    drawResult(s);
  }

  function save(patch) {
    const s = { ...settings(), ...patch };
    BPS.store.set({ ttk: s });
    drawResult(s);
  }

  function onParam(inp) {
    const f = FIELDS.find(x => x.key === inp.dataset.key);
    const v = Number(inp.value);
    const bad = inp.value === '' || !isFinite(v) || (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max);
    inp.classList.toggle('invalid', bad);
    const msg = root.querySelector('#ttkMsg');
    if (bad) {
      const range = f.max !== undefined ? `от ${f.min} до ${f.max}` : `не меньше ${f.min}`;
      msg.innerHTML = `<div class="msg err">«${f.label}» должно быть числом ${range}. Расчёт не обновлён.</div>`;
      return;
    }
    msg.innerHTML = '';
    save({ [f.key]: v });
  }

  const findUnit = id => BPS.store.get().units.find(u => String(u.id) === String(id));

  function drawResult(s) {
    const a = findUnit(s.attackerId), t = findUnit(s.targetId);
    const box = root.querySelector('#ttkResult');
    if (!a || !t) { box.innerHTML = ''; return; }

    const r = F.duel(a, t, s);
    const back = F.duel(t, a, s); // ответный бой: цель атакует атакующего

    // Кто победит в дуэли один на один (по среднему TTK; при равенстве — ничья)
    let verdict;
    if (r.ttkAvg < back.ttkAvg) verdict = `<b>${esc(a.name)}</b> побеждает: убивает за ${fmt(r.ttkAvg)} с, а сам продержится ${fmt(back.ttkAvg)} с`;
    else if (r.ttkAvg > back.ttkAvg) verdict = `<b>${esc(t.name)}</b> побеждает: убивает за ${fmt(back.ttkAvg)} с, а ${esc(a.name)} нужно ${fmt(r.ttkAvg)} с`;
    else verdict = `Ничья: оба убивают друг друга за ${fmt(r.ttkAvg)} с`;

    box.innerHTML = `
      <div class="card">
        <h3>${esc(a.name)} → ${esc(t.name)}</h3>
        <div class="stats">
          <div><span class="muted">Урон за удар</span><b>${fmt(r.base)}</b></div>
          <div><span class="muted">Урон критом</span><b>${fmt(r.crit)}</b></div>
          <div><span class="muted">Средний урон</span><b>${fmt(r.avg)}</b></div>
          <div><span class="muted">TTK (средний)</span><b>${fmt(r.ttkAvg)} с</b></div>
        </div>
        <table style="margin-top:12px">
          <thead><tr><th>Сценарий</th><th class="num">Ударов</th><th class="num">TTK, с</th></tr></thead>
          <tbody>
            <tr><td>Без критов (худший случай)</td><td class="num">${r.hitsNoCrit}</td><td class="num">${fmt(r.ttkNoCrit)}</td></tr>
            <tr><td>С учётом шанса крита (в среднем)</td><td class="num">${r.hitsAvg}</td><td class="num">${fmt(r.ttkAvg)}</td></tr>
            <tr><td>Все удары критические (лучший случай)</td><td class="num">${r.hitsAllCrit}</td><td class="num">${fmt(r.ttkAllCrit)}</td></tr>
          </tbody>
        </table>
        <details style="margin-top:12px">
          <summary>Расчёт по шагам (для ручной проверки)</summary>
          <pre class="steps">урон    = ${a.attack} × ${s.multiplier} × 100 / (100 + ${t.defense}) = ${fmt(r.base)}
крит    = ${fmt(r.base)} × ${s.critMult} = ${fmt(r.crit)}
средний = ${fmt(r.base)} × (1 + ${s.critChance / 100} × (${s.critMult} − 1)) = ${fmt(r.avg)}
удары   = ⌈${t.hp} / ${fmt(r.avg)}⌉ = ${r.hitsAvg}
TTK     = ${r.hitsAvg} × ${s.interval} = ${fmt(r.ttkAvg)} с</pre>
        </details>
        <div class="msg ${r.ttkAvg === back.ttkAvg ? 'warn' : 'ok'}" style="margin-top:12px">Дуэль: ${verdict}</div>
      </div>`;

    drawMatrix(s);
  }

  // Матрица: сколько ударов (в среднем) нужно строке, чтобы убить столбец. Цвет — от быстро к долго.
  function drawMatrix(s) {
    const box = root.querySelector('#ttkMatrix');
    const units = BPS.store.get().units.slice(0, MATRIX_LIMIT);
    const cells = units.map(a => units.map(t => F.duel(a, t, s).hitsAvg));
    const all = cells.flat().filter(isFinite);
    const min = Math.min(...all), max = Math.max(...all);
    const shade = v => {
      const k = max === min ? 0 : (v - min) / (max - min); // 0 — быстро, 1 — долго
      return `background: color-mix(in srgb, var(--ok) ${Math.round((1 - k) * 35)}%, color-mix(in srgb, var(--err) ${Math.round(k * 35)}%, transparent))`;
    };

    box.innerHTML = `
      <div class="card">
        <h3>Матрица: ударов до убийства (в среднем)</h3>
        <div class="muted" style="margin-bottom:8px">Строка — атакующий, столбец — цель.
          Зелёный — убивает быстро, красный — долго.${BPS.store.get().units.length > MATRIX_LIMIT ? ` Показаны первые ${MATRIX_LIMIT}.` : ''}</div>
        <div class="table-wrap">
          <table class="matrix">
            <thead><tr><th></th>${units.map(u => `<th class="num">${esc(u.name)}</th>`).join('')}</tr></thead>
            <tbody>${units.map((a, i) => `<tr><th>${esc(a.name)}</th>${cells[i].map(v =>
              `<td class="num" style="${shade(v)}">${isFinite(v) ? v : '∞'}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </div>`;
  }

  BPS.modules = BPS.modules || {};
  BPS.modules.ttk = { render };
})();
