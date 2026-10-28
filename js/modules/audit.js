// Доп. модуль. Аудит баланса: кто доминирует, а кто бесполезен за свою цену.
(function () {
  const { esc, fmt, toCSV, download } = BPS.utils;
  const F = BPS.formulas;
  let root;
  const DEFAULT_TH = { strong: 1.3, weak: 0.7 };
  // Пороги из хранилища; если их там нет (старое сохранение) — значения по умолчанию
  const thresholds = () => ({ ...DEFAULT_TH, ...(BPS.store.get().audit || {}) });

  const LABEL = { strong: 'Доминирует', weak: 'Бесполезен', ok: 'Норма' };
  const ADVICE = {
    strong: 'слишком выгоден: поднять цену или ослабить',
    weak: 'невыгоден: снизить цену или усилить',
    ok: '',
  };

  function render(container) {
    root = container;
    draw();
    BPS.store.subscribe(() => { if (!root.contains(document.activeElement)) draw(); });
  }

  function draw() {
    const st = BPS.store.get();
    if (st.units.length < 2) {
      root.innerHTML = `<h2>Аудит баланса</h2><div class="card muted">Нужно минимум 2 юнита — загрузите их на вкладке «Импорт».</div>`;
      return;
    }
    const th = thresholds();
    root.innerHTML = `
      <h2>Аудит баланса</h2>
      <div class="card">
        <div class="grid-form">
          <label>«Доминирует», если ценность ≥ медианы ×
            <input type="number" id="thStrong" value="${th.strong}" step="0.05" min="1"></label>
          <label>«Бесполезен», если ценность ≤ медианы ×
            <input type="number" id="thWeak" value="${th.weak}" step="0.05" min="0" max="1"></label>
        </div>
        <div id="auditMsg"></div>
        <div class="formula muted">
          <b>Эффективное hp</b> = hp × (100 + защита) / 100 ·
          <b>Сила</b> = атака × эффективное hp ·
          <b>Ценность</b> = сила / цена ·
          <b>Индекс</b> = ценность / медиана ценности всех юнитов (1.00 — типичный юнит).
          Процент побед — дуэли один на один с текущими настройками вкладки «Урон / TTK».
        </div>
      </div>
      <div id="auditResult"></div>`;
    root.querySelector('#thStrong').addEventListener('input', onThreshold);
    root.querySelector('#thWeak').addEventListener('input', onThreshold);
    drawResult();
  }

  function onThreshold() {
    const s = Number(root.querySelector('#thStrong').value);
    const w = Number(root.querySelector('#thWeak').value);
    const msg = root.querySelector('#auditMsg');
    if (!isFinite(s) || !isFinite(w) || s < 1 || w < 0 || w > 1) {
      msg.innerHTML = `<div class="msg err">Порог «доминирует» должен быть ≥ 1, порог «бесполезен» — от 0 до 1.</div>`;
      return;
    }
    msg.innerHTML = '';
    BPS.store.set({ audit: { strong: s, weak: w } });
    drawResult();
  }

  function drawResult() {
    const st = BPS.store.get();
    const th = thresholds();
    const { rows, median } = F.audit(st.units, st.ttk, th);
    rows.sort((a, b) => b.ratio - a.ratio);
    const strong = rows.filter(r => r.verdict === 'strong'), weak = rows.filter(r => r.verdict === 'weak');
    const maxRatio = Math.max(...rows.map(r => r.ratio), th.strong);
    const ex = rows[0];

    const box = root.querySelector('#auditResult');
    box.innerHTML = `
      <div class="card">
        <div class="stats" style="margin-bottom:12px">
          <div><span class="muted">Доминируют</span><b style="color:var(--err)">${strong.length}</b></div>
          <div><span class="muted">Бесполезны</span><b style="color:var(--warn)">${weak.length}</b></div>
          <div><span class="muted">В норме</span><b style="color:var(--ok)">${rows.length - strong.length - weak.length}</b></div>
          <div><span class="muted">Медиана ценности</span><b>${fmt(median)}</b></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Юнит</th><th class="num">Цена</th><th class="num">Эфф. hp</th><th class="num">Сила</th>
              <th class="num">Ценность</th><th style="min-width:180px">Индекс</th><th class="num">Побед</th><th>Вердикт</th>
            </tr></thead>
            <tbody>${rows.map(r => `
              <tr class="audit-${r.verdict}">
                <td>${esc(r.unit.name)}</td>
                <td class="num">${fmt(r.unit.cost)}</td>
                <td class="num">${fmt(r.ehp)}</td>
                <td class="num">${Math.round(r.power).toLocaleString('ru-RU')}</td>
                <td class="num">${fmt(r.value)}</td>
                <td><div class="bar"><div class="bar-fill ${r.verdict}" style="width:${Math.min(100, r.ratio / maxRatio * 100)}%"></div>
                  <span>${fmt(r.ratio)}</span></div></td>
                <td class="num">${Math.round(r.winRate)}%</td>
                <td><span class="badge ${r.verdict}">${LABEL[r.verdict]}</span>
                  ${ADVICE[r.verdict] ? `<div class="muted" style="font-size:12px">${ADVICE[r.verdict]}</div>` : ''}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <details style="margin-top:12px">
          <summary>Расчёт по шагам для «${esc(ex.unit.name)}» (для ручной проверки)</summary>
          <pre class="steps">эфф. hp  = ${ex.unit.hp} × (100 + ${ex.unit.defense}) / 100 = ${fmt(ex.ehp)}
сила     = ${ex.unit.attack} × ${fmt(ex.ehp)} = ${fmt(ex.power)}
ценность = ${fmt(ex.power)} / ${ex.unit.cost} = ${fmt(ex.value)}
индекс   = ${fmt(ex.value)} / ${fmt(median)} (медиана) = ${fmt(ex.ratio)} → ${LABEL[ex.verdict]}</pre>
        </details>
        <div class="row" style="margin-top:10px">
          <button class="ghost" id="auditCsv">Экспорт отчёта CSV</button>
        </div>
      </div>`;

    box.querySelector('#auditCsv').addEventListener('click', () => {
      const data = rows.map(r => ({
        id: r.unit.id, name: r.unit.name, cost: r.unit.cost,
        effective_hp: +r.ehp.toFixed(2), power: +r.power.toFixed(2), value: +r.value.toFixed(4),
        index: +r.ratio.toFixed(4), win_rate: Math.round(r.winRate), verdict: LABEL[r.verdict],
      }));
      download('balance_audit.csv', toCSV(data, Object.keys(data[0])), 'text/csv');
    });
  }

  BPS.modules = BPS.modules || {};
  BPS.modules.audit = { render };
})();
