// Модуль 2. Редактор таблицы: правка ячеек, добавление/удаление строк, автосохранение, экспорт.
(function () {
  const { esc, fmt, toCSV, columnsOf, download } = BPS.utils;
  const { UNIT_SCHEMA, toNumber } = BPS.parsers;
  let root;
  let selfUpdate = false; // true, когда изменение пришло из самой таблицы — не перерисовываем, чтобы не терять фокус

  function render(container) {
    root = container;
    draw(BPS.store.get());
    BPS.store.subscribe(state => {
      if (selfUpdate) { selfUpdate = false; updateCount(state); return; }
      draw(state);
    });
  }

  function columns(units) { return columnsOf(units, UNIT_SCHEMA.required); }
  function isNumericCol(c, units) {
    return UNIT_SCHEMA.numeric.includes(c) || (units.length > 0 && units.every(u => typeof u[c] === 'number'));
  }

  function draw(state) {
    const units = state.units;
    const cols = columns(units);

    root.innerHTML = `
      <h2>Таблица</h2>
      <div class="card">
        <div class="row" style="margin-bottom:10px">
          <button id="addRow">+ Добавить строку</button>
          <button class="ghost" id="exportCsv" ${units.length ? '' : 'disabled'}>Экспорт CSV</button>
          <button class="ghost" id="exportJson" ${units.length ? '' : 'disabled'}>Экспорт JSON</button>
          <span class="muted" id="countInfo"></span>
        </div>
        <div id="tableMsg"></div>
        ${units.length ? `
        <div class="table-wrap">
          <table class="editable">
            <thead><tr>
              ${cols.map(c => `<th class="${isNumericCol(c, units) ? 'num' : ''}">${esc(c)}</th>`).join('')}
              <th></th>
            </tr></thead>
            <tbody>
              ${units.map((u, i) => `<tr data-index="${i}">
                ${cols.map(c => {
                  const num = isNumericCol(c, units);
                  const v = u[c] === undefined ? '' : (typeof u[c] === 'number' ? fmt(u[c]) : u[c]);
                  return `<td><input class="${num ? 'num' : ''}" data-col="${esc(c)}" value="${esc(v)}"></td>`;
                }).join('')}
                <td><button class="ghost icon" data-del="${i}" title="Удалить строку">✕</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `<div class="muted">Данных пока нет — загрузите файл на вкладке «Импорт» или добавьте строку вручную.</div>`}
        <div class="muted" style="margin-top:8px">Изменения сохраняются автоматически. Ячейка с ошибкой подсвечивается красным и не сохраняется.</div>
      </div>`;

    updateCount(state);

    root.querySelector('#addRow').addEventListener('click', addRow);
    root.querySelector('#exportCsv').addEventListener('click', () =>
      download('units.csv', toCSV(BPS.store.get().units, columns(BPS.store.get().units)), 'text/csv'));
    root.querySelector('#exportJson').addEventListener('click', () =>
      download('units.json', JSON.stringify({ units: BPS.store.get().units }, null, 2), 'application/json'));

    const tbody = root.querySelector('tbody');
    if (!tbody) return;
    // change срабатывает, когда пользователь ушёл из ячейки или нажал Enter
    tbody.addEventListener('change', e => {
      if (e.target.matches('input[data-col]')) commitCell(e.target);
    });
    tbody.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('input')) e.target.blur();
    });
    tbody.addEventListener('click', e => {
      const btn = e.target.closest('[data-del]');
      if (btn) deleteRow(Number(btn.dataset.del));
    });
  }

  function updateCount(state) {
    const el = root.querySelector('#countInfo');
    if (el) el.textContent = `${state.units.length} записей · источник: ${state.unitsSource || '—'}`;
  }

  function showMsg(text, type = 'err') {
    root.querySelector('#tableMsg').innerHTML = text ? `<div class="msg ${type}">${esc(text)}</div>` : '';
  }

  // Проверка одного значения. Возвращает {value} или {error}
  function validateCell(col, raw, index, units) {
    const s = raw.trim();
    if (col === 'id') {
      if (s === '') return { error: 'id не может быть пустым' };
      const dup = units.findIndex((u, i) => i !== index && String(u.id) === s);
      if (dup !== -1) return { error: `id "${s}" уже есть у «${units[dup].name}»` };
      return { value: s };
    }
    if (col === 'name') {
      return s === '' ? { error: 'Имя не может быть пустым' } : { value: s };
    }
    if (isNumericCol(col, units)) {
      const n = toNumber(s);
      if (Number.isNaN(n)) return { error: `«${col}» должно быть числом` };
      if (UNIT_SCHEMA.nonNegative.includes(col) && n < 0) return { error: `«${col}» не может быть отрицательным` };
      return { value: n };
    }
    return { value: s };
  }

  function commitCell(input) {
    const index = Number(input.closest('tr').dataset.index);
    const col = input.dataset.col;
    const units = BPS.store.get().units;
    const res = validateCell(col, input.value, index, units);

    if (res.error) {
      input.classList.add('invalid');
      showMsg(`Строка ${index + 1}: ${res.error}. Значение не сохранено.`);
      return;
    }
    input.classList.remove('invalid');
    showMsg('');
    const updated = units.map((u, i) => (i === index ? { ...u, [col]: res.value } : u));
    selfUpdate = true;
    BPS.store.set({ units: updated });
  }

  function addRow() {
    const units = BPS.store.get().units;
    // Новый id = максимальный числовой id + 1
    const maxId = units.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0);
    const row = { id: String(maxId + 1), name: 'Новый юнит', hp: 100, attack: 10, defense: 0, cost: 100 };
    // Дополнительные колонки (например, role) — пустыми, чтобы у всех строк был одинаковый набор полей
    // и экспорт в CSV с обратным импортом давал те же данные
    for (const c of columns(units)) if (!(c in row)) row[c] = '';
    BPS.store.set({ units: [...units, row] });
    // Фокус на имя новой строки
    const inputs = root.querySelectorAll('tbody tr:last-child input[data-col="name"]');
    if (inputs[0]) { inputs[0].focus(); inputs[0].select(); }
  }

  function deleteRow(index) {
    const units = BPS.store.get().units;
    const name = units[index]?.name;
    BPS.store.set({ units: units.filter((_, i) => i !== index) });
    showMsg(`Удалено: «${name}»`, 'warn');
  }

  BPS.modules = BPS.modules || {};
  BPS.modules.table = { render };
})();
