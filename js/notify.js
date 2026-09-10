/* Напоминания: два в день, утреннее и вечернее.
   Честно о механике: без сервера пуш-сообщений система будит приложение
   только пока оно открыто или свёрнуто в фон. Пропущенное напоминание
   показывается при следующем открытии, если с его времени прошло меньше трёх часов. */
var Notify = (function () {
  'use strict';

  var GRACE_MS = 3 * 3600 * 1000;
  var timers = [];
  var swReg = null;

  function supported() { return typeof window !== 'undefined' && 'Notification' in window; }
  function granted() { return supported() && Notification.permission === 'granted'; }
  function denied() { return supported() && Notification.permission === 'denied'; }

  function setReg(reg) { swReg = reg; }

  function parseTime(hhmm) {
    var p = String(hhmm || '').split(':');
    var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
    return { h: isFinite(h) ? h : 9, m: isFinite(m) ? m : 0 };
  }

  function atToday(hhmm) {
    var t = parseTime(hhmm), d = new Date();
    d.setHours(t.h, t.m, 0, 0);
    return d.getTime();
  }

  function show(kind) {
    if (!granted()) return;
    var s = Store.settings;
    var body, title;
    if (kind === 'morning') {
      title = 'Во сколько сегодня начинаем?';
      body = 'Одно касание — и день пошёл.';
    } else {
      var rec = Store.today();
      var live = Store.liveCapital();
      title = rec.close ? 'День закрыт' : 'День ещё открыт';
      body = 'Капитал за сутки: ' + Fmt.money(live.capital, s.currency);
    }
    var opts = {
      body: body,
      tag: 'timevalue-' + kind,
      renotify: false,
      silent: false,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: { kind: kind, url: './index.html' }
    };
    try {
      if (swReg && swReg.showNotification) swReg.showNotification(title, opts);
      else new Notification(title, opts);
    } catch (e) { /* некоторые браузеры запрещают конструктор вне SW */ }
    s.notif[kind === 'morning' ? 'lastMorning' : 'lastEvening'] = Store.key();
    Store.save();
  }

  function clear() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  /* Ставит таймеры на ближайшие срабатывания, пока страница жива. */
  function schedule() {
    clear();
    var s = Store.settings.notif;
    if (!s.enabled || !granted()) return;
    ['morning', 'evening'].forEach(function (kind) {
      var target = atToday(kind === 'morning' ? s.morning : s.evening);
      if (target <= Date.now()) target += 86400000;
      var delay = target - Date.now();
      if (delay > 2147483647) return;
      timers.push(setTimeout(function () {
        show(kind);
        schedule();
      }, delay));
    });
  }

  /* Пропущенное за время, пока приложение было закрыто. */
  function catchUp() {
    var s = Store.settings.notif;
    if (!s.enabled || !granted()) return;
    var day = Store.key(), now = Date.now();
    [['morning', 'lastMorning'], ['evening', 'lastEvening']].forEach(function (pair) {
      var kind = pair[0], mark = pair[1];
      var target = atToday(kind === 'morning' ? s.morning : s.evening);
      if (s[mark] === day) return;
      if (now >= target && now - target < GRACE_MS) show(kind);
    });
  }

  function enable(cb) {
    if (!supported()) { cb(false, 'Браузер не поддерживает уведомления.'); return; }
    if (denied()) { cb(false, 'Уведомления запрещены в настройках браузера.'); return; }
    if (granted()) { Store.settings.notif.enabled = true; Store.save(); schedule(); cb(true, ''); return; }
    var done = function (perm) {
      var ok = perm === 'granted';
      Store.settings.notif.enabled = ok;
      Store.save();
      if (ok) schedule();
      cb(ok, ok ? '' : 'Разрешение не выдано.');
    };
    try {
      var p = Notification.requestPermission(done);
      if (p && p.then) p.then(done);
    } catch (e) { cb(false, 'Не удалось запросить разрешение.'); }
  }

  function disable() {
    Store.settings.notif.enabled = false;
    Store.save();
    clear();
  }

  function status() {
    if (!supported()) return 'Этот браузер не умеет показывать уведомления. Остальное работает.';
    if (denied()) return 'Уведомления запрещены на уровне браузера. Разреши их в настройках сайта.';
    if (!Store.settings.notif.enabled) return 'Напоминания выключены.';
    if (!granted()) return 'Разрешение ещё не выдано.';
    var ios = /iP(hone|ad|od)/.test(navigator.userAgent);
    var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (ios && !standalone) return 'На iPhone уведомления приходят только у приложения, добавленного на экран «Домой».';
    return 'Придут два раза в день. Пропущенное покажется при следующем открытии.';
  }

  return {
    supported: supported, granted: granted,
    enable: enable, disable: disable,
    schedule: schedule, catchUp: catchUp, status: status,
    show: show, setReg: setReg
  };
})();
