// Точка входа: переключение вкладок, тема, запуск модулей.
(function () {
  const TAB_KEY = 'bps.tab';
  const THEME_KEY = 'bps.theme';

  function showTab(name) {
    document.querySelectorAll('#tabs button').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.panel').forEach(p =>
      p.classList.toggle('active', p.id === 'tab-' + name));
    try { localStorage.setItem(TAB_KEY, name); } catch (e) {}
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    document.dispatchEvent(new Event('bps:theme')); // графики перекрашиваются
  }

  function init() {
    // Навигацию подключаем ПЕРВОЙ: даже если какой-то модуль упадёт, вкладки продолжат переключаться
    document.getElementById('tabs').addEventListener('click', e => {
      const btn = e.target.closest('button[data-tab]');
      if (btn) showTab(btn.dataset.tab);
    });

    // Каждый модуль рисует себя в своей секции. Ошибка в одном модуле не ломает остальные.
    for (const [name, mod] of Object.entries(BPS.modules)) {
      const el = document.getElementById('tab-' + name);
      if (!el) continue;
      try {
        mod.render(el);
      } catch (err) {
        console.error(`Модуль «${name}» не запустился:`, err);
        el.innerHTML = `<div class="msg err"><b>Эта вкладка не загрузилась.</b>
          Обновите страницу с очисткой кэша (Ctrl+Shift+R / Cmd+Shift+R).
          <div class="muted" style="margin-top:4px">${BPS.utils.esc(err.message)}</div></div>`;
      }
    }

    // Тема: сохранённая или системная
    let theme;
    try { theme = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (!theme) theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(theme);
    document.getElementById('themeToggle').addEventListener('click', () =>
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

    // Открываем последнюю вкладку
    let last;
    try { last = localStorage.getItem(TAB_KEY); } catch (e) {}
    showTab(last && document.getElementById('tab-' + last) ? last : 'import');
  }

  BPS.app = { showTab };
  document.addEventListener('DOMContentLoaded', init);
})();
