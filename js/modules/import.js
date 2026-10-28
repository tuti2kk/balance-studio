// Модуль 1. Импорт данных: файл или drag&drop, CSV или JSON, с валидацией.
(function () {
  const { esc } = BPS.utils;
  const MAX_SHOWN_ERRORS = 15;

  // Пример из задания — чтобы можно было попробовать сервис без своего файла
  const SAMPLE_CSV = `id,name,hp,attack,defense,cost
1,Мечник,120,25,10,100
2,Копейщик,100,30,8,110
3,Лучник,80,35,5,120
4,Рыцарь,180,20,20,200
5,Маг,70,45,3,150`;

  let root, resultBox;

  function render(container) {
    root = container;
    root.innerHTML = `
      <h2>Импорт данных</h2>
      <div class="card">
        <label class="dropzone" id="dropzone">
          <input type="file" id="fileInput" accept=".csv,.json,text/csv,application/json">
          <div style="font-size:28px">⇪</div>
          <div><b>Перетащите CSV или JSON сюда</b> или нажмите, чтобы выбрать файл</div>
          <div class="muted" style="margin-top:6px">
            Обязательные колонки: <code>${BPS.parsers.UNIT_SCHEMA.required.join('</code>, <code>')}</code>
          </div>
        </label>
        <div class="row" style="margin-top:12px">
          <button class="ghost" id="loadSample">Загрузить пример из задания</button>
          <button class="ghost" id="clearData">Очистить данные</button>
          <span class="muted" id="currentInfo"></span>
        </div>
      </div>
      <div id="importResult"></div>
    `;
    resultBox = root.querySelector('#importResult');

    const dz = root.querySelector('#dropzone');
    const input = root.querySelector('#fileInput');

    input.addEventListener('change', () => {
      if (input.files[0]) handleFile(input.files[0]);
      input.value = ''; // чтобы повторный выбор того же файла тоже срабатывал
    });

    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => {
      e.preventDefault(); dz.classList.add('over');
    }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => {
      e.preventDefault(); dz.classList.remove('over');
    }));
    dz.addEventListener('drop', e => {
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    root.querySelector('#loadSample').addEventListener('click', () => {
      importText(SAMPLE_CSV, 'пример_из_задания.csv');
    });
    root.querySelector('#clearData').addEventListener('click', () => {
      if (confirm('Удалить загруженных юнитов?')) {
        BPS.store.set({ units: [], unitsSource: null });
        resultBox.innerHTML = `<div class="msg warn">Данные очищены.</div>`;
      }
    });

    updateInfo(BPS.store.get());
    BPS.store.subscribe(updateInfo);
  }

  function updateInfo(state) {
    const el = root.querySelector('#currentInfo');
    el.textContent = state.units.length
      ? `Сейчас загружено: ${state.units.length} записей (${state.unitsSource || 'без имени'})`
      : 'Данные ещё не загружены';
  }

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = () => importText(reader.result, file.name);
    reader.onerror = () => showError(['Не удалось прочитать файл']);
    reader.readAsText(file, 'utf-8');
  }

  // Определяем формат: по расширению, а если его нет — по первому символу
  function detectKind(text, filename) {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'json') return 'json';
    if (ext === 'csv' || ext === 'txt') return 'csv';
    const first = text.trimStart()[0];
    return first === '[' || first === '{' ? 'json' : 'csv';
  }

  function importText(text, filename) {
    let parsed, kind;
    try {
      kind = detectKind(text, filename);
      parsed = kind === 'json' ? BPS.parsers.parseJSON(text) : BPS.parsers.parseCSV(text);
    } catch (e) {
      // Любая ошибка разбора — сообщение пользователю, а не падение страницы
      showError([e.message], filename);
      return;
    }

    const { units, errors, warnings } = BPS.parsers.validateUnits(parsed, kind);

    if (errors.length) {
      showError(errors, filename, warnings);
      return; // всё-или-ничего: битый файл не портит уже загруженные данные
    }

    BPS.store.set({ units, unitsSource: filename });
    showSuccess(units, filename, warnings);
  }

  function list(items) {
    const shown = items.slice(0, MAX_SHOWN_ERRORS).map(t => `<li>${esc(t)}</li>`).join('');
    const more = items.length > MAX_SHOWN_ERRORS ? `<li>…и ещё ${items.length - MAX_SHOWN_ERRORS}</li>` : '';
    return `<ul>${shown}${more}</ul>`;
  }

  function showError(errors, filename = '', warnings = []) {
    resultBox.innerHTML = `
      <div class="msg err">
        <b>Файл ${esc(filename)} не импортирован.</b> Найдено ошибок: ${errors.length}.
        Исправьте их и загрузите файл снова. Текущие данные не изменились.
        ${list(errors)}
      </div>
      ${warnings.length ? `<div class="msg warn"><b>Предупреждения:</b>${list(warnings)}</div>` : ''}
    `;
  }

  function showSuccess(units, filename, warnings) {
    resultBox.innerHTML = `
      <div class="msg ok"><b>Готово:</b> из «${esc(filename)}» загружено ${units.length} записей.</div>
      ${warnings.length ? `<div class="msg warn"><b>Предупреждения:</b>${list(warnings)}</div>` : ''}
      <div class="row"><button id="goTable">Открыть таблицу →</button></div>
    `;
    resultBox.querySelector('#goTable').addEventListener('click', () => BPS.app.showTab('table'));
  }

  BPS.modules = BPS.modules || {};
  BPS.modules.import = { render, importText };
})();
