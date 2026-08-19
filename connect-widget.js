/**
 * Amazon Connect hosted communications widget — load / teardown / reload.
 *
 * Attributes are passed in plaintext via amazon_connect('contactAttributes', …).
 * They arrive in your contact flow prefixed — `HostedWidget-shopperId`, etc.,
 * under the "User defined" namespace. No backend, no widget security required.
 *
 * Why teardown-and-reload:
 *   The amazon_connect(...) calls are queued and consumed once, when the widget
 *   client boots. There is no public API to mutate contact attributes on an
 *   already-initialised widget. So changing the context means ripping the widget
 *   out of the page and booting it again with the new attributes.
 *
 *   Teardown is best-effort DOM surgery. If it ever misbehaves against a real
 *   instance, flip RELOAD_STRATEGY to 'page' — the context lives in
 *   localStorage, so a full page reload is a bulletproof fallback for a demo.
 */
(function () {
  'use strict';

  // 'dom'  -> remove the widget's nodes + globals, re-inject the script (no page flash)
  // 'page' -> persist state and location.reload()
  var RELOAD_STRATEGY = 'dom';

  var STORAGE_KEY = 'commerce-hub-demo:connect-config';

  /**
   * Defaults for the hosted-widget snippet.
   *
   * Leave blank and use the "Widget config" panel at demo time, OR paste your
   * generated snippet's values here to bake them into the build.
   * Anything saved via the config panel (localStorage) overrides these.
   */
  var DEFAULT_CONFIG = {
    widgetId: '',
    scriptUrl: '',   // e.g. https://xxxxxxxx.cloudfront.net/amazon-connect-chat-interface-client.js
    snippetId: ''    // optional; only if your snippet calls amazon_connect('snippetId', ...)
  };

  var state = {
    loaded: false,
    bodyBefore: null,
    headBefore: null,
    scriptEl: null,
    lastAttributes: null
  };

  /* ------------------------------------------------------------------ config */

  function loadConfig() {
    var saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch (e) { /* ignore */ }
    return {
      widgetId: saved.widgetId || DEFAULT_CONFIG.widgetId || '',
      scriptUrl: saved.scriptUrl || DEFAULT_CONFIG.scriptUrl || '',
      snippetId: saved.snippetId || DEFAULT_CONFIG.snippetId || ''
    };
  }

  function saveConfig(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      widgetId: (cfg.widgetId || '').trim(),
      scriptUrl: (cfg.scriptUrl || '').trim(),
      snippetId: (cfg.snippetId || '').trim()
    }));
  }

  function clearConfig() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function isConfigured(cfg) {
    return !!(cfg && cfg.widgetId && cfg.scriptUrl);
  }

  /**
   * Best-effort parse of a pasted hosted-widget snippet.
   * Pulls the widgetId (last arg of the IIFE), the script src, and snippetId.
   */
  function parseSnippet(text) {
    var out = { widgetId: '', scriptUrl: '', snippetId: '' };
    if (!text) return out;

    var src = text.match(/s\.src\s*=\s*['"]([^'"]+)['"]/);
    if (!src) src = text.match(/(https?:\/\/[^\s'"]+amazon-connect-chat-interface-client\.js)/);
    if (src) out.scriptUrl = src[1];

    // (window, document, 'amazon_connect', '<widgetId>')
    var wid = text.match(/['"]amazon_connect['"]\s*,\s*['"]([^'"]+)['"]/);
    if (wid) out.widgetId = wid[1];

    var snip = text.match(/amazon_connect\(\s*['"]snippetId['"]\s*,\s*['"]([^'"]+)['"]\s*\)/);
    if (snip) out.snippetId = snip[1];

    return out;
  }

  /* ---------------------------------------------------------------- payload */

  /**
   * Amazon Connect requires string-to-string attributes. Anything else
   * (numbers, booleans, null) breaks the chat, so coerce and drop empties.
   */
  function normalizeAttributes(attrs) {
    var out = {};
    Object.keys(attrs || {}).forEach(function (k) {
      var key = String(k).trim();
      if (!key) return;
      var v = attrs[k];
      if (v === null || v === undefined) return;
      var val = String(v);
      if (val === '') return;
      out[key] = val;
    });
    return out;
  }

  /* --------------------------------------------------------------- teardown */

  function snapshot(node) {
    return Array.prototype.slice.call(node.childNodes);
  }

  function removeAdded(node, before) {
    if (!before) return;
    var seen = new Set(before);
    snapshot(node).forEach(function (n) {
      if (!seen.has(n)) {
        try { node.removeChild(n); } catch (e) { /* ignore */ }
      }
    });
  }

  function destroy() {
    // 1. the injected snippet script (it carries id === widgetId)
    if (state.scriptEl && state.scriptEl.parentNode) {
      state.scriptEl.parentNode.removeChild(state.scriptEl);
    }
    state.scriptEl = null;

    // 2. anything the widget appended to <head> / <body> after boot
    removeAdded(document.head, state.headBefore);
    removeAdded(document.body, state.bodyBefore);

    // 3. belt-and-braces: known widget containers, wherever they ended up
    [
      '#amazon-connect-chat-widget',
      '#amazon-connect-open-widget-button',
      '#amazon-connect-close-widget-button',
      '[id^="amazon-connect"]',
      'iframe[src*="amazon-connect"]'
    ].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        try { el.remove(); } catch (e) { /* ignore */ }
      });
    });

    // 4. globals the client sets up, so the next boot starts clean
    ['amazon_connect', 'connect', 'AmazonConnectChatWidget', 'ACChatWidget'].forEach(function (g) {
      try { delete window[g]; } catch (e) { window[g] = undefined; }
    });

    state.loaded = false;
    state.bodyBefore = null;
    state.headBefore = null;
  }

  /* ------------------------------------------------------------------- load */

  /**
   * @param {object}   opts
   * @param {object}   opts.attributes  string->string map
   * @param {function} [opts.onStatus]  (level, message) => void
   */
  function load(opts) {
    opts = opts || {};
    var cfg = loadConfig();
    var say = opts.onStatus || function () {};

    if (!isConfigured(cfg)) {
      say('warn', 'Widget not configured — open "Widget config"');
      return false;
    }

    // Tear down on ANY previous attempt, not just successful ones — a script that
    // failed to load still leaves its tag (and a stale queue) behind.
    if (state.loaded || state.scriptEl) destroy();

    var attrs = normalizeAttributes(opts.attributes);
    var count = Object.keys(attrs).length;
    state.lastAttributes = attrs;

    state.headBefore = snapshot(document.head);
    state.bodyBefore = snapshot(document.body);

    // The stub queue, exactly as the generated snippet defines it.
    window.amazon_connect = window.amazon_connect || function () {
      (window.amazon_connect.ac = window.amazon_connect.ac || []).push(arguments);
    };

    if (cfg.snippetId) {
      window.amazon_connect('snippetId', cfg.snippetId);
    }

    // Keys arrive in the contact flow PREFIXED: HostedWidget-shopperId, etc.
    // Read them with a "Check contact attributes" block, namespace "User defined".
    window.amazon_connect('contactAttributes', attrs);

    var s = document.createElement('script');
    s.type = 'text/javascript';
    s.src = cfg.scriptUrl;
    s.async = 1;
    s.id = cfg.widgetId;
    s.onload = function () {
      state.loaded = true;
      say('ok', 'Widget loaded with ' + count + ' attribute' + (count === 1 ? '' : 's'));
    };
    s.onerror = function () {
      say('err', 'Failed to load widget script — check the snippet URL');
    };
    document.head.appendChild(s);
    state.scriptEl = s;

    console.info('[commerce-hub-demo] widget booting with attributes:', attrs);
    say('warn', 'Loading widget…');
    return true;
  }

  function reload(opts) {
    if (RELOAD_STRATEGY === 'page') {
      location.reload();
      return true;
    }
    return load(opts);
  }

  window.ConnectWidget = {
    load: load,
    reload: reload,
    destroy: destroy,
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    clearConfig: clearConfig,
    isConfigured: isConfigured,
    parseSnippet: parseSnippet,
    normalizeAttributes: normalizeAttributes,
    get isLoaded() { return state.loaded; },
    get lastAttributes() { return state.lastAttributes; }
  };
})();
