// Разбор CSV/JSON и валидация юнитов. Чистые функции: на вход текст, на выход данные + ошибки.
// Ничего не знают про HTML — поэтому их легко проверять отдельно.
(function () {
  // Схема юнита: какие колонки обязательны и какого они типа
  const UNIT_SCHEMA = {
    required: ['id', 'name', 'hp', 'attack', 'defense', 'cost'],
    numeric:  ['hp', 'attack', 'defense', 'cost'],
    nonNegative: ['hp', 'attack', 'defense', 'cost'],
  };

  // --- CSV ---------------------------------------------------------------

  // Определяем разделитель по первой строке: Excel в русской локали сохраняет через ";"
  function detectDelimiter(firstLine) {
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQuotes = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch in counts) counts[ch]++;
    }
    return Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a));
  }

  // Посимвольный разбор: поддерживает кавычки, "" внутри кавычек, переносы строк в кавычках
  function parseCSV(text) {
    text = text.replace(/^﻿/, ''); // убрать BOM, который добавляет Excel
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const delim = detectDelimiter(firstLine);

    const rows = [];
    let row = [], field = '', inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        row.push(field); field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }

    // Пустые строки (например, в конце файла) пропускаем
    const nonEmpty = rows.filter(r => r.some(c => c.trim() !== ''));
    if (nonEmpty.length === 0) throw new Error('Файл пустой');

    const headers = nonEmpty[0].map(h => h.trim().toLowerCase());
    const records = nonEmpty.slice(1).map((cells, idx) => {
      const obj = {};
      headers.forEach((h, j) => { obj[h] = (cells[j] ?? '').trim(); });
      obj.__line = idx + 2; // номер строки в файле (1 — заголовок)
      obj.__cellCount = cells.length;
      return obj;
    });
    return { headers, records, delimiter: delim };
  }

  // --- JSON --------------------------------------------------------------

  // Принимаем либо массив объектов, либо {units: [...]} (для лута — {loot: [...]})
  function parseJSON(text, key = 'units') {
    let data;
    try {
      data = JSON.parse(text.replace(/^﻿/, ''));
    } catch (e) {
      throw new Error('Некорректный JSON: ' + e.message);
    }
    const list = Array.isArray(data) ? data : Array.isArray(data?.[key]) ? data[key] : null;
    if (!list) throw new Error(`JSON должен быть массивом объектов или объектом вида {"${key}": [...]}`);
    if (list.length === 0) throw new Error('В JSON нет ни одной записи');

    const headerSet = new Set();
    const records = list.map((item, idx) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        return { __line: idx + 1, __notObject: true };
      }
      const obj = {};
      for (const [k, v] of Object.entries(item)) {
        const key = k.trim().toLowerCase();
        headerSet.add(key);
        obj[key] = v;
      }
      obj.__line = idx + 1; // номер элемента массива (с 1)
      return obj;
    });
    return { headers: [...headerSet], records };
  }

  // --- Валидация ---------------------------------------------------------

  // Превращает "12", "12.5", "12,5" или число в number. Иначе — NaN.
  function toNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return NaN;
    const s = v.trim().replace(',', '.');
    if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return Number(s);
  }

  /**
   * Проверка записей юнитов.
   * Возвращает { units, errors, warnings }.
   * errors — импорт блокируется; warnings — импорт проходит, но пользователь предупреждён.
   */
  function validateUnits({ headers, records }, kind = 'csv') {
    const errors = [];
    const warnings = [];
    const where = kind === 'csv' ? 'Строка' : 'Запись';

    // 1. Обязательные колонки
    const missing = UNIT_SCHEMA.required.filter(c => !headers.includes(c));
    if (missing.length) {
      errors.push(`Нет обязательных колонок: ${missing.join(', ')}. Нужны: ${UNIT_SCHEMA.required.join(', ')}`);
      return { units: [], errors, warnings };
    }

    const seenIds = new Map(); // id -> номер строки, где встретился впервые
    const units = [];

    for (const rec of records) {
      const line = rec.__line;
      if (rec.__notObject) { errors.push(`${where} ${line}: это не объект`); continue; }

      if (kind === 'csv' && rec.__cellCount !== headers.length) {
        warnings.push(`${where} ${line}: ${rec.__cellCount} ячеек, а колонок ${headers.length}`);
      }

      const unit = {};
      let rowOk = true;

      // id: обязателен, уникален
      const id = String(rec.id ?? '').trim();
      if (id === '') { errors.push(`${where} ${line}: пустой id`); rowOk = false; }
      else if (seenIds.has(id)) {
        errors.push(`${where} ${line}: дубль id "${id}" (уже был в ${kind === 'csv' ? 'строке' : 'записи'} ${seenIds.get(id)})`);
        rowOk = false;
      } else seenIds.set(id, line);
      unit.id = id;

      // name: обязателен
      const name = String(rec.name ?? '').trim();
      if (name === '') { errors.push(`${where} ${line}: пустое имя (name)`); rowOk = false; }
      unit.name = name;

      // Числовые колонки
      for (const col of UNIT_SCHEMA.numeric) {
        const n = toNumber(rec[col]);
        if (Number.isNaN(n)) {
          errors.push(`${where} ${line}: "${col}" должно быть числом, получено "${rec[col] ?? ''}"`);
          rowOk = false;
        } else if (UNIT_SCHEMA.nonNegative.includes(col) && n < 0) {
          errors.push(`${where} ${line}: "${col}" не может быть отрицательным (${n})`);
          rowOk = false;
        } else unit[col] = n;
      }
      if (unit.hp === 0) warnings.push(`${where} ${line}: hp = 0 — юнит умрёт сразу`);

      // Дополнительные колонки сохраняем как есть (числа — числами)
      for (const [k, v] of Object.entries(rec)) {
        if (k.startsWith('__') || k in unit) continue;
        const n = toNumber(v);
        unit[k] = Number.isNaN(n) ? v : n;
      }

      if (rowOk) units.push(unit);
    }

    if (records.length === 0) errors.push('В файле нет строк с данными — только заголовок');
    return { units, errors, warnings };
  }

  // --- Лут ---------------------------------------------------------------
  // Колонки: table (название таблицы дропа), item, chance (%), min, max (количество, необязательно)
  const LOOT_SCHEMA = { required: ['table', 'item', 'chance'], optional: ['min', 'max'] };

  // Импорт лута: блокируем только структурные ошибки (нет колонок, не число).
  // Смысловые ошибки (сумма ≠ 100%, дубли) показываются подсветкой в редакторе — их там и исправляют.
  function validateLootRecords({ headers, records }, kind = 'csv') {
    const errors = [];
    const where = kind === 'csv' ? 'Строка' : 'Запись';
    const missing = LOOT_SCHEMA.required.filter(c => !headers.includes(c));
    if (missing.length) {
      return { rows: [], errors: [`Нет обязательных колонок: ${missing.join(', ')}. Нужны: ${LOOT_SCHEMA.required.join(', ')} (+ необязательные min, max)`] };
    }
    const rows = [];
    for (const rec of records) {
      if (rec.__notObject) { errors.push(`${where} ${rec.__line}: это не объект`); continue; }
      const row = { table: String(rec.table ?? '').trim(), item: String(rec.item ?? '').trim() };
      row.chance = toNumber(rec.chance);
      if (Number.isNaN(row.chance)) errors.push(`${where} ${rec.__line}: chance должно быть числом, получено "${rec.chance ?? ''}"`);
      for (const col of ['min', 'max']) {
        const raw = rec[col];
        if (raw === undefined || raw === '') { row[col] = 1; continue; }
        row[col] = toNumber(raw);
        if (Number.isNaN(row[col])) errors.push(`${where} ${rec.__line}: ${col} должно быть числом, получено "${raw}"`);
      }
      if (row.table === '') errors.push(`${where} ${rec.__line}: пустое имя таблицы (table)`);
      rows.push(row);
    }
    if (!records.length) errors.push('В файле нет строк с данными');
    return { rows: errors.length ? [] : rows, errors };
  }

  // Проблемы одной строки лута внутри своей таблицы (для подсветки)
  function lootRowIssues(row, tableRows) {
    const issues = {};
    if (!row.item) issues.item = 'Пустое название предмета';
    else if (tableRows.filter(r => r.item.toLowerCase() === row.item.toLowerCase()).length > 1) issues.item = 'Предмет повторяется в таблице';
    if (typeof row.chance !== 'number' || Number.isNaN(row.chance)) issues.chance = 'Шанс должен быть числом';
    else if (row.chance < 0 || row.chance > 100) issues.chance = 'Шанс должен быть от 0 до 100';
    else if (row.chance === 0) issues.chance = 'Шанс 0% — предмет никогда не выпадет';
    if (!Number.isInteger(row.min) || row.min < 0) issues.min = 'min — целое число ≥ 0';
    if (!Number.isInteger(row.max) || row.max < 0) issues.max = 'max — целое число ≥ 0';
    else if (Number.isInteger(row.min) && row.min > row.max) issues.max = 'max меньше min';
    return issues;
  }

  BPS.parsers = { parseCSV, parseJSON, validateUnits, toNumber, UNIT_SCHEMA,
    LOOT_SCHEMA, validateLootRecords, lootRowIssues };
})();
