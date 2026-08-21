# Prompt: build the callback-request Lambda

Hand everything below to the agent building the Lambda. It is self-contained — they do not need access to the front-end repo.

---

## Task

Build and deploy an AWS Lambda that receives **callback requests** from a live website and queues a callback in **Amazon Connect**.

**The website is already deployed at `https://commerce-hub-website.netlify.app` and will not change.** Your endpoint must match the contract below exactly. The single configurable value on the site is the endpoint URL; everything else about the request is fixed and out of your control.

(The site is branded "Quirepress" while the host is `commerce-hub-website.netlify.app` — a leftover from an earlier name. Same site; don't read anything into the mismatch.)

---

## 1. The request you will receive

**Method:** `POST`
**Content-Type:** `application/json`
**Origin:** `https://commerce-hub-website.netlify.app` — a real browser, cross-origin. Also `http://localhost:*` while the site is run locally for development.

### Body

```jsonc
{
  // --- step 1 of the form: who to call ---
  "contactReason": "order-status",
  "firstName": "Paul",
  "lastName": "Harraghy",
  "countryRegion": "US",
  "dialCode": "+1",
  "phone": "+1 5550104477",
  "phoneE164": "+15550104477",
  "consentToCallRecording": true,

  // --- step 2 of the form: what it's about ---
  "description": "My banner order arrived with the wrong dimensions.",

  // --- shopper context: the same value the chat widget passes to Connect ---
  "shopperId": "d2FyaG9s-237A146D7D6859E2CE8BEFDCAB4D38F9",

  // --- provenance ---
  "source": "quirepress-web",
  "channel": "callback",
  "requestedAt": "2026-08-21T08:59:59.669Z",
  "pageUrl": "https://commerce-hub-website.netlify.app/index.html"
}
```

### Field reference

| Field | Type | Notes |
|---|---|---|
| `contactReason` | string | One of `order-status`, `reprint`, `refund`, `design-help`, `billing`, `account`, `other`. Always present. |
| `firstName` | string | Non-empty. |
| `lastName` | string | Non-empty. |
| `countryRegion` | string | ISO-3166 alpha-2, one of `US CA GB IE AU NZ IN SG DE AT CH NL FR ES IT SE`. |
| `dialCode` | string | e.g. `"+1"`, `"+44"`. Corresponds to `countryRegion`. |
| `phone` | string | **Exactly as typed**, dial code included, spacing arbitrary. Assume no format. |
| `phoneE164` | string \| null | Best-effort E.164 assembled in the browser. **A hint, not a validated value** — re-normalise server-side. `null` when no digits were entered. |
| `consentToCallRecording` | boolean | The form won't submit without it, so expect `true`. Reject `false` regardless. |
| `description` | string | 15–1000 characters, enforced client-side. Re-check server-side. |
| `shopperId` | string \| null | Opaque, up to ~64 chars, mixed case with hyphens (e.g. `d2FyaG9s-237A146…`). `null` when the visitor never picked a shopper. **Must not be required.** |
| `source` | string | Always `"quirepress-web"`. |
| `channel` | string | Always `"callback"`. |
| `requestedAt` | string | ISO-8601 UTC from the browser — **an untrusted clock**. Use server time for anything that matters. |
| `pageUrl` | string | Full URL of the submitting page. |

**Trust nothing in this body.** It comes from a browser and is trivially forged. Validate every field server-side; the client-side validation exists for UX only.

---

## 2. The response you must return

The site's handling of your response is already written and fixed. Match it or the UI will misreport what happened.

### Success

- **Any 2xx status.**
- Body: JSON, or empty. If JSON, the site reads **`referenceId`** and shows it to the customer as their reference number. An empty or non-JSON body still counts as success — the UI just displays `—` in place of a reference.

```json
{ "referenceId": "CB-2026-0A73F1" }
```

Return something support can actually search on: the Amazon Connect contact ID, or your own ticket ID mapped to it.

### Failure

- **Any non-2xx status.**
- Body: JSON carrying **`message`** or **`error`**. The site prints that string **verbatim to the customer**, inline in the dialog, and re-enables the submit button so they can retry.

```json
{ "message": "We couldn't reach our phone system. Please try again in a minute." }
```

Write these as customer-facing copy, not developer diagnostics. **Never leak stack traces, ARNs, account IDs, or internal hostnames** — log those instead. If the body is missing or unparseable, the site falls back to `"Request failed with <status>"`.

### Timeout

The browser aborts at **15 seconds** and shows "The request timed out." Anything slower is wasted work. If queueing the callback might be slow, accept the request, return `202` with a reference, and complete the Connect call asynchronously.

---

## 3. CORS — expect this to be what breaks first

The site sends `Content-Type: application/json`, which makes every call a **non-simple request**, so each one is preceded by an `OPTIONS` preflight. Get this wrong and the site reports a generic network error with nothing useful behind it.

Required:

- Handle `OPTIONS`, return **204** with:
  - `Access-Control-Allow-Origin: https://commerce-hub-website.netlify.app`
  - `Access-Control-Allow-Methods: POST, OPTIONS`
  - `Access-Control-Allow-Headers: content-type` — **plus any custom header you require** (e.g. `x-api-key`). A header the site sends but preflight doesn't allow kills the whole request.
  - `Access-Control-Max-Age: 86400`
- **The POST response must carry `Access-Control-Allow-Origin` too — including on errors.** A 500 without CORS headers reaches the browser as an opaque network failure, so the customer sees a generic message instead of the real one. This is the single most common way this integration fails silently.

Allow-list `https://commerce-hub-website.netlify.app` and `http://localhost:*`. Echo the matched origin rather than using `*`, so credentials stay possible later.

Netlify also serves the site on deploy-preview URLs (`https://<hash>--commerce-hub-website.netlify.app`). If anyone will test from one, allow-list that pattern too.

---

## 4. What the Lambda should do

1. **Validate.** Return 400 with a customer-readable `message` if: `description` is under 15 or over 1000 characters; `firstName` or `lastName` is empty; `consentToCallRecording` isn't `true`; `contactReason` is outside the enum; or the phone number can't be normalised to something dialable.
2. **Normalise the phone** from `phone` + `dialCode` server-side. Don't rely on `phoneE164`.
3. **Queue the callback in Amazon Connect** — `StartOutboundVoiceContact` for a voice callback, or `StartTaskContact` for a queued task an agent works. Attach the details as **contact attributes** so the agent gets a screen pop:
   - `shopperId`, `firstName`, `lastName`, `contactReason`, `description`, `phoneE164`, `countryRegion`, `source`, `channel`, `requestedAt` (server time), `pageUrl`
   - **Every attribute value must be a string.** Connect rejects non-strings and the failure is opaque. Coerce, and drop empty values rather than sending `""`.
   - The chat widget on the same site passes `shopperId`, `firstName`, `lastName`, and those arrive in the flow **prefixed** as `HostedWidget-shopperId`. Attributes you set here arrive **unprefixed**. Keep the base names identical so one contact flow can read both paths.
4. **Respect opening hours** — Sun 08:00–20:00, Mon 07:00–00:00, Tue–Fri 24h, Sat 00:00–20:00, all **EST**. Outside them, either queue for the next open window or return a 4xx whose `message` tells the customer when they'll be called. Don't silently drop the request.
5. **Log** the full request with a correlation ID, redacting the phone number anywhere the log stream isn't access-controlled.
6. **Return** `{ "referenceId": "…" }`.

---

## 5. Non-functional requirements

- **Runtime:** Node.js 20+ or Python 3.12, your call. No heavy framework — this is one route.
- **Endpoint:** Lambda Function URL or API Gateway HTTP API. The Function URL is simpler and has built-in CORS config; HTTP API gives you throttling and API keys.
- **Auth — decide this before you build.** The caller is a static site with no backend, so **any credential it holds is publicly readable in its JavaScript**. A Function URL with `AWS_IAM` auth cannot be called from a browser at all. Realistic options: leave it unauthenticated and defend with rate limiting; put API Gateway + WAF in front; or require a CAPTCHA/Turnstile token the Lambda verifies. Don't treat a hard-coded key in front-end JS as authentication.
- **Abuse.** This endpoint places outbound phone calls, which makes it worth attacking. Rate-limit per source IP and per phone number, cap requests per number per hour, and reject obviously bogus numbers (premium-rate ranges, repeated digits). Add a daily spend ceiling and an alarm on volume spikes.
- **Idempotency.** A double-click, or a client retry after the 15s abort, must not produce two calls. De-duplicate on a hash of `phoneE164 + description` over a short window and return the original `referenceId`.
- **IaC.** Ship the infrastructure as SAM, CDK, or Terraform, with a README covering the deploy command and required env vars: Connect instance ID, contact flow ID, queue ARN, source phone number, allowed origins.
- **Tests.** Unit tests for validation and phone normalisation. One integration test that posts the exact sample body above and asserts 2xx with a `referenceId`.

---

## 6. Definition of done

- `curl -X OPTIONS` returns 204 with the CORS headers above.
- Posting the exact sample body returns 2xx with `{ "referenceId": "…" }`.
- A malformed body returns 4xx with a customer-readable `message` **and CORS headers present**.
- The callback lands in Amazon Connect with `shopperId` visible as a contact attribute.
- A request with `"shopperId": null` still succeeds.
- End to end from `https://commerce-hub-website.netlify.app`: pick a shopper, click **Request callback**, complete both steps, submit — the reference number appears in the confirmation panel and the contact shows up in Connect.

---

## 7. How the site gets pointed at you

Once deployed, the only change on the website is one line in `callback-api.js`:

```js
var CALLBACK_API = {
  endpoint: 'https://<your-endpoint>',   // <-- this
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  timeoutMs: 15000
};
```

Until that's filled in, the form runs in simulation mode: it logs the payload to the browser console and fakes a success, so the flow is demonstrable without a backend.

**If you require an extra header, say so explicitly.** It has to be added in two places — that `headers` object *and* your CORS `Access-Control-Allow-Headers` list. Miss either and every request fails at preflight.
