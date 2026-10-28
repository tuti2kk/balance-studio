// Единое хранилище данных приложения + автосохранение в localStorage.
// Модули не трогают localStorage напрямую — только через BPS.store.
(function () {
  const KEY = 'bps.state.v1';

  const defaults = () => ({
    units: [],          // юниты/предметы: [{id, name, hp, attack, defense, cost, ...}]
    unitsSource: null,  // имя файла, из которого импортировали
    ttk: { attackerId: null, targetId: null, multiplier: 1, critChance: 10, critMult: 2, interval: 1 },
    progression: { base: 100, power: 1.5, linear: 0, maxLevel: 30 },
    audit: { strong: 1.3, weak: 0.7 },
    loot: [],         // [{table, item, chance, min, max}]
    lootSource: null,
  });

  let state = load();
  const listeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const saved = JSON.parse(raw), d = defaults();
      // Вложенные настройки сливаем с дефолтами, чтобы новые поля появлялись и у старых сохранений
      return { ...d, ...saved,
        ttk: { ...d.ttk, ...saved.ttk },
        progression: { ...d.progression, ...saved.progression },
        audit: { ...d.audit, ...saved.audit } };
    } catch (e) {
      console.warn('Не удалось прочитать сохранение, начинаю с пустых данных', e);
      return defaults();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Не удалось сохранить в localStorage', e);
    }
  }

  BPS.store = {
    get() { return state; },

    // Изменить часть состояния, сохранить и оповестить подписчиков
    set(patch) {
      state = { ...state, ...patch };
      save();
      listeners.forEach(fn => fn(state));
    },

    // Подписка на изменения (вкладки перерисовываются сами)
    subscribe(fn) { listeners.push(fn); },

    reset() {
      state = defaults();
      save();
      listeners.forEach(fn => fn(state));
    },
  };
})();
