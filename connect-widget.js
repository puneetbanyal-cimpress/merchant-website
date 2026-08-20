/**
 * Amazon Connect hosted communications widget — load / teardown / reload.
 *
 * ============================================================================
 *  PASTE YOUR SNIPPET VALUES HERE. This is the only place widget config lives.
 * ============================================================================
 *
 * From your generated hosted-widget snippet:
 *
 *   (function(w, d, x, id){
 *     s = d.createElement('script');
 *     s.src = 'https://xxxxxxxx.cloudfront.net/amazon-connect-chat-interface-client.js';  <-- SCRIPT_URL
 *     ...
 *   })(window, document, 'amazon_connect', '1a2b3c4d-5e6f-...');                          <-- WIDGET_ID
 *   amazon_connect('snippetId', 'QVFJ...');                                               <-- SNIPPET_ID
 */
var CONNECT_WIDGET_CONFIG = {
  widgetId:  '786ebf9f-e686-4a98-8347-6c24bd0b8ac2',
  scriptUrl: 'https://commerce-carehub.my.connect.aws/connectwidget/static/amazon-connect-chat-interface-client.js',
  snippetId: 'QVFJREFIaThPZ042Z2Vwd1EzbWNOOW9zZVBpdlltbFlYREFwbEVldGoySmJEcktXREFFeVFGcFk2dm5DdkxuMmlQbENwT0dZQUFBQWJqQnNCZ2txaGtpRzl3MEJCd2FnWHpCZEFnRUFNRmdHQ1NxR1NJYjNEUUVIQVRBZUJnbGdoa2dCWlFNRUFTNHdFUVFNYzNCZlNYWlVFUGhLc3JyOEFnRVFnQ3NSY0l4UGVudDNCQVVNZHlkYlVBWW1aMUVweGd4QjNOclhNVHg1dzVRMU1wbGN4eXdjeGE4TUJsL2c6OkJ6K1lhQ3NSTktqamtXWTJjTEZOYXkxNzMxZDltNTU5S2VzOE00dUpSY25XVDVjNjhJY2RxN3NOOVB1SFdKYlZKNmE4cGRLUTN5SnhGQVFsN0hnZ3M2Wlc2cm1haEpSeUdrNlVIR2dXUndJTWErUGtaVDFwVzF4dm1sNi92Z1I5Yit1SHFySG13UEw4YnZpT0tBei9vVnNIaEd1WlVRVT0=',

  // The rest of the generated snippet's config calls, replayed on every boot.
  styles: {
    iconType: 'CHAT_VOICE',
    openChat: { color: '#ffffff', backgroundColor: '#124754' },
    closeChat: { color: '#ffffff', backgroundColor: '#123456' }
  },
  supportedMessagingContentTypes: [
    'text/plain',
    'text/markdown',
    'application/vnd.amazonaws.connect.message.interactive',
    'application/vnd.amazonaws.connect.message.interactive.response'
  ]
};

/**
 * Attributes are passed in plaintext via amazon_connect('contactAttributes', …).
 * They arrive in your contact flow prefixed — `HostedWidget-shopperId` — under
 * the "User defined" namespace. No backend, no widget security required.
 *
 * Why teardown-and-reload:
 *   The amazon_connect(...) calls are queued and consumed once, when the widget
 *   client boots. There is no public API to mutate contact attributes on an
 *   already-initialised widget. So a new shopper ID means ripping the widget out
 *   of the page and booting it again.
 *
 *   Teardown is best-effort DOM surgery. If it ever misbehaves against a real
 *   instance, flip RELOAD_STRATEGY to 'page' — the shopper ID lives in
 *   localStorage, so a full page reload is a bulletproof fallback for a demo.
 */
(function () {
  'use strict';

  // 'dom'  -> remove the widget's nodes + globals, re-inject the script (no page flash)
  // 'page' -> persist state and location.reload()
  var RELOAD_STRATEGY = 'dom';

  var state = {
    loaded: false,
    bodyBefore: null,
    headBefore: null,
    scriptEl: null,
    lastAttributes: null
  };

  function config() {
    return {
      widgetId: (CONNECT_WIDGET_CONFIG.widgetId || '').trim(),
      scriptUrl: (CONNECT_WIDGET_CONFIG.scriptUrl || '').trim(),
      snippetId: (CONNECT_WIDGET_CONFIG.snippetId || '').trim(),
      styles: CONNECT_WIDGET_CONFIG.styles,
      supportedMessagingContentTypes: CONNECT_WIDGET_CONFIG.supportedMessagingContentTypes
    };
  }

  function isConfigured() {
    var c = config();
    return !!(c.widgetId && c.scriptUrl);
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
    var cfg = config();
    var say = opts.onStatus || function () {};

    if (!isConfigured()) {
      say('warn', 'Widget not configured — set CONNECT_WIDGET_CONFIG in connect-widget.js');
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
    if (cfg.styles) {
      window.amazon_connect('styles', cfg.styles);
    }
    if (cfg.supportedMessagingContentTypes) {
      window.amazon_connect('supportedMessagingContentTypes', cfg.supportedMessagingContentTypes);
    }

    // Keys arrive in the contact flow PREFIXED: HostedWidget-shopperId.
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
      say('err', 'Failed to load widget script — check scriptUrl in connect-widget.js');
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
    isConfigured: isConfigured,
    normalizeAttributes: normalizeAttributes,
    get config() { return config(); },
    get isLoaded() { return state.loaded; },
    // True once anything has been injected, including a script that errored.
    // Teardown must key off this, not isLoaded, or a failed boot leaves its tag
    // behind and the next load stacks a second one.
    get hasWidget() { return state.loaded || !!state.scriptEl; },
    get lastAttributes() { return state.lastAttributes; }
  };
})();
