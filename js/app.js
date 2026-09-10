/* Ссылки на соцсети с главного экрана.
   Пустая строка — иконка приглушена и по нажатию говорит, что адреса ещё нет.
   Чтобы включить, впиши сюда полный адрес и всё заработает. */
var SOCIAL = {
  youtube:  '',
  telegram: 'https://t.me/RG89tg',
  whatsapp: '',
  linkedin: ''
};

/* TIME VALUE — сборка экранов и живой счётчик. */
var Fmt = (function () {
  'use strict';
  var nf = {};
  function fmt(v, frac) {
    var k = frac;
    if (!nf[k]) {
      try {
        nf[k] = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: frac, maximumFractionDigits: frac });
      } catch (e) {
        nf[k] = { format: function (x) { return x.toFixed(frac); } };
      }
    }
    return nf[k].format(v);
  }
  return {
    money: function (v, cur, frac) {
      if (!isFinite(v)) v = 0;
      frac = frac === undefined ? (Math.abs(v) >= 100000 ? 0 : 2) : frac;
      var sign = v < 0 ? '−' : '';
      return sign + fmt(Math.abs(v), frac) + ' ' + (cur || '₽');
    },
    round: function (v, frac) { return fmt(isFinite(v) ? v : 0, frac === undefined ? 0 : frac); },
    hours: function (h) {
      if (!isFinite(h) || h <= 0) return '0 ч';
      if (h < 1) return fmt(h * 60, 0) + ' мин';
      if (h < 100) return fmt(h, 1) + ' ч';
      return fmt(h, 0) + ' ч';
    },
    dur: function (sec) {
      sec = Math.max(0, sec || 0);
      var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
      if (h === 0) return m + ' мин';
      return h + ' ч ' + (m < 10 ? '0' : '') + m + ' мин';
    },
    clock: function (d) {
      return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
  };
})();

