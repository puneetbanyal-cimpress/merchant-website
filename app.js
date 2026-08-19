/**
 * Demo shell: context switching, shopper-ID override, custom attributes,
 * and wiring all of it into the Amazon Connect widget.
 */
(function () {
  'use strict';

  var STATE_KEY = 'vista-demo:state';
  var CONTEXTS = window.DEMO_CONTEXTS;

  var ui = {};
  ['ctxTabs','attrMode','btnConfig','btnReloadWidget','btnCollapse','demoBar','demoBarBottom',
   'shopperIdInput','kvKey','kvVal','btnAddKv','kvChips','jsonPreview','prefixNote',
   'configModal','cfgWidgetId','cfgScriptUrl','cfgSnippetId','cfgPaste','btnParsePaste',
   'parseStatus','btnSaveCfg','btnClearCfg','acctText','acctDot','cartCount',
   'heroEyebrow','heroLede','ctxCardId','ctxCardList','footerCtx','widgetStatus','btnOpenChat'
  ].forEach(function (id) { ui[id] = document.getElementById(id); });

  /* ------------------------------------------------------------------ state */

  var state = {
    contextId: CONTEXTS[0].id,
    shopperIdOverride: '',
    custom: {},        // { key: value }
    mode: 'plaintext'
  };

  function persist() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function restore() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (e) {}
    if (!saved) return;
    if (CONTEXTS.some(function (c) { return c.id === saved.contextId; })) {
      state.contextId = saved.contextId;
    }
    state.shopperIdOverride = saved.shopperIdOverride || '';
    state.custom = saved.custom && typeof saved.custom === 'object' ? saved.custom : {};
    state.mode = saved.mode === 'jwt' ? 'jwt' : 'plaintext';

    // A ?shopperId= query param wins over anything stored — handy for demo links.
    var qp = new URLSearchParams(location.search).get('shopperId');
    if (qp) state.shopperIdOverride = qp;
  }

  function activeContext() {
    return CONTEXTS.find(function (c) { return c.id === state.contextId; }) || CONTEXTS[0];
  }

  /** The exact string->string map handed to Amazon Connect. */
  function buildAttributes() {
    var ctx = activeContext();
    var attrs = Object.assign({}, ctx.attributes);
    if (state.shopperIdOverride.trim()) attrs.shopperId = state.shopperIdOverride.trim();
    attrs.demoContext = ctx.id;
    Object.assign(attrs, state.custom);
    return window.ConnectWidget.normalizeAttributes(attrs);
  }

  /* --------------------------------------------------------------- rendering */

  function renderTabs() {
    ui.ctxTabs.innerHTML = '';
    CONTEXTS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ctx-tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(c.id === state.contextId));
      b.innerHTML = '<span>' + c.label + '</span><small>' + c.attributes.shopperId + '</small>';
      b.addEventListener('click', function () { switchContext(c.id); });
      ui.ctxTabs.appendChild(b);
    });
  }

  function renderChips() {
    ui.kvChips.innerHTML = '';
    Object.keys(state.custom).forEach(function (k) {
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.appendChild(document.createTextNode(k + '=' + state.custom[k]));
      var x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.setAttribute('aria-label', 'Remove ' + k);
      x.addEventListener('click', function () {
        delete state.custom[k];
        persist(); renderChips(); renderAll();
      });
      chip.appendChild(x);
      ui.kvChips.appendChild(chip);
    });
  }

  function renderStorefront() {
    var ctx = activeContext();
    var attrs = buildAttributes();

    ui.acctText.textContent = attrs.shopperName || ctx.label;
    ui.acctDot.style.background = ctx.dotColor;
    ui.cartCount.textContent = String(ctx.cartCount);
    ui.heroEyebrow.textContent = ctx.hero.eyebrow;
    ui.heroLede.textContent = ctx.hero.lede;
    ui.footerCtx.textContent = ctx.id + ' / ' + attrs.shopperId;

    ui.ctxCardId.textContent = attrs.shopperId;
    ui.ctxCardList.innerHTML = '';
    ['shopperTier', 'locale', 'storefront', 'lifetimeOrders', 'lastOrderId', 'lastOrderStatus']
      .forEach(function (k) {
        if (!attrs[k]) return;
        var dt = document.createElement('dt'); dt.textContent = k;
        var dd = document.createElement('dd'); dd.textContent = attrs[k];
        ui.ctxCardList.appendChild(dt);
        ui.ctxCardList.appendChild(dd);
      });
  }

  function renderPreview() {
    var attrs = buildAttributes();
    ui.jsonPreview.textContent = JSON.stringify(attrs, null, 2);
    ui.prefixNote.textContent = state.mode === 'plaintext'
      ? '— arrive in the flow as HostedWidget-<key>'
      : '— signed as JWT, arrive unprefixed';
  }

  function renderAll() {
    renderStorefront();
    renderPreview();
  }

  /* ---------------------------------------------------------------- widget */

  function setStatus(level, msg) {
    ui.widgetStatus.className = 'widget-status ' + (level || '');
    ui.widgetStatus.textContent = msg;
  }

  function bootWidget() {
    var ok = window.ConnectWidget.load({
      attributes: buildAttributes(),
      mode: state.mode,
      onStatus: setStatus
    });
    if (!ok) setStatus('warn', 'Widget not configured — click "Widget config"');
  }

  function switchContext(id) {
    if (id === state.contextId) return;
    state.contextId = id;
    // Drop the manual override — the tab you just clicked advertises its own
    // shopper ID, and a stale typed ID silently winning is a live-demo footgun.
    state.shopperIdOverride = '';
    ui.shopperIdInput.value = '';
    persist();
    renderTabs();
    renderAll();
    if (window.ConnectWidget.isConfigured(window.ConnectWidget.loadConfig())) {
      setStatus('warn', 'Reloading widget with new context…');
      window.ConnectWidget.reload({
        attributes: buildAttributes(),
        mode: state.mode,
        onStatus: setStatus
      });
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
    ui.attrMode.addEventListener('change', function () {
      state.mode = ui.attrMode.value;
      persist();
      renderPreview();
      if (window.ConnectWidget.isLoaded) {
        window.ConnectWidget.reload({
          attributes: buildAttributes(), mode: state.mode, onStatus: setStatus
        });
      }
    });

    var idTimer;
    ui.shopperIdInput.addEventListener('input', function () {
      state.shopperIdOverride = ui.shopperIdInput.value;
      renderAll();
      clearTimeout(idTimer);
      idTimer = setTimeout(persist, 250);
    });

    function addKv() {
      var k = ui.kvKey.value.trim();
      var v = ui.kvVal.value.trim();
      if (!k) { ui.kvKey.focus(); return; }
      state.custom[k] = v;
      ui.kvKey.value = ''; ui.kvVal.value = ''; ui.kvKey.focus();
      persist(); renderChips(); renderAll();
    }
    ui.btnAddKv.addEventListener('click', addKv);
    [ui.kvKey, ui.kvVal].forEach(function (el) {
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') addKv(); });
    });

    ui.btnReloadWidget.addEventListener('click', function () {
      setStatus('warn', 'Reloading widget…');
      window.ConnectWidget.reload({
        attributes: buildAttributes(), mode: state.mode, onStatus: setStatus
      });
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
      ui.cfgWidgetId.value = ''; ui.cfgScriptUrl.value = ''; ui.cfgSnippetId.value = '';
      setStatus('warn', 'Widget config cleared');
    });

    ui.btnOpenChat.addEventListener('click', function () {
      if (!window.ConnectWidget.isConfigured(window.ConnectWidget.loadConfig())) {
        openConfig();
        return;
      }
      if (!window.ConnectWidget.isLoaded) { bootWidget(); return; }
      setStatus('ok', 'Use the chat bubble at the bottom right ↘');
    });
  }

  /* -------------------------------------------------------------------- go */

  restore();
  ui.attrMode.value = state.mode;
  ui.shopperIdInput.value = state.shopperIdOverride;
  renderTabs();
  renderChips();
  renderAll();
  wire();

  // Expose for console poking during the demo.
  Object.defineProperty(window, '__DEMO_CONTEXT__', {
    get: function () {
      return { contextId: state.contextId, mode: state.mode, attributes: buildAttributes() };
    }
  });

  if (window.ConnectWidget.isConfigured(window.ConnectWidget.loadConfig())) {
    bootWidget();
  } else {
    setStatus('warn', 'Widget not configured — click "Widget config"');
  }
})();
