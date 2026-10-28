// Модуль 5. Проверка лута: таблицы дропа с вероятностями, проверка суммы = 100%, подсветка ошибок,
// симуляция выпадения и экспорт результата.
(function () {
  const { esc, fmt, toCSV, download } = BPS.utils;
  const P = BPS.parsers;
  const F = BPS.formulas;
  const SIM_ROLLS = 10000;
  let root;

  const SAMPLE_CSV = `table,item,chance,min,max
Гоблин,Ничего,40,0,0
Гоблин,Монеты,35,5,20
Гоблин,Ржавый кинжал,15,1,1
Гоблин,Зелье лечения,10,1,2
Сундук,Монеты,50,50,150
Сундук,Кольцо силы,20,1,1
Сундук,Свиток,25,1,3
Босс-дракон,Чешуя дракона,60,3,6
Босс-дракон,Меч героя,25.5,1,1
Босс-дракон,Яйцо дракона,0.5,1,1
Босс-дракон,Золото,14,500,1000`;

  function render(container) {
    root = container;
    // Один обработчик на весь модуль (root не пересоздаётся, а вот его содержимое — да)
    root.addEventListener('change', onCellChange);
    draw();
  }

  const rows = () => BPS.store.get().loot;

  // Группировка строк по таблицам с сохранением исходных индексов
  function groups() {
    const map = new Map();
    rows().forEach((r, index) => {
      if (!map.has(r.table)) map.set(r.table, []);
      map.get(r.table).push({ ...r, index });
    });
    return [...map.entries()].map(([name, items]) => {
      const sum = F.lootSum(items);
      const issues = items.map(r => P.lootRowIssues(r, items));
      const hardIssues = issues.reduce((n, iss) =>
        n + Object.entries(iss).filter(([k, v]) => !v.includes('никогда не выпадет')).length, 0);
      return { name, items, sum, sumOk: F.lootSumOk(sum), issues, hardIssues };
    });
  }

  function draw() {
    const gs = groups();
    const bad = gs.filter(g => !g.sumOk || g.hardIssues).length;

    root.innerHTML = `
      <h2>Проверка лута</h2>
      <div class="card">
        <div class="row">
          <label class="btn ghost-label">Загрузить CSV/JSON<input type="file" id="lootFile" accept=".csv,.json" hidden></label>
          <button class="ghost" id="lootSample">Пример</button>
          <button class="ghost" id="lootAddTable">+ Новая таблица</button>
          <button class="ghost" id="lootCsv" ${gs.length ? '' : 'disabled'}>Экспорт CSV</button>
          <button class="ghost" id="lootJson" ${gs.length ? '' : 'disabled'}>Экспорт JSON + отчёт</button>
          <button class="ghost" id="lootClear" ${gs.length ? '' : 'disabled'}>Очистить</button>
        </div>
        <div class="muted" style="margin-top:8px">Колонки файла: <code>table, item, chance</code> (+ <code>min, max</code> — количество).
          В каждой таблице сумма шансов должна быть ровно 100%.</div>
        <div id="lootMsg"></div>
        ${gs.length ? `<div class="msg ${bad ? 'err' : 'ok'}">${bad
          ? `Таблиц с ошибками: ${bad} из ${gs.length}`
          : `Все ${gs.length} таблиц(ы) корректны`}</div>` : ''}
      </div>
      ${gs.length ? gs.map(drawGroup).join('') : `<div class="card muted">Таблиц дропа пока нет — загрузите файл или нажмите «Пример».</div>`}
    `;
    bind();
  }

  function drawGroup(g) {
    const diff = Math.round((100 - g.sum) * 1e6) / 1e6;
    const sumText = g.sumOk ? 'Сумма = 100% ✓'
      : diff > 0 ? `Сумма = ${fmt(g.sum)}% — не хватает ${fmt(diff)}%`
      : `Сумма = ${fmt(g.sum)}% — лишние ${fmt(-diff)}%`;
    const cell = (r, i, key, type = 'text') => {
      const issue = g.issues[i][key];
      const warnOnly = issue && issue.includes('никогда не выпадет');
      const v = r[key] === undefined || Number.isNaN(r[key]) ? '' : r[key];
      return `<td><input type="${type}" class="${type === 'number' ? 'num' : ''} ${issue ? (warnOnly ? 'warned' : 'invalid') : ''}"
        data-index="${r.index}" data-key="${key}" value="${esc(v)}" ${issue ? `title="${esc(issue)}"` : ''}></td>`;
    };
    return `
      <div class="card loot-card ${g.sumOk && !g.hardIssues ? '' : 'has-error'}" data-table="${esc(g.name)}">
        <div class="row" style="justify-content:space-between">
          <h3 style="margin:0">${esc(g.name || '(без названия)')}</h3>
          <span class="badge ${g.sumOk ? 'ok' : 'err'}">${sumText}</span>
        </div>
        <div class="table-wrap" style="margin-top:8px">
          <table class="editable">
            <thead><tr><th>Предмет</th><th class="num">Шанс, %</th><th class="num">min</th><th class="num">max</th><th>Проблема</th><th></th></tr></thead>
            <tbody>${g.items.map((r, i) => `<tr>
              ${cell(r, i, 'item')}${cell(r, i, 'chance', 'number')}${cell(r, i, 'min', 'number')}${cell(r, i, 'max', 'number')}
              <td class="issue">${esc(Object.values(g.issues[i]).join('; '))}</td>
              <td><button class="ghost icon" data-del="${r.index}" title="Удалить">✕</button></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="ghost" data-add="${esc(g.name)}">+ Предмет</button>
          ${!g.sumOk && g.sum > 0 ? `<button class="ghost" data-normalize="${esc(g.name)}">Нормализовать до 100%</button>` : ''}
          <button class="ghost" data-sim="${esc(g.name)}" ${g.sumOk && !g.hardIssues ? '' : 'disabled title="Сначала исправьте ошибки"'}>Симуляция ${SIM_ROLLS.toLocaleString('ru-RU')} выпадений</button>
          <button class="ghost" data-deltable="${esc(g.name)}">Удалить таблицу</button>
        </div>
        <div class="sim-result"></div>
      </div>`;
  }

  function bind() {
    root.querySelector('#lootFile').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => importText(reader.result, file.name);
      reader.readAsText(file, 'utf-8');
      e.target.value = '';
    });
    root.querySelector('#lootSample').addEventListener('click', () => importText(SAMPLE_CSV, 'пример_лута.csv'));
    root.querySelector('#lootAddTable').addEventListener('click', addTable);
    root.querySelector('#lootCsv').addEventListener('click', () =>
      download('loot.csv', toCSV(rows(), ['table', 'item', 'chance', 'min', 'max']), 'text/csv'));
    root.querySelector('#lootJson').addEventListener('click', exportJson);
    root.querySelector('#lootClear').addEventListener('click', () => {
      if (confirm('Удалить все таблицы лута?')) { BPS.store.set({ loot: [], lootSource: null }); draw(); }
    });

    root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () =>
      setRows(rows().filter((_, i) => i !== Number(b.dataset.del)))));
    root.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () =>
      setRows([...rows(), { table: b.dataset.add, item: '', chance: 0, min: 1, max: 1 }])));
    root.querySelectorAll('[data-deltable]').forEach(b => b.addEventListener('click', () => {
      if (confirm(`Удалить таблицу «${b.dataset.deltable}»?`)) setRows(rows().filter(r => r.table !== b.dataset.deltable));
    }));
    root.querySelectorAll('[data-normalize]').forEach(b => b.addEventListener('click', () => normalize(b.dataset.normalize)));
    root.querySelectorAll('[data-sim]').forEach(b => b.addEventListener('click', () => simulate(b.dataset.sim, b.closest('.loot-card'))));
  }

  function setRows(next) {
    BPS.store.set({ loot: next });
    redrawKeepingFocus();
  }

  // После перерисовки возвращаем фокус в ту же ячейку (чтобы Tab между полями не сбивался)
  function redrawKeepingFocus() {
    setTimeout(() => {
      const a = document.activeElement;
      const key = a && root.contains(a) && a.dataset.index !== undefined ? [a.dataset.index, a.dataset.key] : null;
      draw();
      if (key) root.querySelector(`input[data-index="${key[0]}"][data-key="${key[1]}"]`)?.focus();
    }, 0);
  }

  function onCellChange(e) {
    const inp = e.target;
    if (!inp.matches('input[data-index]')) return;
    const i = Number(inp.dataset.index), key = inp.dataset.key;
    let value = inp.value.trim();
    if (key !== 'item') value = value === '' ? NaN : P.toNumber(value);
    setRows(rows().map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  }

  function addTable() {
    const names = new Set(rows().map(r => r.table));
    let n = 1; while (names.has(`Таблица ${n}`)) n++;
    setRows([...rows(), { table: `Таблица ${n}`, item: 'Предмет', chance: 100, min: 1, max: 1 }]);
  }

  // Пропорционально масштабирует шансы, чтобы сумма стала 100%. Остаток округления — в самый частый предмет.
  function normalize(table) {
    const all = rows();
    const idx = all.map((r, i) => (r.table === table && typeof r.chance === 'number' && !Number.isNaN(r.chance) ? i : -1)).filter(i => i >= 0);
    const sum = idx.reduce((s, i) => s + all[i].chance, 0);
    if (sum <= 0) return;
    const next = all.map((r, i) => (idx.includes(i) ? { ...r, chance: Math.round(r.chance / sum * 100 * 100) / 100 } : r));
    const newSum = idx.reduce((s, i) => s + next[i].chance, 0);
    const top = idx.reduce((a, b) => (next[b].chance > next[a].chance ? b : a));
    next[top] = { ...next[top], chance: Math.round((next[top].chance + 100 - newSum) * 100) / 100 };
    setRows(next);
  }

  // Монте-Карло: бросаем «кубик» N раз и сравниваем фактическую частоту с заявленной
  function simulate(table, card) {
    const items = rows().filter(r => r.table === table);
    const counts = new Array(items.length).fill(0);
    for (let n = 0; n < SIM_ROLLS; n++) {
      let roll = Math.random() * 100, acc = 0;
      for (let i = 0; i < items.length; i++) {
        acc += items[i].chance;
        if (roll < acc) { counts[i]++; break; }
      }
    }
    card.querySelector('.sim-result').innerHTML = `
      <table style="margin-top:10px">
        <thead><tr><th>Предмет</th><th class="num">Заявлено, %</th><th class="num">Выпало раз</th><th class="num">Факт, %</th><th class="num">Отклонение</th></tr></thead>
        <tbody>${items.map((r, i) => {
          const fact = counts[i] / SIM_ROLLS * 100;
          return `<tr><td>${esc(r.item)}</td><td class="num">${fmt(r.chance)}</td><td class="num">${counts[i]}</td>
            <td class="num">${fmt(fact)}</td><td class="num">${fact - r.chance >= 0 ? '+' : ''}${fmt(fact - r.chance)}</td></tr>`;
        }).join('')}</tbody>
      </table>
      <div class="muted">Отклонение в пределах ±1% — нормальный случайный разброс для ${SIM_ROLLS.toLocaleString('ru-RU')} бросков.</div>`;
  }

  function importText(text, filename) {
    const msg = root.querySelector('#lootMsg');
    let parsed, kind;
    try {
      kind = /\.json$/i.test(filename) || /^\s*[[{]/.test(text) ? 'json' : 'csv';
      parsed = kind === 'json' ? P.parseJSON(text, 'loot') : P.parseCSV(text);
    } catch (e) {
      msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
      return;
    }
    const { rows: imported, errors } = P.validateLootRecords(parsed, kind);
    if (errors.length) {
      msg.innerHTML = `<div class="msg err"><b>Файл ${esc(filename)} не импортирован:</b><ul>${errors.slice(0, 15).map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
      return;
    }
    BPS.store.set({ loot: imported, lootSource: filename });
    draw();
    root.querySelector('#lootMsg').innerHTML = `<div class="msg ok">Загружено ${imported.length} строк из «${esc(filename)}».</div>`;
  }

  function exportJson() {
    const report = groups().map(g => ({
      table: g.name,
      sum: g.sum,
      ok: g.sumOk && g.hardIssues === 0,
      problems: [
        ...(g.sumOk ? [] : [`Сумма шансов ${g.sum}% вместо 100%`]),
        ...g.items.flatMap((r, i) => Object.values(g.issues[i]).map(t => `${r.item || '(пусто)'}: ${t}`)),
      ],
    }));
    download('loot.json', JSON.stringify({ loot: rows(), report }, null, 2), 'application/json');
  }

  BPS.modules = BPS.modules || {};
  BPS.modules.loot = { render };
})();