(function () {
  'use strict';

  var MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  var MON_SHORT = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  var WEEKDAYS = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
  function txt(el, v) { if (el && el.textContent !== v) el.textContent = v; }

  var cur = function () { return Store.settings.currency; };
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    txt(t, msg);
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 2600);
  }

  /* ================= Навигация ================= */
  var view = 'today';
  function go(name) {
    view = name;
    $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-' + name); });
    $$('.tab').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-view') === name); });
    window.scrollTo(0, 0);
    if (name === 'history') renderHistory();
    if (name === 'buy') { renderBuy(); renderPurchases(); }
    if (name === 'hour') renderHour();
    if (name === 'words') renderWords();
  }
  $$('.tab').forEach(function (b) {
    on(b, 'click', function () { go(b.getAttribute('data-view')); });
  });

  /* ================= Циферблат на 24 часа ================= */
  var R = 104, C = 2 * Math.PI * R;

  function buildTicks() {
    var g = $('#dial-ticks'), i, a, r1, x1, y1, x2, y2, el, out = '';
    for (i = 0; i < 24; i++) {
      a = (i / 24) * Math.PI * 2;
      var major = i % 6 === 0;
      r1 = major ? 92 : 96;
      x1 = 120 + r1 * Math.cos(a); y1 = 120 + r1 * Math.sin(a);
      x2 = 120 + 100 * Math.cos(a); y2 = 120 + 100 * Math.sin(a);
      out += '<line class="dial__tick' + (major ? ' dial__tick--h' : '') + '" x1="' +
        x1.toFixed(2) + '" y1="' + y1.toFixed(2) + '" x2="' + x2.toFixed(2) + '" y2="' + y2.toFixed(2) + '"/>';
    }
    g.innerHTML = out;
  }

  function arc(el, from, to) {
    from = Math.max(0, Math.min(1, from));
    to = Math.max(from, Math.min(1, to));
    var len = (to - from) * C;
    el.setAttribute('stroke-dasharray', len.toFixed(2) + ' ' + (C - len).toFixed(2));
    el.setAttribute('stroke-dashoffset', (-from * C).toFixed(2));
    el.style.opacity = len < 0.4 ? 0 : 1;
  }

  /* ================= Экран «Сегодня» ================= */
  var elDate = $('#today-date'), elClock = $('#clock'), elSec = $('#clock-sec'),
      elCap = $('#capital'), elCapNote = $('#capital-note'),
      elHour = $('#t-hour'), elWorked = $('#t-worked'),
      elFill = $('#daybar-fill'), elA = $('#daybar-a'), elB = $('#daybar-b'),
      elBurn = $('#t-burn'), elEarn = $('#t-earned'),
      btnDay = $('#btn-day'), btnReopen = $('#btn-reopen'), elHint = $('#day-hint'),
      arcPass = $('#arc-pass'), arcWork = $('#arc-work'), head = $('#dial-head');

  var lastDateKey = '';

  function renderToday(now) {
    var d = new Date(now);
    var dayKey = Store.key(d);
    if (dayKey !== lastDateKey) {
      lastDateKey = dayKey;
      txt(elDate, (WEEKDAYS[d.getDay()] + ' · ' + d.getDate() + ' ' + MONTHS[d.getMonth()]).toUpperCase());
      Store.sealStaleDays();
      renderWords();
    }

    txt(elClock, Fmt.clock(d));
    txt(elSec, ('0' + d.getSeconds()).slice(-2));

    var dayFrac = (now - Store.midnight(d)) / 86400000;
    arc(arcPass, 0, dayFrac);
    head.setAttribute('transform', 'rotate(' + (dayFrac * 360).toFixed(2) + ' 120 120)');

    var rec = Store.today();
    if (rec.start) {
      var sFrac = (rec.start - Store.midnight(d)) / 86400000;
      var eFrac = ((rec.close || now) - Store.midnight(d)) / 86400000;
      arc(arcWork, sFrac, eFrac);
    } else {
      arc(arcWork, 0, 0);
    }

    var live = Store.liveCapital(now);
    var neg = live.capital < 0;
    txt(elCap, Fmt.money(live.capital, cur()));
    elCap.classList.toggle('is-neg', neg);
    txt(elCapNote, rec.start && !rec.close
      ? 'заработок идёт, расход горит круглосуточно'
      : 'расход горит круглосуточно, заработок ждёт начала дня');

    txt(elHour, Fmt.money(Store.hourValue(), cur(), 0));
    var worked = Store.workedSeconds(rec, now);
    txt(elWorked, Fmt.dur(worked));
    txt(elBurn, Fmt.money(live.burned, cur()) + ' из ' + Fmt.money(Store.dailyExpense(), cur(), 0));
    txt(elEarn, Fmt.money(live.earned, cur()));

    var plan = Math.max(0.5, Store.num(Store.settings.hoursPerDay)) * 3600;
    var pct = Math.max(0, Math.min(1, worked / plan));
    elFill.style.width = (pct * 100).toFixed(2) + '%';
    txt(elA, rec.start ? 'начало ' + Fmt.clock(new Date(rec.start)) : 'день не начат');
    txt(elB, Fmt.round(pct * 100, 0) + '% от плана');

    if (!rec.start) {
      txt(btnDay, 'Начать день');
      btnDay.disabled = false;
      btnReopen.classList.add('is-hidden');
      txt(elHint, 'Одно касание утром — и день пошёл. Ритуал занимает пять секунд.');
    } else if (!rec.close) {
      txt(btnDay, 'Закрыть день');
      btnDay.disabled = false;
      btnReopen.classList.add('is-hidden');
      txt(elHint, 'День идёт. Закрой его вечером, чтобы не разорвать линию.');
    } else {
      txt(btnDay, 'День закрыт');
      btnDay.disabled = true;
      btnReopen.classList.remove('is-hidden');
      txt(elHint, 'Итог записан. Завтра счётчик начнётся заново.');
    }
  }

  on(btnDay, 'click', function () {
    var rec = Store.today();
    if (!rec.start) { Store.startDay(); toast('День начат'); }
    else if (!rec.close) { Store.closeDay(); toast('День закрыт. Серия: ' + Store.streak()); }
    renderToday(Date.now());
    renderHistory();
  });
  on(btnReopen, 'click', function () {
    Store.reopenDay();
    toast('День открыт заново');
    renderToday(Date.now());
    renderHistory();
  });

  /* ================= Экран «Час» ================= */
  var fIncome = $('#f-income'), fPeriod = $('#f-period'), fExp = $('#f-expenses'),
      fHours = $('#f-hours'), fDays = $('#f-days');

  function fillHourInputs() {
    var s = Store.settings;
    fIncome.value = s.income;
    fPeriod.value = s.incomePeriod;
    fExp.value = s.expenses;
    fHours.value = s.hoursPerDay;
    fDays.value = s.daysPerWeek;
  }

  function renderHour() {
    var hv = Store.hourValue(), net = Store.netHourValue(), s = Store.settings;
    txt($('#r-hour'), Fmt.money(hv, cur(), 0));
    txt($('#r-min'), Fmt.money(hv / 60, cur()));
    txt($('#r-day'), Fmt.money(hv * Store.num(s.hoursPerDay), cur(), 0));
    txt($('#r-week'), Fmt.money(hv * Store.num(s.hoursPerDay) * Store.num(s.daysPerWeek), cur(), 0));
    txt($('#r-net'), Fmt.money(net, cur(), 0));
    txt($('#r-hpm'), Fmt.round(Store.hoursPerMonth(), 0) + ' ч');
    txt($('#r-warn'), net <= 0
      ? 'Расходы съедают доход целиком. Час чистыми уходит в минус — это и есть тот факт, ради которого нужен счётчик.'
      : 'Чистыми ты оставляешь себе ' + Fmt.round(hv > 0 ? (net / hv) * 100 : 0, 0) + '% от стоимости часа.');
  }

  function bindHourInputs() {
    [[fIncome, 'income'], [fExp, 'expenses'], [fHours, 'hoursPerDay'], [fDays, 'daysPerWeek']].forEach(function (p) {
      on(p[0], 'input', function () {
        Store.settings[p[1]] = Store.num(p[0].value);
        Store.save();
        renderHour(); renderBuy(); renderPurchases();
      });
    });
    on(fPeriod, 'change', function () {
      Store.settings.incomePeriod = fPeriod.value;
      Store.save();
      renderHour(); renderBuy();
    });
  }

  /* ================= Экран «Покупка» ================= */
  var bTitle = $('#b-title'), bPrice = $('#b-price'), bSave = $('#b-save');

  function renderBuy() {
    var price = Store.num(bPrice.value), hv = Store.hourValue(), net = Store.netHourValue(), s = Store.settings;
    var hours = hv > 0 ? price / hv : 0;
    txt($('#b-hours'), Fmt.hours(hours));
    txt($('#b-days'), Fmt.round(hours / Math.max(0.5, Store.num(s.hoursPerDay)), 1));
    txt($('#b-weeks'), Fmt.round(hours / Math.max(0.5, Store.num(s.hoursPerDay)) / Math.max(1, Store.num(s.daysPerWeek)), 1));
    txt($('#b-net'), net > 0 ? Fmt.hours(price / net) : 'расходы выше дохода');
    bSave.disabled = !(price > 0);
  }

  function renderPurchases() {
    var list = $('#b-list'), items = Store.state.purchases, s = Store.settings;
    list.innerHTML = '';
    $('#b-empty').classList.toggle('is-hidden', items.length > 0);
    items.forEach(function (p) {
      var hv = p.hourValue > 0 ? p.hourValue : Store.hourValue();
      var hours = hv > 0 ? p.price / hv : 0;
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.className = 'list__name';
      name.textContent = p.title;
      var sub = document.createElement('span');
      sub.className = 'list__sub';
      sub.textContent = Fmt.money(p.price, s.currency, 0) + ' · час по ' + Fmt.money(hv, s.currency, 0);
      name.appendChild(sub);
      var val = document.createElement('span');
      val.className = 'list__val';
      val.textContent = Fmt.hours(hours);
      var del = document.createElement('button');
      del.className = 'del';
      del.type = 'button';
      del.setAttribute('aria-label', 'Удалить расчёт');
      del.textContent = '×';
      on(del, 'click', function () { Store.removePurchase(p.id); renderPurchases(); });
      li.appendChild(name); li.appendChild(val); li.appendChild(del);
      list.appendChild(li);
    });
  }

  on(bPrice, 'input', renderBuy);
  on(bSave, 'click', function () {
    var price = Store.num(bPrice.value);
    if (!(price > 0)) return;
    Store.addPurchase((bTitle.value || '').trim() || 'Покупка', price);
    bTitle.value = ''; bPrice.value = '';
    renderBuy(); renderPurchases();
    toast('Расчёт сохранён');
  });

  /* ================= Экран «История» ================= */
  var range = 14;
  $$('.seg__b[data-range]').forEach(function (b) {
    on(b, 'click', function () {
      range = parseInt(b.getAttribute('data-range'), 10);
      $$('.seg__b[data-range]').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      renderHistory();
    });
  });

  function renderHistory() {
    var box = $('#ribbon'), i, d = new Date(), rows = [], maxAbs = 0, best = Store.bestDay();
    for (i = 0; i < range; i++) {
      var dd = new Date();
      dd.setDate(d.getDate() - i);
      var k = Store.key(dd);
      var rec = Store.state.days[k];
      var v = Store.dayCapital(k);
      if (v !== null) maxAbs = Math.max(maxAbs, Math.abs(v));
      rows.push({ key: k, date: dd, rec: rec, value: v });
    }
    box.innerHTML = '';
    rows.forEach(function (r) {
      var li = document.createElement('li');
      var isToday = r.key === Store.key();
      if (isToday) li.className = 'is-today';
      if (best && best.date === r.key) li.className += ' is-best';

      var lbl = document.createElement('span');
      lbl.className = 'ribbon__date';
      lbl.textContent = isToday ? 'сегодня' : (r.date.getDate() + ' ' + MON_SHORT[r.date.getMonth()]);

      var track = document.createElement('span');
      track.className = 'ribbon__track';
      var val = document.createElement('span');
      val.className = 'ribbon__val';

      if (r.value === null || !r.rec || !r.rec.start) {
        var gap = document.createElement('span');
        gap.className = 'ribbon__gap';
        track.appendChild(gap);
        val.className += ' is-gap';
        val.textContent = isToday ? 'не начат' : 'разрыв';
      } else if (r.rec.autoClosed) {
        /* День не закрыли вручную: линия рвётся, но цифра остаётся. */
        var gap2 = document.createElement('span');
        gap2.className = 'ribbon__gap';
        track.appendChild(gap2);
        val.className += ' is-open';
        val.textContent = Fmt.money(r.value, cur(), 0);
      } else {
        var bar = document.createElement('span');
        bar.className = 'ribbon__bar' + (r.value < 0 ? ' is-neg' : '');
        var w = maxAbs > 0 ? Math.max(3, (Math.abs(r.value) / maxAbs) * 100) : 3;
        bar.style.width = w.toFixed(1) + '%';
        track.appendChild(bar);
        if (r.value < 0) val.className += ' is-neg';
        val.textContent = Fmt.money(r.value, cur(), 0);
      }
      li.appendChild(lbl); li.appendChild(track); li.appendChild(val);
      box.appendChild(li);
    });

    txt($('#s-streak'), String(Store.streak()));
    txt($('#s-closed'), String(Store.closedCount()));
    txt($('#s-best'), best ? Fmt.money(best.value, cur(), 0) : '—');
    txt($('#hist-note'), 'Разрыв — день, который не начали или не закрыли до полуночи. Линия чинится следующим закрытым днём.');
  }

  /* ================= Экран «Фразы» ================= */
  var wordsMode = 'all', wordsShown = 40;

  function todayQuoteIndex() { return (Store.dayOfYear() - 1) % QUOTES.length; }

  function markSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.5 5.4 5.9.7-4.4 4 1.2 5.8-5.2-3-5.2 3 1.2-5.8-4.4-4 5.9-.7z"/></svg>';
  }

  function renderWords() {
    var i = todayQuoteIndex();
    txt($('#quote-text'), QUOTES[i]);
    txt($('#quote-num'), 'ДЕНЬ ' + (i + 1) + ' ИЗ 365');
    $('#quote-fav').setAttribute('aria-pressed', Store.isFav(i) ? 'true' : 'false');

    var list = $('#words-list'), src = [], n;
    if (wordsMode === 'fav') {
      src = Store.state.favorites.slice().sort(function (a, b) { return a - b; });
    } else {
      src = [];
      for (n = 0; n < QUOTES.length; n++) src.push(n);
    }
    $('#words-empty').classList.toggle('is-hidden', !(wordsMode === 'fav' && src.length === 0));

    var slice = src.slice(0, wordsShown);
    list.innerHTML = '';
    slice.forEach(function (idx) {
      var li = document.createElement('li');
      if (idx === i) li.className = 'is-today';
      var num = document.createElement('span');
      num.className = 'words__n';
      num.textContent = idx + 1;
      var t = document.createElement('span');
      t.className = 'words__t';
      t.textContent = QUOTES[idx];
      var b = document.createElement('button');
      b.className = 'markbtn';
      b.type = 'button';
      b.setAttribute('aria-label', 'В избранное');
      b.setAttribute('aria-pressed', Store.isFav(idx) ? 'true' : 'false');
      b.innerHTML = markSvg();
      on(b, 'click', function () {
        var added = Store.toggleFav(idx);
        b.setAttribute('aria-pressed', added ? 'true' : 'false');
        if (idx === i) $('#quote-fav').setAttribute('aria-pressed', added ? 'true' : 'false');
        if (wordsMode === 'fav' && !added) renderWords();
        toast(added ? 'В избранном' : 'Убрано из избранного');
      });
      li.appendChild(num); li.appendChild(t); li.appendChild(b);
      list.appendChild(li);
    });
    $('#words-more').classList.toggle('is-hidden', slice.length >= src.length);
  }

  on($('#quote-fav'), 'click', function () {
    var i = todayQuoteIndex();
    var added = Store.toggleFav(i);
    $('#quote-fav').setAttribute('aria-pressed', added ? 'true' : 'false');
    renderWords();
    toast(added ? 'В избранном' : 'Убрано из избранного');
  });
  $$('.seg__b[data-words]').forEach(function (b) {
    on(b, 'click', function () {
      wordsMode = b.getAttribute('data-words');
      wordsShown = 40;
      $$('.seg__b[data-words]').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      renderWords();
    });
  });
  on($('#words-more'), 'click', function () { wordsShown += 60; renderWords(); });

  /* ================= Настройки ================= */
  var sheet = $('#sheet'), scrim = $('#scrim');
  function openSheet() {
    sheet.hidden = false; scrim.hidden = false;
    document.body.style.overflow = 'hidden';
    syncSettings();
  }
  function closeSheet() {
    sheet.hidden = true; scrim.hidden = true;
    document.body.style.overflow = '';
  }
  on($('#open-settings'), 'click', openSheet);
  on($('#sheet-close'), 'click', closeSheet);
  on(scrim, 'click', closeSheet);
  on(document, 'keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

  function syncSettings() {
    var s = Store.settings;
    $$('#chips-currency .chip').forEach(function (c) {
      c.classList.toggle('is-on', c.getAttribute('data-cur') === s.currency);
    });
    $$('#chips-variant .chip').forEach(function (c) {
      c.classList.toggle('is-on', c.getAttribute('data-variant') === s.variant);
    });
    $('#n-enabled').checked = !!s.notif.enabled;
    $('#n-morning').value = s.notif.morning;
    $('#n-evening').value = s.notif.evening;
    txt($('#n-status'), Notify.status());
  }

  $$('#chips-currency .chip').forEach(function (c) {
    on(c, 'click', function () {
      Store.settings.currency = c.getAttribute('data-cur');
      Store.save(); syncSettings();
      renderHour(); renderBuy(); renderPurchases(); renderHistory(); renderToday(Date.now());
    });
  });
  $$('#chips-variant .chip').forEach(function (c) {
    on(c, 'click', function () {
      Store.settings.variant = c.getAttribute('data-variant');
      document.body.setAttribute('data-variant', Store.settings.variant);
      Store.save(); syncSettings();
    });
  });

  on($('#n-enabled'), 'change', function (e) {
    if (e.target.checked) {
      Notify.enable(function (ok, err) {
        e.target.checked = ok;
        txt($('#n-status'), ok ? Notify.status() : (err || Notify.status()));
        if (ok) toast('Напоминания включены');
      });
    } else {
      Notify.disable();
      txt($('#n-status'), Notify.status());
    }
  });
  on($('#n-morning'), 'change', function (e) {
    Store.settings.notif.morning = e.target.value || '08:30';
    Store.save(); Notify.schedule();
  });
  on($('#n-evening'), 'change', function (e) {
    Store.settings.notif.evening = e.target.value || '21:30';
    Store.save(); Notify.schedule();
  });
  on($('#n-test'), 'click', function () {
    if (!Notify.granted()) {
      Notify.enable(function (ok) {
        if (ok) Notify.show('evening'); else toast('Разрешение не выдано');
        syncSettings();
      });
    } else {
      Notify.show('evening');
      toast('Отправлено');
    }
  });

  on($('#d-export'), 'click', function () {
    var data = JSON.stringify(Store.state, null, 2);
    try {
      var blob = new Blob([data], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'timevalue-' + Store.key() + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('Файл выгружен');
    } catch (e) { toast('Браузер не дал сохранить файл'); }
  });

  on($('#d-reset'), 'click', function () {
    if (!window.confirm('Стереть все дни, покупки и избранное? Это нельзя отменить.')) return;
    Store.reset();
    document.body.setAttribute('data-variant', Store.settings.variant);
    fillHourInputs(); syncSettings();
    renderHour(); renderBuy(); renderPurchases(); renderHistory(); renderWords();
    lastDateKey = '';
    renderToday(Date.now());
    closeSheet();
    toast('Данные стёрты');
  });

  /* ================= Соцсети ================= */
  function bindSocial() {
    $$('.social__a').forEach(function (a) {
      var name = a.getAttribute('data-social');
      var label = a.getAttribute('data-label') || name;
      var url = SOCIAL[name] || '';
      if (url) {
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        return;
      }
      /* Ссылки пока нет. Иконка остаётся нажимаемой и с клавиатуры тоже:
         aria-disabled здесь был бы неверен — кнопка работает, просто говорит,
         что адреса ещё нет. Состояние вынесено в подпись. */
      a.classList.add('is-off');
      a.setAttribute('role', 'button');
      a.setAttribute('tabindex', '0');
      a.setAttribute('aria-label', label + ' — адрес пока не указан');
      function explain(e) {
        e.preventDefault();
        toast('Адрес ' + label + ' пока не указан');
      }
      on(a, 'click', explain);
      on(a, 'keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') explain(e);
      });
    });
  }

  /* ================= Установка на телефон ================= */
  var deferredPrompt = null;

  function installed() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }
  function inFrame() {
    try { return window.top !== window.self; } catch (e) { return true; }
  }
  function installDismissed() {
    try { return localStorage.getItem('timevalue.install.no') === '1'; } catch (e) { return false; }
  }

  function renderInstall() {
    var box = $('#install');
    if (!box) return;
    if (installed() || inFrame() || installDismissed()) { box.hidden = true; return; }

    var ios = /iP(hone|ad|od)/.test(navigator.userAgent);
    if (deferredPrompt) {
      txt($('#install-text'), 'Поставь на экран «Домой» — приложение откроется на весь экран и будет работать без сети.');
      $('#install-go').hidden = false;
      txt($('#install-no'), 'Не сейчас');
    } else if (ios) {
      txt($('#install-text'), 'Нажми «Поделиться» внизу Safari и выбери «На экран „Домой“». Приложение откроется на весь экран и будет работать без сети.');
      $('#install-go').hidden = true;
      txt($('#install-no'), 'Понятно');
    } else {
      txt($('#install-text'), 'Открой меню браузера и выбери «Установить приложение». Оно откроется на весь экран и будет работать без сети.');
      $('#install-go').hidden = true;
      txt($('#install-no'), 'Понятно');
    }
    box.hidden = false;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    renderInstall();
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    $('#install').hidden = true;
    toast('Приложение установлено');
  });
  on($('#install-go'), 'click', function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () {
      deferredPrompt = null;
      renderInstall();
    });
  });
  on($('#install-no'), 'click', function () {
    try { localStorage.setItem('timevalue.install.no', '1'); } catch (e) {}
    $('#install').hidden = true;
  });

  /* ================= Живой цикл ================= */
  var lastTick = 0;
  function loop(ts) {
    var now = Date.now();
    if (now - lastTick >= 90) {
      lastTick = now;
      if (view === 'today') renderToday(now);
    }
    requestAnimationFrame(loop);
  }

  /* ================= Старт ================= */
  function init() {
    Store.load();
    Store.sealStaleDays();
    document.body.setAttribute('data-variant', Store.settings.variant);
    buildTicks();
    fillHourInputs();
    bindHourInputs();
    renderHour(); renderBuy(); renderPurchases(); renderWords(); renderHistory();
    renderToday(Date.now());
    renderInstall();
    bindSocial();
    requestAnimationFrame(loop);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        Store.sealStaleDays();
        renderToday(Date.now());
        if (view === 'history') renderHistory();
        Notify.catchUp();
        Notify.schedule();
      }
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        Notify.setReg(reg);
        Notify.catchUp();
        Notify.schedule();
      }).catch(function () {
        Notify.catchUp();
        Notify.schedule();
      });
    } else {
      Notify.catchUp();
      Notify.schedule();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
