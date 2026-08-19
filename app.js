/**
 * Commerce Hub Website — demo shell.
 *
 * There are no preset personas. Every attribute in the chat context is one you
 * added at runtime: the shopper ID, the mobile number, and any key/value pairs
 * you type in. That map is what gets handed to the Amazon Connect widget, and
 * nothing else.
 */
(function () {
  'use strict';

  var STATE_KEY = 'commerce-hub-demo:state';

  var ui = {};
  ['demoBar','demoBarBottom','btnConfig','btnReloadWidget','btnCollapse',
   'shopperIdInput','mobileInput','kvKey','kvVal','btnAddKv','kvChips','kvEmpty',
   'jsonPreview','configModal','cfgWidgetId','cfgScriptUrl','cfgSnippetId','cfgPaste',
   'btnParsePaste','parseStatus','btnSaveCfg','btnClearCfg','acctText','ctxCardList',
   'ctxCardEmpty','footerCtx','widgetStatus','btnOpenChat','btnCallback',
   'phoneNumber','phoneNumberText'
  ].forEach(function (id) { ui[id] = document.getElementById(id); });

  /* ------------------------------------------------------------------ state */

  var state = {
    shopperId: '',
    mobileNumber: '',
    custom: {},          // insertion-ordered key -> value
    customOrder: []      // preserves the order you added them in
  };

  function persist() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function restore() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (e) {}
    if (saved) {
      state.shopperId = saved.shopperId || '';
      state.mobileNumber = saved.mobileNumber || '';
      state.custom = (saved.custom && typeof saved.custom === 'object') ? saved.custom : {};
      state.customOrder = Array.isArray(saved.customOrder)
        ? saved.customOrder.filter(function (k) { return k in state.custom; })
        : Object.keys(state.custom);
      // any key that slipped out of the order list still gets rendered
      Object.keys(state.custom).forEach(function (k) {
        if (state.customOrder.indexOf(k) === -1) state.customOrder.push(k);
      });
    }

    // Demo links: ?shopperId=SHP-1&mobileNumber=%2B15550104477&tier=gold
    var qp = new URLSearchParams(location.search);
    if (qp.get('shopperId')) state.shopperId = qp.get('shopperId');
    if (qp.get('mobileNumber')) state.mobileNumber = qp.get('mobileNumber');
    qp.forEach(function (v, k) {
      if (k === 'shopperId' || k === 'mobileNumber') return;
      setCustom(k, v);
    });
  }

  function setCustom(k, v) {
    var key = String(k).trim();
    if (!key) return;
    if (!(key in state.custom)) state.customOrder.push(key);
    state.custom[key] = v;
  }

  function removeCustom(k) {
    delete state.custom[k];
    var i = state.customOrder.indexOf(k);
    if (i > -1) state.customOrder.splice(i, 1);
  }

  /** The exact string->string map handed to Amazon Connect. */
  function buildAttributes() {
    var attrs = {};
    if (state.shopperId.trim()) attrs.shopperId = state.shopperId.trim();
    if (state.mobileNumber.trim()) attrs.mobileNumber = state.mobileNumber.trim();
    state.customOrder.forEach(function (k) { attrs[k] = state.custom[k]; });
    return window.ConnectWidget.normalizeAttributes(attrs);
  }

  /* --------------------------------------------------------------- rendering */

  function renderChips() {
    ui.kvChips.innerHTML = '';
    state.customOrder.forEach(function (k) {
      var chip = document.createElement('span');
      chip.className = 'chip';

      var text = document.createElement('span');
      text.textContent = k + '=' + state.custom[k];
      chip.appendChild(text);

      var x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.title = 'Remove ' + k;
      x.setAttribute('aria-label', 'Remove attribute ' + k);
      x.addEventListener('click', function () {
        removeCustom(k);
        persist();
        renderChips();
        renderAll();
      });
      chip.appendChild(x);

      ui.kvChips.appendChild(chip);
    });
    ui.kvEmpty.hidden = state.customOrder.length > 0;
  }

  function renderContextCard(attrs) {
    var keys = Object.keys(attrs);
    ui.ctxCardList.innerHTML = '';
    keys.forEach(function (k) {
      var dt = document.createElement('dt'); dt.textContent = k;
      var dd = document.createElement('dd'); dd.textContent = attrs[k];
      ui.ctxCardList.appendChild(dt);
      ui.ctxCardList.appendChild(dd);
    });
    ui.ctxCardEmpty.hidden = keys.length > 0;
  }

  function renderPhone() {
    var num = state.mobileNumber.trim();
    if (num) {
      ui.phoneNumberText.textContent = num;
      ui.phoneNumber.href = 'tel:' + num.replace(/[^\d+]/g, '');
      ui.phoneNumber.classList.remove('is-empty');
    } else {
      ui.phoneNumberText.textContent = 'Add a mobile number in the demo bar';
      ui.phoneNumber.removeAttribute('href');
      ui.phoneNumber.classList.add('is-empty');
    }
  }

  function renderAll() {
    var attrs = buildAttributes();
    ui.jsonPreview.textContent = JSON.stringify(attrs, null, 2);
    ui.acctText.textContent = attrs.shopperId || 'Guest';
    ui.footerCtx.textContent = String(Object.keys(attrs).length);
    renderContextCard(attrs);
    renderPhone();
  }

  /* ---------------------------------------------------------------- widget */

  function setStatus(level, msg) {
    ui.widgetStatus.className = 'widget-status ' + (level || '');
    ui.widgetStatus.textContent = msg;
  }

  function configured() {
    return window.ConnectWidget.isConfigured(window.ConnectWidget.loadConfig());
  }

  function bootWidget() {
    if (!configured()) {
      setStatus('warn', 'Widget not configured — click "Widget config"');
      return false;
    }
    return window.ConnectWidget.load({
      attributes: buildAttributes(),
      onStatus: setStatus
    });
  }

  /**
   * The amazon_connect() config calls are consumed once at boot, so a changed
   * attribute only reaches the flow after the widget is rebooted.
   */
  function rebootIfLive() {
    if (window.ConnectWidget.isLoaded) {
      window.ConnectWidget.reload({ attributes: buildAttributes(), onStatus: setStatus });
    } else if (configured()) {
      setStatus('warn', 'Attributes changed — click "Reload widget" to apply');
    }
  }

  /* ---------------------------------------------------------------- config */

  function openConfig() {
    var cfg = window.ConnectWidget.loadConfig();
    ui.cfgWidgetId.value = cfg.widgetId;
    ui.cfgScriptUrl.value = cfg.scriptUrl;
    ui.cfgSnippetId.value = cfg.snippetId;
    ui.parseStatus.textContent = '';
    ui.parseStatus.className = 'parse-status';
    ui.configModal.hidden = false;
  }

  function closeConfig() { ui.configModal.hidden = true; }

  /* ----------------------------------------------------------------- wiring */

  function wire() {
    var saveTimer;
    function onTextInput(prop, el) {
      el.addEventListener('input', function () {
        state[prop] = el.value;
        renderAll();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(persist, 250);
      });
      el.addEventListener('change', rebootIfLive);
    }
    onTextInput('shopperId', ui.shopperIdInput);
    onTextInput('mobileNumber', ui.mobileInput);

    function addKv() {
      var k = ui.kvKey.value.trim();
      var v = ui.kvVal.value.trim();
      if (!k) { ui.kvKey.focus(); return; }
      setCustom(k, v);
      ui.kvKey.value = '';
      ui.kvVal.value = '';
      ui.kvKey.focus();
      persist();
      renderChips();
      renderAll();
      rebootIfLive();
    }
    ui.btnAddKv.addEventListener('click', addKv);
    [ui.kvKey, ui.kvVal].forEach(function (el) {
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') addKv(); });
    });

    ui.btnReloadWidget.addEventListener('click', function () {
      if (!configured()) { openConfig(); return; }
      setStatus('warn', 'Reloading widget…');
      window.ConnectWidget.reload({ attributes: buildAttributes(), onStatus: setStatus });
    });

    ui.btnCollapse.addEventListener('click', function () {
      var collapsed = ui.demoBar.classList.toggle('is-collapsed');
      ui.btnCollapse.textContent = collapsed ? 'Show' : 'Hide';
      ui.btnCollapse.setAttribute('aria-expanded', String(!collapsed));
    });

    ui.btnConfig.addEventListener('click', openConfig);
    ui.configModal.querySelectorAll('[data-close]').forEach(function (el) {
      el.addEventListener('click', closeConfig);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !ui.configModal.hidden) closeConfig();
    });

    ui.btnParsePaste.addEventListener('click', function () {
      var parsed = window.ConnectWidget.parseSnippet(ui.cfgPaste.value);
      var found = [];
      if (parsed.widgetId) { ui.cfgWidgetId.value = parsed.widgetId; found.push('widgetId'); }
      if (parsed.scriptUrl) { ui.cfgScriptUrl.value = parsed.scriptUrl; found.push('scriptUrl'); }
      if (parsed.snippetId) { ui.cfgSnippetId.value = parsed.snippetId; found.push('snippetId'); }
      if (found.length) {
        ui.parseStatus.className = 'parse-status ok';
        ui.parseStatus.textContent = 'Found ' + found.join(', ');
      } else {
        ui.parseStatus.className = 'parse-status err';
        ui.parseStatus.textContent = "Couldn't parse that — fill the fields manually";
      }
    });

    ui.btnSaveCfg.addEventListener('click', function () {
      window.ConnectWidget.saveConfig({
        widgetId: ui.cfgWidgetId.value,
        scriptUrl: ui.cfgScriptUrl.value,
        snippetId: ui.cfgSnippetId.value
      });
      closeConfig();
      bootWidget();
    });

    ui.btnClearCfg.addEventListener('click', function () {
      window.ConnectWidget.clearConfig();
      window.ConnectWidget.destroy();
      ui.cfgWidgetId.value = '';
      ui.cfgScriptUrl.value = '';
      ui.cfgSnippetId.value = '';
      setStatus('warn', 'Widget config cleared');
    });

    ui.btnOpenChat.addEventListener('click', function () {
      if (!configured()) { openConfig(); return; }
      if (!window.ConnectWidget.isLoaded) { bootWidget(); return; }
      // The launcher lives in a cross-origin iframe, so it can't be clicked
      // from here — point at it instead of pretending.
      setStatus('ok', 'Widget ready — open it from the chat bubble, bottom right');
    });

    ui.btnCallback.addEventListener('click', function () {
      var num = state.mobileNumber.trim();
      if (!num) {
        ui.mobileInput.focus();
        ui.mobileInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setStatus('warn', 'Add a mobile number in the demo bar first');
        return;
      }
      setStatus('ok', 'Callback queued for ' + num + ' (demo only — nothing is dialled)');
    });

    ui.configModal.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  /* -------------------------------------------------------------------- go */

  restore();
  ui.shopperIdInput.value = state.shopperId;
  ui.mobileInput.value = state.mobileNumber;
  renderChips();
  renderAll();
  wire();

  // Handy during a demo: `__DEMO_CONTEXT__` in the console shows exactly what
  // the next chat will carry.
  Object.defineProperty(window, '__DEMO_CONTEXT__', {
    get: function () { return buildAttributes(); }
  });

  if (configured()) {
    bootWidget();
  } else {
    setStatus('warn', 'Widget not configured — click "Widget config"');
  }
})();
