/**
 * Commerce Hub Website — demo shell.
 *
 * One input: the shopper ID. "Add Shopper ID" sets it and reboots the Amazon
 * Connect widget so the new value reaches the contact flow. That's the whole
 * demo surface — widget config is hard-coded in connect-widget.js.
 */
(function () {
  'use strict';

  var STATE_KEY = 'commerce-hub-demo:shopperId';

  var ui = {};
  ['shopperIdInput','btnAddShopperId','currentShopperId','widgetStatus',
   'acctText','acctDot','footerCtx','btnOpenChat','btnCallback'
  ].forEach(function (id) { ui[id] = document.getElementById(id); });

  var shopperId = '';

  /* ------------------------------------------------------------------ state */

  function restore() {
    try { shopperId = localStorage.getItem(STATE_KEY) || ''; } catch (e) {}
    var qp = new URLSearchParams(location.search).get('shopperId');
    if (qp) shopperId = qp;
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

  /* --------------------------------------------------------------- rendering */

  function render() {
    var shown = shopperId || '—';
    ui.currentShopperId.textContent = shown;
    ui.footerCtx.textContent = shown;
    ui.acctText.textContent = shopperId || 'Guest';
    ui.acctDot.classList.toggle('is-set', !!shopperId);
  }

  function setStatus(level, msg) {
    ui.widgetStatus.className = 'widget-status ' + (level || '');
    ui.widgetStatus.textContent = msg;
  }

  /* ---------------------------------------------------------------- widget */

  function bootWidget() {
    return window.ConnectWidget.load({
      attributes: buildAttributes(),
      onStatus: setStatus
    });
  }

  /**
   * The amazon_connect() config calls are consumed once at boot, so a new
   * shopper ID only reaches the flow after the widget is torn down and rebooted.
   */
  function applyShopperId() {
    shopperId = ui.shopperIdInput.value.trim();
    persist();
    render();

    if (!window.ConnectWidget.isConfigured()) {
      setStatus('warn', 'Widget not configured — set CONNECT_WIDGET_CONFIG in connect-widget.js');
      return;
    }
    setStatus('warn', 'Reloading widget…');
    window.ConnectWidget.reload({ attributes: buildAttributes(), onStatus: setStatus });
  }

  /* ----------------------------------------------------------------- wiring */

  ui.btnAddShopperId.addEventListener('click', applyShopperId);
  ui.shopperIdInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') applyShopperId();
  });

  ui.btnOpenChat.addEventListener('click', function () {
    if (!window.ConnectWidget.isLoaded) { bootWidget(); return; }
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

  bootWidget();
})();
