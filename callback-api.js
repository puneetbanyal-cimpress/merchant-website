/**
 * Callback request submission.
 *
 * ============================================================================
 *  PASTE THE ENDPOINT HERE WHEN YOU HAVE IT. Nothing else needs to change.
 * ============================================================================
 *
 * With `endpoint` empty the form runs in simulation mode: the payload is logged
 * to the console and a success response is faked after a short delay, so the
 * demo flow is complete end to end. Fill `endpoint` in and the same payload goes
 * out as a real POST.
 */
var CALLBACK_API = {
  endpoint: '',            // e.g. 'https://api.example.com/v1/callback-requests'
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
    // 'Authorization': 'Bearer …',
    // 'x-api-key': '…',
  },
  timeoutMs: 15000
};

(function () {
  'use strict';

  var SIMULATED_LATENCY_MS = 700;

  /**
   * Build the request body from the form values plus the active chat context.
   *
   * Kept as one function so the payload shape is obvious and easy to reshape
   * when the real API's contract lands.
   *
   * @param {object} form     values read off the callback form
   * @param {object} context  the current chat context (shopperId/Name/Email)
   * @param {string} nowIso   ISO timestamp for the request
   */
  function buildPayload(form, context, nowIso) {
    return {
      // who to call
      fullName: form.fullName,
      email: form.email,
      countryCode: form.countryCode,
      phone: form.phone,
      phoneE164: (form.countryCode || '').replace(/-.*$/, '') +
                 (form.phone || '').replace(/[^\d]/g, ''),

      // what about
      reason: form.reason,
      orderNumber: form.orderNumber || null,
      preferredTime: form.preferredTime,
      notes: form.notes || null,
      consent: !!form.consent,

      // who they are — same context the chat widget carries
      shopperId: context.shopperId || null,
      shopperName: context.shopperName || null,
      shopperEmail: context.shopperEmail || null,

      // provenance
      source: 'quirepress-web',
      channel: 'callback',
      requestedAt: nowIso,
      pageUrl: location.href
    };
  }

  /**
   * POST the callback request.
   *
   * @returns {Promise<{ok: boolean, simulated: boolean, status?: number, data?: any, error?: string}>}
   */
  async function submitCallbackRequest(form, context) {
    var payload = buildPayload(form, context, new Date().toISOString());

    // ---- Simulation mode -----------------------------------------------
    // No endpoint configured yet. Log what *would* be sent and fake a 201.
    if (!CALLBACK_API.endpoint) {
      console.info('[quirepress] callback request (simulated — no endpoint set):', payload);
      await new Promise(function (r) { setTimeout(r, SIMULATED_LATENCY_MS); });
      return {
        ok: true,
        simulated: true,
        status: 201,
        data: { referenceId: 'SIM-' + Math.abs(hash(JSON.stringify(payload))).toString(36).toUpperCase() }
      };
    }

    // ---- Real request ---------------------------------------------------
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, CALLBACK_API.timeoutMs);

    try {
      var res = await fetch(CALLBACK_API.endpoint, {
        method: CALLBACK_API.method,
        headers: CALLBACK_API.headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      var data = null;
      try { data = await res.json(); } catch (e) { /* empty or non-JSON body is fine */ }

      if (!res.ok) {
        return {
          ok: false,
          simulated: false,
          status: res.status,
          data: data,
          error: (data && (data.message || data.error)) || ('Request failed with ' + res.status)
        };
      }
      return { ok: true, simulated: false, status: res.status, data: data };
    } catch (err) {
      return {
        ok: false,
        simulated: false,
        error: err.name === 'AbortError' ? 'The request timed out.' : err.message
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Tiny non-crypto hash, only used to mint a readable fake reference id. */
  function hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
    return h;
  }

  window.CallbackApi = {
    submit: submitCallbackRequest,
    buildPayload: buildPayload,
    get isConfigured() { return !!CALLBACK_API.endpoint; }
  };
})();
