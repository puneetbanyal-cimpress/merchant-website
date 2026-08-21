/**
 * Quirepress — demo shell.
 *
 * Pick a shopper from the dropdown, hit "Set chat context", and the Amazon
 * Connect widget reboots carrying that shopper's id and name.
 *
 * The widget is gated on that context: with nothing selected there is nothing
 * worth passing, so the widget is never injected — and clearing the selection
 * tears down an already-loaded one. A chat bubble can never appear carrying an
 * empty or stale context.
 *
 * The callback flow is a two-step wizard modelled on the reference screens; it
 * prefills from the same context and POSTs it alongside the form.
 */
(function () {
  'use strict';

  var STATE_KEY = 'quirepress-demo:shopperId';
  var SHOPPERS = window.DEMO_SHOPPERS || [];
  var REASONS = window.CONTACT_REASONS || [];
  var REGIONS = window.COUNTRY_REGIONS || [];
  var HOURS = window.WORKING_HOURS || [];
  var MIN_DESC = 15;

  var ui = {};
  ['shopperSelect','btnSetContext','shopperCtx','shopperCtxEmpty','widgetStatus',
   'acctText','acctDot','footerCtx','btnOpenChat','btnCallback','phoneHours',
   'assistantDot','assistantStatusText',
   'cbDialog','cbExit','cbHours','cbProgress','cbStep1','cbStep2','cbDone',
   'cbGreeting','cbIdentValue','cbIdentSep','cbNotYou','cbStepTitle',
   'cbForm1','cbForm2','cbReason','cbFirst','cbLast','cbCountry','cbPhone','cbConsent',
   'cbDesc','cbCount','cbBack','cbNext','cbSubmit','cbClose','cbStatus','cbDoneMsg'
  ].forEach(function (id) { ui[id] = document.getElementById(id); });

  /** The shopper whose context is currently live (null = none). */
  var active = null;
  /** The dropdown selection, which may not be applied yet. */
  var pending = null;
  /** Wizard position: 1, 2, or 'done'. */
  var step = 1;
  /** Fields the user has actually focused, so blur only scolds touched ones. */
  var touched = new Set();

  /* ------------------------------------------------------------------ state */

  function findShopper(id) {
    return SHOPPERS.find(function (s) { return s.shopperId === id; }) || null;
  }

  function fullName(s) {
    return s ? (s.firstName + ' ' + s.lastName) : '';
  }

  function restore() {
    var saved = '';
    try { saved = localStorage.getItem(STATE_KEY) || ''; } catch (e) {}
    var qp = new URLSearchParams(location.search).get('shopperId');
    active = findShopper(qp || saved);
    pending = active;
  }

  function persist() {
    try {
      if (active) localStorage.setItem(STATE_KEY, active.shopperId);
      else localStorage.removeItem(STATE_KEY);
    } catch (e) {}
  }

  /** The exact string->string map handed to Amazon Connect. */
  function buildAttributes() {
    if (!active) return {};
    return window.ConnectWidget.normalizeAttributes({
      shopperId: active.shopperId,
      firstName: active.firstName,
      lastName: active.lastName
    });
  }

  function hasContext() {
    return Object.keys(buildAttributes()).length > 0;
  }

  /* --------------------------------------------------------------- rendering */

  function buildStaticOptions() {
    SHOPPERS.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.shopperId;
      o.textContent = fullName(s);
      ui.shopperSelect.appendChild(o);
    });

    REASONS.forEach(function (r) {
      var o = document.createElement('option');
      o.value = r.value;
      o.textContent = r.label;
      ui.cbReason.appendChild(o);
    });

    REGIONS.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.value;
      o.textContent = c.label;
      o.dataset.dial = c.dial;
      ui.cbCountry.appendChild(o);
    });
    ui.cbCountry.value = 'US';

    [ui.phoneHours, ui.cbHours].forEach(function (host) {
      HOURS.forEach(function (h) {
        var d = document.createElement('span'); d.textContent = h.day;
        var v = document.createElement('span'); v.textContent = h.hours;
        host.appendChild(d);
        host.appendChild(v);
      });
    });
  }

  function render() {
    var attrs = buildAttributes();
    var keys = Object.keys(attrs);

    ui.shopperCtx.innerHTML = '';
    keys.forEach(function (k) {
      var dt = document.createElement('dt'); dt.textContent = k;
      var dd = document.createElement('dd');
      dd.textContent = attrs[k];
      dd.title = attrs[k];
      ui.shopperCtx.appendChild(dt);
      ui.shopperCtx.appendChild(dd);
    });
    ui.shopperCtxEmpty.hidden = keys.length > 0;

    // The header shows the NAME once a context is set, not the id.
    ui.acctText.textContent = active ? fullName(active) : 'Guest';
    ui.acctDot.classList.toggle('is-set', !!active);
    ui.footerCtx.textContent = active ? active.shopperId : '—';
    ui.footerCtx.title = active ? active.shopperId : '';

    var live = window.ConnectWidget.isLoaded;
    ui.assistantStatusText.textContent = live ? 'Online' : 'Set a chat context to start';
    ui.assistantDot.classList.toggle('status-dot--grey', !live);
  }

  function setStatus(level, msg) {
    ui.widgetStatus.className = 'widget-status ' + (level || '');
    ui.widgetStatus.textContent = msg;
    render();
  }

  /* ---------------------------------------------------------------- widget */

  /**
   * Load (or reload) the widget with the current context.
   * Refuses to inject anything when no shopper is set.
   */
  function syncWidget(isUserAction) {
    if (!hasContext()) {
      // hasWidget, not isLoaded — a script that errored still left its tag.
      if (window.ConnectWidget.hasWidget) window.ConnectWidget.destroy();
      setStatus('warn', 'No chat context — widget not loaded');
      return false;
    }
    if (!window.ConnectWidget.isConfigured()) {
      setStatus('warn', 'Widget not configured — set CONNECT_WIDGET_CONFIG in connect-widget.js');
      return false;
    }
    if (isUserAction) setStatus('warn', 'Reloading widget…');
    // The amazon_connect() config calls are consumed once at boot, so the widget
    // must be torn down and rebooted for new attributes to reach the flow.
    return window.ConnectWidget.reload({ attributes: buildAttributes(), onStatus: setStatus });
  }

  function applyContext() {
    active = pending;
    persist();
    render();
    if (!active) ui.shopperSelect.focus();
    syncWidget(true);
  }

  /* ------------------------------------------------------- callback wizard */

  function dialFor(code) {
    var r = REGIONS.find(function (c) { return c.value === code; });
    return r ? r.dial : '';
  }

  function showStep(n) {
    step = n;
    var done = n === 'done';

    ui.cbStep1.hidden = n !== 1;
    ui.cbStep2.hidden = n !== 2;
    ui.cbDone.hidden = !done;

    ui.cbBack.hidden = n !== 2;
    ui.cbNext.hidden = n !== 1;
    ui.cbSubmit.hidden = n !== 2;
    ui.cbClose.hidden = !done;

    ui.cbProgress.style.width = n === 1 ? '50%' : '100%';
    ui.cbDialog.querySelector('.cb__progress')
      .setAttribute('aria-valuenow', n === 1 ? '50' : '100');

    ui.cbDialog.querySelectorAll('.cb__num').forEach(function (el) {
      var s = Number(el.dataset.step);
      el.classList.toggle('is-active', done ? s === 3 : s === n);
    });

    ui.cbStatus.textContent = '';
    ui.cbStatus.className = 'cb__status';

    if (n === 1) ui.cbReason.focus();
    else if (n === 2) ui.cbDesc.focus();
    else ui.cbClose.focus();
  }

  /** Mark a field's error visible or not. Errors never show on a pristine form. */
  function setError(el, show) {
    var msg = ui.cbDialog.querySelector('.cb__error[data-for="' + el.id + '"]');
    if (msg) msg.classList.toggle('is-shown', show);
    el.classList.toggle('is-invalid', show);
    el.setAttribute('aria-invalid', show ? 'true' : 'false');
  }

  function step1Fields() {
    return [ui.cbReason, ui.cbFirst, ui.cbLast, ui.cbCountry, ui.cbPhone, ui.cbConsent];
  }

  function fieldValid(el) {
    if (el === ui.cbConsent) return el.checked;
    if (el === ui.cbPhone) {
      // Must carry digits beyond the dialling code the field is seeded with.
      return el.value.replace(/[^\d]/g, '').length >= 7;
    }
    return el.value.trim() !== '';
  }

  function step1Valid() {
    return step1Fields().every(fieldValid);
  }

  function step2Valid() {
    return ui.cbDesc.value.trim().length >= MIN_DESC;
  }

  /** Enable/disable the footer button the way the reference form does. */
  function refreshButtons() {
    ui.cbNext.disabled = !step1Valid();
    ui.cbSubmit.disabled = !step2Valid();
  }

  function openCallback() {
    // Prefill from the active context so the demo shows context reuse across
    // channels, not just chat.
    ui.cbFirst.value = active ? active.firstName : '';
    ui.cbLast.value = active ? active.lastName : '';
    ui.cbGreeting.textContent = active
      ? 'Hi ' + active.firstName + ", let's make sure we have the right details"
      : "Let's make sure we have the right details";
    ui.cbIdentValue.textContent = active ? active.shopperId : 'No shopper selected';
    ui.cbIdentValue.title = active ? active.shopperId : '';
    ui.cbIdentValue.classList.toggle('is-id', !!active);
    ui.cbIdentSep.hidden = !active;
    ui.cbNotYou.hidden = !active;
    if (active) ui.cbNotYou.textContent = 'Not ' + active.firstName + '?';

    ui.cbReason.value = '';
    ui.cbCountry.value = 'US';
    ui.cbPhone.value = dialFor('US');
    ui.cbConsent.checked = false;
    ui.cbDesc.value = '';
    ui.cbCount.textContent = '0/1000 characters';

    touched.clear();
    step1Fields().concat([ui.cbDesc]).forEach(function (el) { setError(el, false); });
    refreshButtons();
    showStep(1);
    ui.cbDialog.showModal();
  }

  function readForm() {
    return {
      contactReason: ui.cbReason.value,
      firstName: ui.cbFirst.value.trim(),
      lastName: ui.cbLast.value.trim(),
      countryRegion: ui.cbCountry.value,
      dialCode: dialFor(ui.cbCountry.value),
      phone: ui.cbPhone.value.trim(),
      consent: ui.cbConsent.checked,
      description: ui.cbDesc.value.trim()
    };
  }

  function goNext() {
    var bad = step1Fields().filter(function (el) { return !fieldValid(el); });
    step1Fields().forEach(function (el) { setError(el, !fieldValid(el)); });
    if (bad.length) { bad[0].focus(); return; }
    showStep(2);
  }

  async function submitCallback() {
    if (!step2Valid()) {
      setError(ui.cbDesc, true);
      ui.cbDesc.focus();
      return;
    }
    setError(ui.cbDesc, false);

    ui.cbSubmit.disabled = true;
    ui.cbStatus.className = 'cb__status';
    ui.cbStatus.textContent = 'Sending…';

    var result = await window.CallbackApi.submit(readForm(), buildAttributes());

    if (!result.ok) {
      ui.cbSubmit.disabled = false;
      ui.cbStatus.className = 'cb__status is-err';
      ui.cbStatus.textContent = result.error || 'Something went wrong. Please try again.';
      return;
    }

    var ref = result.data && result.data.referenceId;
    ui.cbDoneMsg.textContent =
      "We'll call " + dialFor(ui.cbCountry.value) + ' ' +
      ui.cbPhone.value.trim().replace(dialFor(ui.cbCountry.value), '').trim() +
      ' within minutes. Reference ' + (ref || '—') + '.' +
      (result.simulated ? ' (Simulated — no endpoint configured yet.)' : '');
    showStep('done');
  }

  /* ----------------------------------------------------------------- wiring */

  function wire() {
    ui.shopperSelect.addEventListener('change', function () {
      pending = findShopper(ui.shopperSelect.value);
      // Selecting alone does not change the live context — the button does.
      if (pending !== active) {
        setStatus('warn', pending
          ? 'Selected ' + fullName(pending) + ' — hit "Set chat context" to apply'
          : 'Cleared — hit "Set chat context" to unload the widget');
      }
    });

    ui.btnSetContext.addEventListener('click', applyContext);

    ui.btnOpenChat.addEventListener('click', function () {
      if (!hasContext()) {
        ui.shopperSelect.focus();
        ui.shopperSelect.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setStatus('warn', 'Set a chat context first — the widget only loads with one');
        return;
      }
      if (!window.ConnectWidget.isLoaded) { syncWidget(true); return; }
      // The launcher lives in a cross-origin iframe, so it can't be clicked from
      // here — point at it rather than pretending.
      setStatus('ok', 'Widget ready — open it from the chat bubble, bottom right');
    });

    ui.btnCallback.addEventListener('click', openCallback);

    // Live validation. The Next button stays disabled until the step is valid,
    // so errors have to surface on blur — otherwise a greyed-out button is the
    // only feedback and nothing says WHICH field is missing.
    step1Fields().forEach(function (el) {
      var ev = (el === ui.cbConsent || el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(ev, function () {
        if (fieldValid(el)) setError(el, false);
        refreshButtons();
      });
      el.addEventListener('blur', function () {
        // Don't scold a field the user only tabbed through without touching.
        if (touched.has(el) && !fieldValid(el)) setError(el, true);
      });
      el.addEventListener('focus', function () { touched.add(el); });
    });

    ui.cbCountry.addEventListener('change', function () {
      // Reseed the phone field with the new dialling code, keeping any digits
      // the user already typed beyond the old one.
      var oldDial = ui.cbPhone.value.match(/^\+\d+/);
      var rest = oldDial ? ui.cbPhone.value.slice(oldDial[0].length) : ui.cbPhone.value;
      ui.cbPhone.value = dialFor(ui.cbCountry.value) + rest;
      refreshButtons();
    });

    ui.cbDesc.addEventListener('input', function () {
      ui.cbCount.textContent = ui.cbDesc.value.length + '/1000 characters';
      if (step2Valid()) setError(ui.cbDesc, false);
      refreshButtons();
    });

    ui.cbNext.addEventListener('click', goNext);
    ui.cbBack.addEventListener('click', function () { showStep(1); });
    ui.cbSubmit.addEventListener('click', submitCallback);
    ui.cbClose.addEventListener('click', function () { ui.cbDialog.close('done'); });
    ui.cbExit.addEventListener('click', function () { ui.cbDialog.close('exit'); });

    ui.cbNotYou.addEventListener('click', function () {
      // Clears the prefill so the demo can show an unrecognised caller.
      ui.cbFirst.value = '';
      ui.cbLast.value = '';
      ui.cbGreeting.textContent = "Let's make sure we have the right details";
      ui.cbFirst.focus();
      refreshButtons();
    });

    // <dialog> already handles Escape and focus trapping. Add backdrop-click.
    ui.cbDialog.addEventListener('click', function (e) {
      if (e.target === ui.cbDialog) ui.cbDialog.close('backdrop');
    });

    // Enter anywhere in step 1 advances rather than doing nothing.
    ui.cbForm1.addEventListener('submit', function (e) { e.preventDefault(); goNext(); });
    ui.cbForm2.addEventListener('submit', function (e) { e.preventDefault(); submitCallback(); });
  }

  /* -------------------------------------------------------------------- go */

  buildStaticOptions();
  restore();
  ui.shopperSelect.value = active ? active.shopperId : '';
  render();
  wire();

  // Handy during a demo: `__DEMO_CONTEXT__` shows what the next chat will carry.
  Object.defineProperty(window, '__DEMO_CONTEXT__', {
    get: function () { return buildAttributes(); }
  });

  // Only boots if a shopper survived from localStorage or the query string.
  syncWidget(false);
})();
