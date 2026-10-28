// Общие мелкие функции. Всё приложение живёт в одном глобальном объекте BPS.
window.BPS = window.BPS || {};

BPS.utils = {
  // Экранирование текста перед вставкой в HTML (защита от «сломанной» вёрстки и XSS из файла)
  esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  // Красивый вывод числа: целые без дробей, дробные — до 2 знаков
  fmt(n) {
    if (typeof n !== 'number' || !isFinite(n)) return String(n);
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  },

  // Массив объектов -> CSV. Поля с запятой, кавычкой или переносом берутся в кавычки,
  // поэтому повторный импорт даёт ровно те же данные (импорт/экспорт без потерь).
  toCSV(rows, cols) {
    const cell = v => {
      const s = v === undefined || v === null ? '' : String(v);
      return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
  },

  // Все колонки из массива объектов, в порядке: сначала preferred, потом остальные
  columnsOf(rows, preferred = []) {
    const extra = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(k => !preferred.includes(k));
    return [...preferred, ...extra];
  },

  // Скачать текст как файл (понадобится для экспорта)
  download(filename, text, mime = 'text/plain') {
    // BOM в начале CSV нужен, чтобы Excel правильно показал кириллицу
    if (mime === 'text/csv') text = '﻿' + text;
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};
