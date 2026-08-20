/**
 * Commerce Hub Website — demo shell.
 *
 * One input: the shopper ID. "Add Shopper ID" sets it and reboots the Amazon
 * Connect widget so the new value reaches the contact flow.
 *
 * The widget is gated on that ID: with no shopper ID there is no context worth
 * passing, so the widget is never injected — and if it's already up when the ID
 * is cleared, it gets torn down. That keeps the demo honest; a chat bubble can
 * never appear carrying an empty or stale context.
 */
(function () {
  'use strict';

  var STATE_KEY = 'commerce-hub-demo:shopperId';

  var ui = {};
  ['shopperIdInput','btnAddShopperId','currentShopperId','widgetStatus',
   'acctText','acctDot','footerCtx','btnOpenChat','btnCallback',
   'assistantDot','assistantStatusText'
  ].forEach(function (id) { ui[id] = document.getElementById(id); });

  var shopperId = '';

  /* ------------------------------------------------------------------ state */

  function restore() {
    try { shopperId = (localStorage.getItem(STATE_KEY) || '').trim(); } catch (e) {}
    var qp = new URLSearchParams(location.search).get('shopperId');
    if (qp) shopperId = qp.trim();
  }

  function persist() {
    try {
      if (shopperId) localStorage.setItem(STATE_KEY, shopperId);
      else localStorage.removeItem(STATE_KEY);
    } catch (e) {}
  }

  /** The exact string->string map handed to Amazon Connect. */
  function buildAttributes() {
    return window.ConnectWidget.normalizeAttributes({ shopperId: shopperId });
  }

  function hasContext() {
    return Object.keys(buildAttributes()).length > 0;
  }

  /* --------------------------------------------------------------- rendering */

  function render() {
    var shown = shopperId || '—';
    ui.currentShopperId.textContent = shown;
    ui.footerCtx.textContent = shown;
    ui.acctText.textContent = shopperId || 'Guest';
    ui.acctDot.classList.toggle('is-set', !!shopperId);

    var live = window.ConnectWidget.isLoaded;
    ui.assistantStatusText.textContent = live ? 'Online' : 'Add a Shopper ID to start';
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
   * Refuses to inject anything when there is no shopper ID.
   */
  function syncWidget(isUserAction) {
    if (!hasContext()) {
      // hasWidget, not isLoaded — a script that errored still left its tag.
      if (window.ConnectWidget.hasWidget) window.ConnectWidget.destroy();
      setStatus('warn', 'No Shopper ID — chat widget not loaded');
      return false;
    }
    if (!window.ConnectWidget.isConfigured()) {
      setStatus('warn', 'Widget not configured — set CONNECT_WIDGET_CONFIG in connect-widget.js');
      return false;
    }
    if (isUserAction) setStatus('warn', 'Reloading widget…');
    // The amazon_connect() config calls are consumed once at boot, so the widget
    // must be torn down and rebooted for a new shopper ID to reach the flow.
    return window.ConnectWidget.reload({ attributes: buildAttributes(), onStatus: setStatus });
  }

  function applyShopperId() {
    var next = ui.shopperIdInput.value.trim();
    var changed = next !== shopperId;
    shopperId = next;
    persist();
    render();

    if (!shopperId) {
      ui.shopperIdInput.focus();
      syncWidget(true);
      return;
    }
    if (!changed && window.ConnectWidget.isLoaded) {
      // Same ID, widget already up — still reload, since that's what the button
      // says it does and a stale widget is the thing we're guarding against.
      setStatus('warn', 'Reloading widget…');
    }
    syncWidget(true);
  }

  /* ----------------------------------------------------------------- wiring */

  ui.btnAddShopperId.addEventListener('click', applyShopperId);
  ui.shopperIdInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') applyShopperId();
  });

  ui.btnOpenChat.addEventListener('click', function () {
    if (!hasContext()) {
      ui.shopperIdInput.focus();
      ui.shopperIdInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setStatus('warn', 'Add a Shopper ID first — the widget only loads with context');
      return;
    }
    if (!window.ConnectWidget.isLoaded) { syncWidget(true); return; }
    // The launcher lives in a cross-origin iframe, so it can't be clicked from
    // here — point at it rather than pretending.
    setStatus('ok', 'Widget ready — open it from the chat bubble, bottom right');
  });

  ui.btnCallback.addEventListener('click', function () {
    setStatus('ok', 'Callback requested (demo only — nothing is dialled)');
  });

  /* -------------------------------------------------------------------- go */

  restore();
  ui.shopperIdInput.value = shopperId;
  render();

  // Handy during a demo: `__DEMO_CONTEXT__` shows what the next chat will carry.
  Object.defineProperty(window, '__DEMO_CONTEXT__', {
    get: function () { return buildAttributes(); }
  });

  // Only boots if a shopper ID survived from localStorage or the query string.
  syncWidget(false);
})();
