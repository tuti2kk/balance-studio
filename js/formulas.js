// Все игровые формулы в одном месте. Чистые функции: числа на вход, числа на выход.
// Именно их нужно проверять вручную для отчёта.
(function () {
  // Погрешность для сравнения дробных чисел (0.1 + 0.2 !== 0.3 в JS)
  const EPS = 1e-9;

  // ---------------- Урон ----------------
  // Формула «процентная броня»: урон = атака × множитель × 100 / (100 + защита)
  // Защита 100 режет урон вдвое, 200 — втрое. Урон никогда не падает до 0.
  function damage(attack, defense, multiplier = 1) {
    return attack * multiplier * 100 / (100 + defense);
  }

  // Средний урон с учётом критов: с шансом p удар наносит critMult × урон
  function expectedDamage(dmg, critChancePct, critMult) {
    const p = critChancePct / 100;
    return dmg * (1 + p * (critMult - 1));
  }

  // Сколько ударов нужно, чтобы снять hp. EPS защищает от ошибок округления:
  // атака 12, защита 12 → урон 75/7 = 10.714…; hp 75 / урон = 7.000000000000001 в JS,
  // и Math.ceil без поправки выдал бы 8 ударов вместо правильных 7.
  function hitsToKill(hp, dmgPerHit) {
    if (dmgPerHit <= 0) return Infinity;
    return Math.max(1, Math.ceil(hp / dmgPerHit - EPS));
  }

  // Время до убийства: удар наносится в конце каждого интервала
  function ttk(hits, interval) {
    return hits * interval;
  }

  // Полный расчёт для пары «атакующий → цель»
  function duel(attacker, target, s) {
    const base = damage(attacker.attack, target.defense, s.multiplier);
    const crit = base * s.critMult;
    const avg = expectedDamage(base, s.critChance, s.critMult);
    const hitsNoCrit = hitsToKill(target.hp, base);
    const hitsAllCrit = hitsToKill(target.hp, crit);
    const hitsAvg = hitsToKill(target.hp, avg);
    return {
      base, crit, avg,
      hitsNoCrit, hitsAllCrit, hitsAvg,
      ttkNoCrit: ttk(hitsNoCrit, s.interval),
      ttkAllCrit: ttk(hitsAllCrit, s.interval),
      ttkAvg: ttk(hitsAvg, s.interval),
    };
  }

  // ---------------- Прогрессия ----------------
  // Опыт, нужный для перехода с уровня L на L+1: base × L^power + linear × L (округляем)
  function xpToNext(level, p) {
    return Math.round(p.base * Math.pow(level, p.power) + p.linear * level);
  }

  // Таблица уровней: сколько нужно до следующего и сколько всего накоплено к уровню
  function levelTable(p) {
    const rows = [];
    let total = 0;
    for (let L = 1; L <= p.maxLevel; L++) {
      const need = L < p.maxLevel ? xpToNext(L, p) : 0;
      rows.push({ level: L, xpToNext: need, totalXp: total });
      total += need;
    }
    return rows;
  }

  // ---------------- Лут ----------------
  // Проверка одной таблицы дропа: сумма шансов должна быть ровно 100%
  function lootSum(rows) {
    const sum = rows.reduce((s, r) => s + (typeof r.chance === 'number' ? r.chance : 0), 0);
    return Math.round(sum * 1e6) / 1e6; // убираем хвосты вида 99.99999999
  }
  function lootSumOk(sum) {
    return Math.abs(sum - 100) < 1e-6;
  }

  // ---------------- Аудит баланса ----------------
  // Эффективное здоровье: сколько «чистого» урона юнит выдержит с учётом защиты
  function effectiveHp(u) {
    return u.hp * (100 + u.defense) / 100;
  }
  // Боевая сила = атака × эффективное здоровье (бьёт сильнее И живёт дольше → сильнее)
  function power(u) {
    return u.attack * effectiveHp(u);
  }
  function median(nums) {
    const s = [...nums].sort((a, b) => a - b), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  // Ценность = сила / цена; сравниваем с медианой по всем юнитам.
  // ratio 1.0 — «как у типичного юнита», 1.5 — на 50% выгоднее, 0.5 — вдвое хуже.
  function audit(units, ttkSettings, th) {
    const rows = units.map(u => {
      const p = power(u);
      const value = u.cost > 0 ? p / u.cost : Infinity;
      // Процент побед в дуэлях один на один против всех остальных (ничья = половина победы)
      let wins = 0, games = 0;
      for (const o of units) {
        if (o === u) continue;
        const me = duel(u, o, ttkSettings).ttkAvg, them = duel(o, u, ttkSettings).ttkAvg;
        wins += me < them ? 1 : me === them ? 0.5 : 0;
        games++;
      }
      return { unit: u, ehp: effectiveHp(u), power: p, value, winRate: games ? wins / games * 100 : 0 };
    });
    const med = median(rows.map(r => r.value).filter(isFinite));
    for (const r of rows) {
      r.ratio = med > 0 ? r.value / med : 1;
      r.verdict = r.ratio >= th.strong ? 'strong' : r.ratio <= th.weak ? 'weak' : 'ok';
    }
    return { rows, median: med };
  }

  BPS.formulas = { effectiveHp, power, median, audit, damage, expectedDamage, hitsToKill, ttk, duel, xpToNext, levelTable, lootSum, lootSumOk };
})();
