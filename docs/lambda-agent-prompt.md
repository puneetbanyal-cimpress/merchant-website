# Prompt: build the callback-request Lambda

Hand everything below to the agent building the Lambda. It is written to be self-contained — the agent does not need to see the front-end repo.

---

## Task

Build and deploy an AWS Lambda that receives **callback requests** from an already-deployed static website (the Quirepress demo storefront) and queues a callback in **Amazon Connect**.

The website is finished and will not change. Your endpoint must match the contract below exactly. The website's only configurable value is the endpoint URL — everything else about the request is fixed.

---

## 1. The request you will receive

**Method:** `POST`
**Content-Type:** `application/json`
**Origin:** a browser, cross-origin, from the deployed website (Netlify) and from `http://localhost:*` during development.

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

  // --- the shopper context, same values the chat widget passes to Connect ---
  "shopperId": "d2FyaG9s-237A146D7D6859E2CE8BEFDCAB4D38F9",

  // --- provenance ---
  "source": "quirepress-web",
  "channel": "callback",
  "requestedAt": "2026-08-21T08:59:59.669Z",
  "pageUrl": "https://example.netlify.app/index.html"
}
```

### Field reference

| Field | Type | Notes |
|---|---|---|
| `contactReason` | string | One of `order-status`, `reprint`, `refund`, `design-help`, `billing`, `account`, `other`. Always present. |
| `firstName` | string | Non-empty. |
| `lastName` | string | Non-empty. |
| `countryRegion` | string | ISO-3166 alpha-2: `US CA GB IE AU NZ IN SG DE AT CH NL FR ES IT SE`. |
| `dialCode` | string | e.g. `"+1"`, `"+44"`. Matches `countryRegion`. |
| `phone` | string | **As typed by the user**, dial code included, spacing arbitrary. Do not assume a format. |
| `phoneE164` | string \| null | Best-effort E.164 built client-side. **Treat as a hint, not as validated.** Re-normalise server-side. `null` when no digits were entered. |
| `consentToCallRecording` | boolean | The form will not submit without it, so expect `true`. Reject `false` anyway. |
| `description` | string | 15–1000 characters, enforced client-side. Re-check server-side. |
| `shopperId` | string \| null | Opaque, up to ~64 chars, mixed case with hyphens (e.g. `d2FyaG9s-237A146…`). `null` if the visitor never selected a shopper. **Must not be required.** |
| `source` | string | Always `"quirepress-web"`. |
| `channel` | string | Always `"callback"`. |
| `requestedAt` | string | ISO-8601 UTC, set by the browser — **untrusted clock**, use server time for anything that matters. |
| `pageUrl` | string | Full URL of the page that submitted. |

**Trust nothing in this body.** It comes from a browser. Validate every field server-side; client-side validation exists for UX only.

---

## 2. The response you must return

The website's handling is fixed. Match it or the UI will misreport.

### Success

- **Any 2xx status.**
- Body: JSON, or empty. If JSON, the site reads **`referenceId`** and shows it to the user as their reference number. An empty or non-JSON body still counts as success — the UI just shows `—` instead of a reference.

```json
{ "referenceId": "CB-2026-0A73F1" }
```

Return a reference the support team can actually search on — ideally the Amazon Connect contact ID, or your own ticket ID mapped to it.

### Failure

- **Any non-2xx status.**
- Body: JSON with **`message`** or **`error`**. The site displays that string verbatim to the end user, inline in the dialog, and re-enables the submit button so they can retry.

```json
{ "message": "We couldn't reach our phone system. Please try again in a minute." }
```

Because the string is shown to a customer, write these for customers, not for developers. **Never leak stack traces, ARNs, account IDs, or internal hostnames** — log those instead. If the body is missing or unparseable, the site falls back to `"Request failed with <status>"`.

### Timeout

The browser aborts the request at **15 seconds** and shows "The request timed out." Anything slower is wasted work: **respond well inside 15s.** If queueing the callback could be slow, accept the request, return 202 with a reference, and do the Connect call asynchronously.

---

## 3. CORS — this will be the thing that breaks first

The browser sends `Content-Type: application/json`, which makes this a **non-simple request**, so every call is preceded by an `OPTIONS` preflight. Get this wrong and the site shows a generic network error with nothing useful in it.

Required:

- Handle `OPTIONS` and return **204** with:
  - `Access-Control-Allow-Origin` — the site's exact origin (echo an allow-listed origin; avoid `*` if you ever add credentials)
  - `Access-Control-Allow-Methods: POST, OPTIONS`
  - `Access-Control-Allow-Headers: content-type` — **plus any custom header you require**, e.g. `x-api-key`. A header the site sends but preflight doesn't allow will fail the whole request.
  - `Access-Control-Max-Age: 86400`
- The **POST response must also carry `Access-Control-Allow-Origin`** — including error responses. A 500 without CORS headers reaches the browser as an opaque network failure, and the user sees the wrong message.

Allow-list the deployed Netlify origin and `http://localhost:*` for development.

