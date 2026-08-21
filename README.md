# Quirepress — Amazon Connect chat context demo

A single-screen storefront page for demoing **shopper context flowing into an Amazon Connect chat**, plus a callback request form that carries the same context to a REST API.

Pick a shopper, hit **Set chat context**, start a chat — the agent and the contact flow see who it is before the customer types anything.

No framework, no build step. Six files.

---

## How it works

The hero has one control: a **Shopper** dropdown and a **Set chat context** button. Selecting a shopper stages it; the button applies it, which stores the selection, updates the header (showing the shopper's **name**), and reboots the Amazon Connect widget so the new attributes reach the next chat.

Three attributes go across:

| Attribute | In the contact flow |
|---|---|
| `shopperId` | `HostedWidget-shopperId` |
| `shopperName` | `HostedWidget-shopperName` |
| `shopperEmail` | `HostedWidget-shopperEmail` |

Read them with a **Check contact attributes** block, namespace **User defined**. The hosted widget prepends `HostedWidget-` to every key — that prefix is the single most common thing people get wrong here.

**The widget is gated on that context.** With nothing selected, the widget script is never injected and no chat bubble appears; the Assistant card reads "Set a chat context to start". Clearing the selection tears down an already-loaded widget. This makes it impossible to open a chat carrying an empty or stale context.

Selection persists in `localStorage`, and `?shopperId=SHP-77341` in the URL pre-seeds it — handy for demo links.

---

## Editing the shoppers

`shoppers.js`, one object per shopper. Add or change entries there; nothing else needs to touch.

Every value must be a **string** — Amazon Connect rejects non-strings and the chat fails to start with no useful error. `normalizeAttributes` coerces and drops empties as a backstop.

---

## Request a callback

The **Request callback** button opens a native `<dialog>` (focus trapping, Escape-to-close, and inertness come free) with a form pre-filled from the active shopper context: name, email, country code + phone, topic, order number, preferred time, notes, and a consent checkbox.

Validation is deferred: errors surface via `:user-invalid` once a field has been interacted with, or on a submit attempt — never on a pristine field.

### Wiring up the API

`callback-api.js`, top of file:

```js
var CALLBACK_API = {
  endpoint: '',            // <-- paste the POST endpoint here
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  timeoutMs: 15000
};
```

With `endpoint` empty the form runs in **simulation mode**: the payload is logged to the console, a success is faked after ~700ms, and the confirmation panel notes it was simulated. Fill in `endpoint` and the identical payload goes out as a real POST — no other change needed.

The payload:

```jsonc
{
  "fullName": "Nadia Okafor",
  "email": "nadia.okafor@…",
  "countryCode": "+1",
  "phone": "555 010 4477",
  "phoneE164": "+15550104477",
  "reason": "order-status",
  "orderNumber": "ORD-2026-004512",
  "preferredTime": "asap",
  "notes": null,
  "consent": true,
  "shopperId": "PRO-10298",        // same context the chat widget carries
  "shopperName": "Nadia Okafor",
  "shopperEmail": "nadia.okafor@…",
  "source": "quirepress-web",
  "channel": "callback",
  "requestedAt": "2026-08-20T09:14:22.481Z",
  "pageUrl": "https://…"
}
```

Reshape it in `buildPayload()` if the real contract differs. Non-2xx responses and timeouts surface inline in the dialog rather than closing it.

> The form fields are a reconstruction of a standard callback form, not a copy of any specific one — the reference page renders client-side and couldn't be read.

---

## Widget config

Hard-coded at the top of `connect-widget.js` in `CONNECT_WIDGET_CONFIG` — widget ID, snippet script URL, snippet ID, styles, and supported messaging content types, taken straight from the generated hosted-widget snippet. All of them are replayed on every boot, so a reload reproduces the snippet exactly. There is no runtime config panel.

### Why the widget reboots

The `amazon_connect(...)` config calls are queued and consumed **once**, when the widget client boots. There is no public API to mutate contact attributes on a live widget. So **Set chat context** tears the widget down — removes the injected script, strips the nodes it added to `<head>`/`<body>`, deletes its globals — and boots it again.

A chat already in progress can't be retro-fitted; set the context before starting the chat.

If teardown ever misbehaves against a real instance, set `RELOAD_STRATEGY = 'page'` at the top of `connect-widget.js`. The selection lives in `localStorage`, so a full page reload is a bulletproof fallback and the demo looks the same.

---

## Files

```
index.html          header, hero with the shopper picker, Contact Us, callback dialog
styles.css          all styling
shoppers.js         the demo shoppers offered in the dropdown
callback-api.js     CALLBACK_API config, payload shape, POST + simulation mode
connect-widget.js   CONNECT_WIDGET_CONFIG + widget load / teardown / reload
app.js              state and wiring
netlify.toml        publish dir + headers
```

---

## Local dev

```bash
npx serve .
```

## Deploy

Netlify — publish directory `.`, no build command.

---

## Demo script

1. Open the page. Everything fits one screen. There is **no chat bubble** — the Assistant card reads "Set a chat context to start".
2. Pick a shopper from the dropdown. The three attributes appear under it; nothing has loaded yet.
3. Hit **Set chat context**. The bubble appears, the header switches from "Guest" to the shopper's name, and the status line confirms the widget loaded.
4. Open the bubble and start a chat. In the CCP or contact flow, show `HostedWidget-shopperId`, `-shopperName` and `-shopperEmail` arriving.
5. Switch to a different shopper, hit the button again, start a fresh chat to show the new values coming through.
6. Click **Request callback** — the form is already filled in from the same context. Submit and show the payload in the console, shopper fields included.

---

A demo of Amazon Connect context passing. Quirepress is a fictional brand; not a real storefront.
