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
  var CUSTOM_KEY = 'quirepress-demo:customShoppers';
  var BUILT_IN = window.DEMO_SHOPPERS || [];
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
   'cbDesc','cbCount','cbBack','cbNext','cbSubmit','cbClose','cbStatus','cbDoneMsg',
   'adminDialog','admForm','admFirst','admLast','admId','admError','admAdd',
   'admList','admEmpty','admCount','admClear','admClose'
  ].forEach(function (id) { ui[id] = document.getElementById(id); });

  /**
   * The shopper whose context is live (null = none).
   *
   * The dropdown writes straight to this — there is deliberately no separate
   * "staged" selection. Holding a pending value that only the button committed
   * meant the widget and the callback form could disagree with what the
   * dropdown visibly said, which is exactly the confusion this had.
   */
  var active = null;
  /** Wizard position: 1, 2, or 'done'. */
  var step = 1;
  /** Fields the user has actually focused, so blur only scolds touched ones. */
  var touched = new Set();

  /* ------------------------------------------------------------------ state */

  /**
   * Shoppers added at runtime through the hidden ?addShopper route.
   * Stored per-browser, so they are a scratch pad for a demo rather than data.
   */
  var custom = [];

  function loadCustom() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch (e) {}
    if (!Array.isArray(raw)) return [];
    // Re-validate on read: hand-edited localStorage would otherwise put a
    // malformed entry straight into the attributes sent to Amazon Connect.
    return raw.filter(function (s) {
      return s && typeof s.firstName === 'string' && typeof s.lastName === 'string' &&
             typeof s.shopperId === 'string' && s.shopperId.trim() !== '';
    });
  }

  function saveCustom() {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); } catch (e) {}
  }

  /** Built-ins first, then anything added at runtime. */
  function allShoppers() {
    return BUILT_IN.concat(custom);
  }

  function findShopper(id) {
    return allShoppers().find(function (s) { return s.shopperId === id; }) || null;
  }

  function fullName(s) {
    return s ? (s.firstName + ' ' + s.lastName) : '';
  }

  function restore() {
    var saved = '';
    try { saved = localStorage.getItem(STATE_KEY) || ''; } catch (e) {}
    var qp = new URLSearchParams(location.search).get('shopperId');
    active = findShopper(qp || saved);
  }

  function persist() {
    try {
      if (active) localStorage.setItem(STATE_KEY, active.shopperId);
      else localStorage.removeItem(STATE_KEY);
    } catch (e) {}
  }

  /**
   * Strip our own params out of the address bar once they have been read.
   *
   * Switching shopper reloads the page (see connect-widget.js), and restore()
   * gives the query string priority over localStorage — so a ?shopperId= left
   * sitting in the URL would silently override every later selection and snap
   * the demo back to the linked shopper. A stale #add-shopper would likewise
   * re-open the admin panel on every switch.
   *
   * Called once at the end of boot, after everything that reads them has run.
   */
  function cleanUrl() {
    if (!window.history || !history.replaceState) return;
    var url = new URL(location.href);
    var touchedUrl = false;

    ['shopperId', 'addShopper', 'firstName', 'lastName'].forEach(function (k) {
      if (url.searchParams.has(k)) { url.searchParams.delete(k); touchedUrl = true; }
    });
    if (url.hash === '#add-shopper') { url.hash = ''; touchedUrl = true; }

    if (touchedUrl) {
      history.replaceState(null, '', url.pathname + (url.search || '') + (url.hash || ''));
    }
  }

  /** The exact string->string map handed to Amazon Connect. */
  function buildAttributes() {
    if (!active) return {};
    return window.ConnectWidget.normalizeAttributes({
      shopperId: active.shopperId,
      firstName: active.firstName,
      lastName: active.lastName,
      // Sent as an attribute as well as via customerDisplayName: the display
      // name itself is a chat participant detail, not a contact attribute, so
      // Streams' contact.getAttributes() cannot see it. Duplicating it here is
      // what makes the same string readable from a custom CCP.
      displayName: fullName(active)
    });
  }

  function hasContext() {
    return Object.keys(buildAttributes()).length > 0;
  }

  /* --------------------------------------------------------------- rendering */

  /** Rebuilt whenever a runtime shopper is added or removed. */
  function rebuildShopperOptions() {
    var keep = ui.shopperSelect.value;
    ui.shopperSelect.innerHTML = '';

    var blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Select a shopper…';
    ui.shopperSelect.appendChild(blank);

    allShoppers().forEach(function (s, i) {
      var o = document.createElement('option');
      o.value = s.shopperId;
      o.textContent = fullName(s) + (i >= BUILT_IN.length ? ' (added)' : '');
      ui.shopperSelect.appendChild(o);
    });

    // Only restore the selection if that shopper still exists.
    ui.shopperSelect.value = findShopper(keep) ? keep : '';
  }

  function buildStaticOptions() {
    rebuildShopperOptions();

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
      window.ConnectWidget.clearPersistedSession();
      // hasWidget, not isLoaded — a script that errored still left its tag.
      if (window.ConnectWidget.hasWidget) {
        // Under the page strategy a live widget can't be reliably removed in
        // place, so reload into a clean page with no context.
        if (isUserAction && window.ConnectWidget.reloadStrategy === 'page') {
          location.reload();
          return false;
        }
        window.ConnectWidget.destroy();
      }
      setStatus('warn', 'No chat context — widget not loaded');
      return false;
    }
    if (!window.ConnectWidget.isConfigured()) {
      setStatus('warn', 'Widget not configured — set CONNECT_WIDGET_CONFIG in connect-widget.js');
      return false;
    }

    // The amazon_connect() config calls are consumed once at boot, so new
    // attributes only reach the flow via a fresh boot.
    //
    // On first paint the widget has never booted, so load() directly — calling
    // reload() here would trigger location.reload() under the page strategy and
    // the page would refresh forever.
    var start = isUserAction ? window.ConnectWidget.reload : window.ConnectWidget.load;
    return start({
      attributes: buildAttributes(),
      displayName: fullName(active),
      onStatus: setStatus
    });
  }

  /**
   * Commit whatever the dropdown currently shows and reboot the widget.
   * Called by the dropdown itself and by the button, so the two can never
   * disagree about which shopper is live.
   */
  function applyContext() {
    active = findShopper(ui.shopperSelect.value);
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


  /* --------------------------------------------------- hidden shopper admin */

  /**
   * Reachable only via ?addShopper or #add-shopper — nothing on the page links
   * to it. Entries are per-browser localStorage, so they are a scratch pad for
   * a demo, not data: another machine, another browser, or a cleared cache all
   * start from the built-in list again.
   */
  function adminRouteRequested() {
    var qp = new URLSearchParams(location.search);
    return qp.has('addShopper') || location.hash === '#add-shopper';
  }

  /**
   * @returns {string} '' on success, otherwise the reason it was rejected.
   */
  function addShopper(entry) {
    var first = String((entry && entry.firstName) || '').trim();
    var last = String((entry && entry.lastName) || '').trim();
    var id = String((entry && entry.shopperId) || '').trim();

    if (!first) return 'First name is required.';
    if (!last) return 'Last name is required.';
    if (!id) return 'Shopper ID is required.';
    // Same rule Amazon Connect applies to the display name.
    if ((first + ' ' + last).length > 256) return 'Name is longer than 256 characters.';
    if (findShopper(id)) return 'A shopper with that ID already exists.';

    custom.push({ firstName: first, lastName: last, shopperId: id });
    saveCustom();
    rebuildShopperOptions();
    renderAdminList();
    return '';
  }

  function removeShopper(id) {
    custom = custom.filter(function (s) { return s.shopperId !== id; });
    saveCustom();
    // Removing the shopper that is currently live must also drop the context,
    // otherwise the widget keeps sending a shopper the list no longer contains.
    if (active && active.shopperId === id) {
      active = null;
      persist();
      render();
      syncWidget(true);
    }
    rebuildShopperOptions();
    renderAdminList();
  }

  function renderAdminList() {
    ui.admList.innerHTML = '';
    custom.forEach(function (s) {
      var li = document.createElement('li');

      var text = document.createElement('div');
      text.className = 'adm__item-text';
      var name = document.createElement('strong');
      name.textContent = fullName(s);
      var id = document.createElement('code');
      id.textContent = s.shopperId;
      id.title = s.shopperId;
      text.appendChild(name);
      text.appendChild(id);

      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'adm__remove';
      rm.textContent = '\u00d7';
      rm.title = 'Remove ' + fullName(s);
      rm.setAttribute('aria-label', 'Remove ' + fullName(s));
      rm.addEventListener('click', function () { removeShopper(s.shopperId); });

      li.appendChild(text);
      li.appendChild(rm);
      ui.admList.appendChild(li);
    });

    ui.admEmpty.hidden = custom.length > 0;
    ui.admClear.hidden = custom.length === 0;
    ui.admCount.textContent = '(' + custom.length + ')';
  }

  function openAdmin() {
    ui.admError.textContent = '';
    renderAdminList();
    ui.adminDialog.showModal();
    ui.admFirst.focus();
  }

  function wireAdmin() {
    ui.admForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = addShopper({
        firstName: ui.admFirst.value,
        lastName: ui.admLast.value,
        shopperId: ui.admId.value
      });
      ui.admError.textContent = err;
      if (err) return;
      ui.admFirst.value = '';
      ui.admLast.value = '';
      ui.admId.value = '';
      ui.admFirst.focus();
    });

    ui.admClear.addEventListener('click', function () {
      custom.slice().forEach(function (s) { removeShopper(s.shopperId); });
    });

    ui.admClose.addEventListener('click', function () { ui.adminDialog.close(); });
    ui.adminDialog.addEventListener('click', function (e) {
      if (e.target === ui.adminDialog) ui.adminDialog.close();
    });

    // Deep link: ?addShopper&firstName=Ada&lastName=Lovelace&shopperId=ABC-123
    // adds in one go, for scripted demos with no typing.
    var qp = new URLSearchParams(location.search);
    if (qp.has('addShopper') && qp.get('shopperId')) {
      var err = addShopper({
        firstName: qp.get('firstName'),
        lastName: qp.get('lastName'),
        shopperId: qp.get('shopperId')
      });
      if (err) console.warn('[quirepress] addShopper via URL rejected:', err);
    }

    // Console escape hatch, always available.
    window.__ADD_SHOPPER__ = function (entry) {
      var err = addShopper(entry);
      if (err) { console.warn('[quirepress]', err); return false; }
      console.info('[quirepress] added', entry);
      return true;
    };
    window.__CLEAR_SHOPPERS__ = function () {
      custom.slice().forEach(function (s) { removeShopper(s.shopperId); });
      return true;
    };
  }

  /* ----------------------------------------------------------------- wiring */

  function wire() {
    // Changing the dropdown IS changing the context. The button is a manual
    // re-apply for when you want to reboot the widget without switching shopper.
    ui.shopperSelect.addEventListener('change', applyContext);
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

  custom = loadCustom();
  buildStaticOptions();
  restore();
  ui.shopperSelect.value = active ? active.shopperId : '';
  render();
  wire();
  wireAdmin();
  if (adminRouteRequested()) openAdmin();
  cleanUrl();

  // Handy during a demo: `__DEMO_CONTEXT__` shows what the next chat will carry.
  Object.defineProperty(window, '__DEMO_CONTEXT__', {
    get: function () { return buildAttributes(); }
  });

  // Only boots if a shopper survived from localStorage or the query string.
  syncWidget(false);
})();