---

## 4. What the Lambda should do

1. **Validate.** Reject with 400 and a customer-readable `message` if: `description` is under 15 or over 1000 chars; `firstName`/`lastName` empty; `consentToCallRecording` is not `true`; `contactReason` outside the enum; or the phone number can't be normalised to a dialable E.164.
2. **Normalise the phone** from `phone` + `dialCode` server-side. Do not rely on `phoneE164`.
3. **Queue the callback in Amazon Connect.** Use `StartOutboundVoiceContact` (voice callback) or `StartTaskContact` (a task an agent works from a queue) — pick per your contact-flow design. Attach the details as **contact attributes** so the agent sees them on screen pop:
   - `shopperId`, `firstName`, `lastName`, `contactReason`, `description`, `phoneE164`, `countryRegion`, `source`, `channel`, `requestedAt` (server time), `pageUrl`
   - **Every attribute value must be a string.** Amazon Connect rejects non-strings, and the failure is opaque. Coerce, and drop empties rather than sending `""`.
   - Note the chat widget on the same site passes `shopperId`, `firstName`, `lastName` and they arrive in the flow prefixed as `HostedWidget-shopperId` etc. Attributes you set here arrive **unprefixed**. Use consistent names so one contact flow can read both paths.
4. **Respect opening hours.** Sun 8:00–20:00, Mon 07:00–00:00, Tue–Fri 24h, Sat 00:00–20:00 — all **EST**. Outside them, either queue for the next open window or return a 4xx whose `message` tells the customer when they'll be called. Don't silently drop it.
5. **Log** the full request with a correlation id, redacting the phone number in any log stream that isn't access-controlled.
6. **Return** `{ "referenceId": "…" }`.

---

## 5. Non-functional requirements

- **Runtime:** Node.js 20+ or Python 3.12 — your call. No heavy framework; this is one route.
- **Endpoint:** Lambda Function URL or API Gateway HTTP API. Function URL is simpler and has built-in CORS config; HTTP API gives you throttling and API keys.
- **Auth — read this before choosing.** The caller is a static website with no backend, so **any credential you require ends up publicly readable in the site's JavaScript**. A Function URL with `AWS_IAM` auth cannot be called from the browser at all. Realistic options: leave the endpoint unauthenticated and defend it with rate limiting; or put API Gateway + WAF in front; or add a CAPTCHA/Turnstile token the Lambda verifies. Do not pretend a hard-coded API key in front-end JS is authentication.
- **Abuse.** This endpoint triggers outbound phone calls, so it is worth abusing. Rate-limit per source IP and per phone number, cap requests per phone per hour, and reject obviously bogus numbers (premium-rate ranges, repeated digits). Consider a per-day spend ceiling and an alarm on volume spikes.
- **Idempotency.** A user double-clicking, or a retry after a timeout, must not produce two calls. De-duplicate on a hash of `phoneE164 + description` within a short window, and return the original `referenceId`.
- **IaC.** Ship the infrastructure as SAM, CDK, or Terraform, plus a README with the deploy command and required env vars (Connect instance ID, contact flow ID, queue ARN, source phone number, allowed origins).
- **Tests.** Unit tests for validation and phone normalisation. One integration test that posts the exact sample body above and asserts a 2xx with a `referenceId`.

---

## 6. Definition of done

- `curl -X OPTIONS` returns 204 with correct CORS headers.
- Posting the exact sample body above returns 2xx with `{ "referenceId": "…" }`.
- A malformed body returns 4xx with a customer-readable `message` **and CORS headers present**.
- The callback appears in Amazon Connect with `shopperId` visible as a contact attribute.
- A request with `"shopperId": null` still succeeds.
- End-to-end from the live site: submit the form, see the reference number in the confirmation panel, see the contact land in Connect.

---

## 7. How the site will be pointed at you

Once deployed, the only change on the website is one line in `callback-api.js`:

```js
var CALLBACK_API = {
  endpoint: 'https://<your-endpoint>',   // <-- this
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  timeoutMs: 15000
};
```

If you require an extra header, say so explicitly — it must be added both there **and** to the CORS `Access-Control-Allow-Headers` list, or every request fails at preflight.
