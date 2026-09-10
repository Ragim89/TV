/* Хранилище и расчёты. Всё живёт в localStorage этого устройства. */
var Store = (function () {
  'use strict';

  var KEY = 'timevalue.v1';
  var WEEKS_PER_MONTH = 4.333;
  var DAYS_PER_MONTH = 30.44;

  var DEFAULTS = {
    settings: {
      currency: '₽',
      income: 300000,
      incomePeriod: 'month',
      expenses: 120000,
      hoursPerDay: 8,
      daysPerWeek: 5,
      variant: 'steel',
      notif: { enabled: false, morning: '08:30', evening: '21:30', lastMorning: '', lastEvening: '' }
    },
    days: {},
    purchases: [],
    favorites: [],
    createdAt: 0
  };

  var state = null;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function merge(base, saved) {
    var out = clone(base), k;
    if (!saved || typeof saved !== 'object') return out;
    for (k in saved) {
      if (!Object.prototype.hasOwnProperty.call(saved, k)) continue;
      if (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) &&
          saved[k] && typeof saved[k] === 'object' && !Array.isArray(saved[k])) {
        out[k] = merge(out[k], saved[k]);
      } else if (saved[k] !== undefined && saved[k] !== null) {
        out[k] = saved[k];
      }
    }
    return out;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    var saved = null;
    if (raw) { try { saved = JSON.parse(raw); } catch (e) { saved = null; } }
    state = merge(DEFAULTS, saved);
    if (!state.createdAt) state.createdAt = Date.now();
    save();
    return state;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* приватный режим */ }
  }

  /* ---------- даты ---------- */
  function key(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function fromKey(k) {
    var p = k.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function midnight(d) {
    d = d || new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }
  function dayOfYear(d) {
    d = d || new Date();
    return Math.floor((midnight(d) - midnight(new Date(d.getFullYear(), 0, 1))) / 86400000) + 1;
  }

  /* ---------- деньги и часы ---------- */
  function monthlyIncome() {
    var s = state.settings, v = num(s.income);
    if (s.incomePeriod === 'year') return v / 12;
    if (s.incomePeriod === 'week') return v * WEEKS_PER_MONTH;
    return v;
  }
  /* Поля с разрядами приходят как «120 000», а запятую в дробях набирают чаще точки. */
  function num(v) {
    if (typeof v === 'string') v = v.replace(/[\s\u00A0\u202F]/g, '').replace(',', '.');
    v = parseFloat(v);
    return isFinite(v) ? v : 0;
  }

  function hoursPerMonth() {
    var s = state.settings;
    var h = Math.min(24, Math.max(0.5, num(s.hoursPerDay)));
    var d = Math.min(7, Math.max(1, num(s.daysPerWeek)));
    return h * d * WEEKS_PER_MONTH;
  }
  function hourValue() {
    var hpm = hoursPerMonth();
    return hpm > 0 ? monthlyIncome() / hpm : 0;
  }
  function netHourValue() {
    var hpm = hoursPerMonth();
    return hpm > 0 ? (monthlyIncome() - num(state.settings.expenses)) / hpm : 0;
  }
  function dailyExpense() { return num(state.settings.expenses) / DAYS_PER_MONTH; }

  /* ---------- день ---------- */
  function today() {
    var k = key();
    if (!state.days[k]) state.days[k] = { start: 0, close: 0, worked: 0, capital: null };
    return state.days[k];
  }
  /* Отработанные секунды: накопленное плюс идущий отрезок. */
  function workedSeconds(rec, now) {
    rec = rec || today();
    var acc = rec.worked || 0;
    if (rec.start && !rec.close) acc += Math.max(0, ((now || Date.now()) - rec.start) / 1000);
    return acc;
  }
  /* Счётчик за сутки: заработок идёт, пока день открыт; расход горит круглосуточно. */
  function liveCapital(now) {
    now = now || Date.now();
    var earned = (workedSeconds(null, now) / 3600) * hourValue();
    var burned = dailyExpense() * ((now - midnight()) / 86400000);
    return { earned: earned, burned: burned, capital: earned - burned };
  }

  function startDay() {
    var rec = today();
    if (rec.start && !rec.close) return rec;
    rec.start = Date.now();
    rec.close = 0;
    save();
    return rec;
  }
  function closeDay() {
    var rec = today();
    if (!rec.start || rec.close) return rec;
    rec.worked = workedSeconds(rec, Date.now());
    rec.close = Date.now();
    rec.capital = liveCapital(rec.close).capital;
    save();
    return rec;
  }
  function reopenDay() {
    var rec = today();
    if (!rec.close) return rec;
    rec.close = 0;
    rec.capital = null;
    if (!rec.start) rec.start = Date.now();
    else rec.start = Date.now();
    save();
    return rec;
  }
  /* Открытый вчерашний день закрывается сам: серия рвётся, но счётчик не врёт. */
  function sealStaleDays() {
    var tk = key(), k, rec, changed = false;
    for (k in state.days) {
      if (!Object.prototype.hasOwnProperty.call(state.days, k)) continue;
      rec = state.days[k];
      if (k === tk || rec.close || !rec.start) continue;
      var endOfDay = midnight(fromKey(k)) + 86400000;
      rec.worked = (rec.worked || 0) + Math.max(0, Math.min(endOfDay, Date.now()) - rec.start) / 1000;
      rec.close = endOfDay;
      rec.capital = (rec.worked / 3600) * hourValue() - dailyExpense();
      rec.autoClosed = true;
      changed = true;
    }
    if (changed) save();
  }

  function dayCapital(k) {
    var rec = state.days[k];
    if (!rec || !rec.start) return null;
    if (rec.close) {
      return rec.capital !== null && rec.capital !== undefined
        ? rec.capital
        : (workedSeconds(rec, rec.close) / 3600) * hourValue() - dailyExpense();
    }
    return liveCapital().capital;
  }

  function streak() {
    var n = 0, d = new Date();
    if (!(state.days[key(d)] || {}).close) d.setDate(d.getDate() - 1);
    while (true) {
      var rec = state.days[key(d)];
      if (rec && rec.close && !rec.autoClosed) { n++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return n;
  }
  function closedCount() {
    var n = 0, k;
    for (k in state.days) if (state.days[k] && state.days[k].close) n++;
    return n;
  }
  function bestDay() {
    var best = null, k, v;
    for (k in state.days) {
      if (!state.days[k] || !state.days[k].close) continue;
      v = dayCapital(k);
      if (v === null) continue;
      if (!best || v > best.value) best = { date: k, value: v };
    }
    return best;
  }

  /* ---------- покупки ---------- */
  function addPurchase(title, price, date) {
    state.purchases.unshift({
      id: String(Date.now()) + Math.random().toString(36).slice(2, 7),
      title: title || 'Без названия',
      price: num(price),
      hourValue: hourValue(),
      date: date || key(),
      at: Date.now()
    });
    /* Свежая покупка сверху: сначала по дате, при равной дате — по времени записи. */
    state.purchases.sort(function (a, b) {
      var ad = a.date || key(new Date(a.at)), bd = b.date || key(new Date(b.at));
      if (ad !== bd) return ad < bd ? 1 : -1;
      return b.at - a.at;
    });
    if (state.purchases.length > 200) state.purchases.length = 200;
    save();
  }
  function removePurchase(id) {
    state.purchases = state.purchases.filter(function (p) { return p.id !== id; });
    save();
  }

  /* ---------- избранное ---------- */
  function isFav(i) { return state.favorites.indexOf(i) !== -1; }
  function toggleFav(i) {
    var at = state.favorites.indexOf(i);
    if (at === -1) state.favorites.push(i); else state.favorites.splice(at, 1);
    save();
    return at === -1;
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    state = clone(DEFAULTS);
    state.createdAt = Date.now();
    save();
  }

  return {
    load: load, save: save, reset: reset,
    get state() { return state; },
    get settings() { return state.settings; },
    key: key, fromKey: fromKey, midnight: midnight, dayOfYear: dayOfYear,
    monthlyIncome: monthlyIncome, hoursPerMonth: hoursPerMonth,
    hourValue: hourValue, netHourValue: netHourValue, dailyExpense: dailyExpense,
    today: today, workedSeconds: workedSeconds, liveCapital: liveCapital,
    startDay: startDay, closeDay: closeDay, reopenDay: reopenDay, sealStaleDays: sealStaleDays,
    dayCapital: dayCapital, streak: streak, closedCount: closedCount, bestDay: bestDay,
    addPurchase: addPurchase, removePurchase: removePurchase,
    isFav: isFav, toggleFav: toggleFav,
    num: num
  };
})();
