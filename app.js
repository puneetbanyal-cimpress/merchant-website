/**
 * Quirepress — demo shell.
 *
 * Pick a shopper from the dropdown, hit "Set chat context", and the Amazon
 * Connect widget reboots carrying that shopper's id, name and email.
 *
 * The widget is gated on that context: with nothing selected there is nothing
 * worth passing, so the widget is never injected — and clearing the selection
 * tears down an already-loaded one. A chat bubble can never appear carrying an
 * empty or stale context.
 */
(function () {
  'use strict';

  var STATE_KEY = 'quirepress-demo:shopperId';
  var SHOPPERS = window.DEMO_SHOPPERS || [];

  var ui = {};
  ['shopperSelect','btnSetContext','shopperCtx','shopperCtxEmpty','widgetStatus',
   'acctText','acctDot','footerCtx','btnOpenChat','btnCallback',
   'assistantDot','assistantStatusText',
   'callbackDialog','callbackForm','cbBody','cbDone','cbDoneMsg','cbDoneClose',
   'cbCancel','cbSubmit','cbStatus','cbCtxNote',
   'cbName','cbEmail','cbPhone','cbCountry','cbReason','cbOrder','cbWhen','cbNotes','cbConsent'
  ].forEach(function (id) { ui[id] = document.getElementById(id); });

  /** The shopper whose context is currently live (null = none). */
  var active = null;
  /** The dropdown selection, which may not be applied yet. */
  var pending = null;

  /* ------------------------------------------------------------------ state */

  function findShopper(id) {
    return SHOPPERS.find(function (s) { return s.shopperId === id; }) || null;
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
      shopperName: active.shopperName,
      shopperEmail: active.shopperEmail
    });
  }

  function hasContext() {
    return Object.keys(buildAttributes()).length > 0;
  }

  /* --------------------------------------------------------------- rendering */

  function buildOptions() {
    SHOPPERS.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.shopperId;
      o.textContent = s.shopperName + ' · ' + s.shopperId;
      ui.shopperSelect.appendChild(o);
    });
  }

  function render() {
    var attrs = buildAttributes();
    var keys = Object.keys(attrs);

    ui.shopperCtx.innerHTML = '';
    keys.forEach(function (k) {
      var dt = document.createElement('dt'); dt.textContent = k;
      var dd = document.createElement('dd'); dd.textContent = attrs[k];
      ui.shopperCtx.appendChild(dt);
      ui.shopperCtx.appendChild(dd);
    });
    ui.shopperCtxEmpty.hidden = keys.length > 0;

    // The header shows the NAME once a context is set, not the id.
    ui.acctText.textContent = active ? active.shopperName : 'Guest';
    ui.acctDot.classList.toggle('is-set', !!active);
    ui.footerCtx.textContent = active ? active.shopperId : '—';

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
    if (!active) {
      ui.shopperSelect.focus();
      syncWidget(true);
      return;
    }
    syncWidget(true);
  }

  /* -------------------------------------------------------------- callback */

  function openCallback() {
    // Prefill from the active context so the demo shows context reuse across
    // channels, not just chat.
    ui.cbName.value = active ? active.shopperName : '';
    ui.cbEmail.value = active ? active.shopperEmail : '';
    ui.cbCtxNote.textContent = active
      ? 'Sent with shopperId ' + active.shopperId + '.'
      : 'No shopper context set — the request will be sent without one.';

    ui.callbackForm.hidden = false;
    ui.cbBody.hidden = false;
    ui.cbDone.hidden = true;
    ui.cbStatus.textContent = '';
    ui.cbStatus.className = 'cb__status';
    ui.callbackForm.classList.remove('is-submitted');
    ui.cbSubmit.disabled = false;

    ui.callbackDialog.showModal();
  }

  function readForm() {
    return {
      fullName: ui.cbName.value.trim(),
      email: ui.cbEmail.value.trim(),
      countryCode: ui.cbCountry.value,
      phone: ui.cbPhone.value.trim(),
      reason: ui.cbReason.value,
      orderNumber: ui.cbOrder.value.trim(),
      preferredTime: ui.cbWhen.value,
      notes: ui.cbNotes.value.trim(),
      consent: ui.cbConsent.checked
    };
  }

  async function submitCallback(e) {
    e.preventDefault();

    // novalidate on the form, so validity is checked here — that keeps the
    // browser from showing its own bubble over the dialog and lets the
    // :user-invalid styling do the talking.
    ui.callbackForm.classList.add('is-submitted');
    if (!ui.callbackForm.checkValidity()) {
      var firstBad = ui.callbackForm.querySelector(':invalid');
      if (firstBad) firstBad.focus();
      ui.cbStatus.className = 'cb__status is-err';
      ui.cbStatus.textContent = 'Please fix the highlighted fields.';
      return;
    }

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
      'Reference ' + (ref || '—') + '. We\'ll ring ' +
      ui.cbCountry.value.replace(/-.*$/, '') + ' ' + ui.cbPhone.value.trim() + ' shortly.' +
      (result.simulated ? ' (Simulated — no endpoint configured yet.)' : '');

    ui.cbBody.hidden = true;
    ui.cbDone.hidden = false;
    ui.cbDoneClose.focus();
  }

  /* ----------------------------------------------------------------- wiring */

  function wire() {
    ui.shopperSelect.addEventListener('change', function () {
      pending = findShopper(ui.shopperSelect.value);
      // Selecting alone does not change the live context — the button does.
      if (pending !== active) {
        setStatus('warn', pending
          ? 'Selected ' + pending.shopperName + ' — hit "Set chat context" to apply'
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
    ui.callbackForm.addEventListener('submit', submitCallback);
    ui.cbCancel.addEventListener('click', function () { ui.callbackDialog.close('cancel'); });
    ui.cbDoneClose.addEventListener('click', function () { ui.callbackDialog.close('done'); });

    // Click on the backdrop (i.e. on the dialog element itself, outside the
    // panel) closes it. <dialog> already handles Escape and focus trapping.
    ui.callbackDialog.addEventListener('click', function (e) {
      if (e.target === ui.callbackDialog) ui.callbackDialog.close('backdrop');
    });
  }

  /* -------------------------------------------------------------------- go */

  buildOptions();
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
