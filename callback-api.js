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
  endpoint: 'https://cykdl4xwkivlkod3mpx6s62sky0pjzrl.lambda-url.eu-west-1.on.aws',
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

  var SIMULATED_LATENCY_MS = 800;

  /**
   * Build the request body from both wizard steps plus the active chat context.
   *
   * The shape is fixed by the API contract: these fourteen keys, in this order,
   * every one always present. Two rules keep it that way:
   *
   *  - Every string field is forced to a string. `undefined` is not "null" to
   *    JSON.stringify — it DROPS the key entirely, so a single unset value would
   *    silently send a body missing a field the API requires.
   *  - Nothing is ever null. An absent phone number or shopper is sent as '',
   *    so each field's type is constant and the API never has to special-case
   *    a null before trimming it or handing it to Connect.
   *
   * Only `consentToCallRecording` is a boolean.
   *
   * @param {object} form     values collected across step 1 and step 2
   * @param {object} context  the current chat context (shopperId/firstName/lastName)
   * @param {string} nowIso   ISO timestamp for the request
   */
  function buildPayload(form, context, nowIso) {
    form = form || {};
    context = context || {};

    var str = function (v) { return v === null || v === undefined ? '' : String(v); };

    var digits = str(form.phone).replace(/[^\d]/g, '');
    var dial = str(form.dialCode).replace(/[^\d+]/g, '');
    var e164 = digits
      ? dial + digits.replace(new RegExp('^' + dial.replace('+', '')), '')
      : '';

    return {
      // step 1 — who to call
      contactReason: str(form.contactReason),
      firstName: str(form.firstName),
      lastName: str(form.lastName),
      countryRegion: str(form.countryRegion),
      dialCode: str(form.dialCode),
      phone: str(form.phone),
      phoneE164: e164,
      consentToCallRecording: !!form.consent,

      // step 2 — what about
      description: str(form.description),

      // who they are — the same context the chat widget carries
      shopperId: str(context.shopperId),

      // provenance
      source: 'quirepress-web',
      channel: 'callback',
      requestedAt: str(nowIso),
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
        data: {
          referenceId: 'SIM-' + Math.abs(hash(JSON.stringify(payload))).toString(36).toUpperCase(),
          caseNumber: 'CS-SIM'
        }
      };
    }

    // ---- Real request ---------------------------------------------------
    // Logged as the exact serialised string that goes on the wire, so it can be
    // diffed against a Postman body character for character.
    var json = JSON.stringify(payload);
    console.info('[quirepress] POST ' + CALLBACK_API.endpoint + '\n' + json);

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, CALLBACK_API.timeoutMs);

    try {
      var res = await fetch(CALLBACK_API.endpoint, {
        method: CALLBACK_API.method,
        headers: CALLBACK_API.headers,
        body: json,
        signal: controller.signal
      });

      var data = null;
      try { data = await res.json(); } catch (e) { /* empty or non-JSON body is fine */ }

      if (!res.ok) {
        console.error('[quirepress] callback request failed', res.status, data);
        return {
          ok: false,
          simulated: false,
          status: res.status,
          data: data,
          // The API's own message wins — it is written for this situation.
          // Otherwise fall back to something the customer can act on; a bare
          // status code tells them nothing.
          error: (data && (data.message || data.error)) || messageForStatus(res.status)
        };
      }
      return { ok: true, simulated: false, status: res.status, data: data };
    } catch (err) {
      console.error('[quirepress] callback request errored', err);
      return {
        ok: false,
        simulated: false,
        error: err.name === 'AbortError'
          ? 'That took too long to go through. Please try again.'
          // fetch() rejects with a TypeError for a dropped connection AND for a
          // CORS rejection — the browser deliberately hides which. "Failed to
          // fetch" in front of a customer is meaningless, so say something they
          // can act on and leave the diagnosis to the console line above.
          : "We couldn't reach us just now. Check your connection and try again."
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Customer-readable fallback when the API returns no message of its own. */
  function messageForStatus(status) {
    if (status === 400 || status === 422) {
      return 'Some of those details were rejected. Please check them and try again.';
    }
    if (status === 401 || status === 403) {
      return "We couldn't authorise that request. Please try again, or call us instead.";
    }
    if (status === 404) {
      return "That service isn't available right now. Please call us instead.";
    }
    if (status === 429) {
      return "That's a few too many requests. Please wait a minute and try again.";
    }
    if (status >= 500) {
      return 'Something went wrong at our end. Please try again in a moment.';
    }
    return 'Something went wrong. Please try again.';
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
