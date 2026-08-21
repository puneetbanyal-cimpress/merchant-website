# Quirepress — Amazon Connect chat context demo

Live at **https://commerce-hub-website.netlify.app**

A single-screen storefront page for demoing **shopper context flowing into an Amazon Connect chat**, plus a callback request form that carries the same context to a REST API.

Pick a shopper, hit **Set chat context**, start a chat — the agent and the contact flow see who it is before the customer types anything.

No framework, no build step. Six files.

---

## How it works

The hero has one control: a **Shopper** dropdown and a **Set chat context** button. **Changing the dropdown changes the context** — it stores the selection, updates the header (showing the shopper's **name**), and reboots the Amazon Connect widget so the new attributes reach the next chat. The button does the same thing on demand, for rebooting without switching shopper.

There is deliberately no "staged" selection waiting on a button press: a pending value the button had to commit meant the widget and the callback form could disagree with what the dropdown visibly said.

Three attributes go across:

| Attribute | In the contact flow |
|---|---|
| `shopperId` | `HostedWidget-shopperId` |
| `firstName` | `HostedWidget-firstName` |
| `lastName` | `HostedWidget-lastName` |

Read them with a **Check contact attributes** block, namespace **User defined**. The hosted widget prepends `HostedWidget-` to every key — that prefix is the single most common thing people get wrong here.

**The widget is gated on that context.** With nothing selected, the widget script is never injected and no chat bubble appears; the Assistant card reads "Set a chat context to start". Clearing the selection tears down an already-loaded widget. This makes it impossible to open a chat carrying an empty or stale context.

Selection persists in `localStorage`, and `?shopperId=<id>` in the URL pre-seeds it — handy for demo links.

---

## Editing the shoppers

`shoppers.js`, one object per shopper (`firstName`, `lastName`, `shopperId`). The same file also holds the contact reasons, country regions with their dialling codes, and the working hours used by both the phone card and the callback form's rail. Add or change entries there; nothing else needs to touch.

Every value must be a **string** — Amazon Connect rejects non-strings and the chat fails to start with no useful error. `normalizeAttributes` coerces and drops empties as a backstop.

---

## Request a callback

The **Request callback** button opens a native `<dialog>` (focus trapping, Escape-to-close, and inertness come free) running a two-step wizard modelled on the reference screens.

**Step 1 — "Hi {firstName}, let's make sure we have the right details"**: contact reason, first name, last name, country region, phone, and a call-recording consent checkbox. First and last name prefill from the active shopper; the shopper ID shows beneath the heading with a "Not {firstName}?" link that clears the prefill. Changing the country region reseeds the phone field's dialling code.

**Step 2 — "Tell us how we can help"**: a description textarea, minimum 15 characters, 1000 max, with a live counter. **Back** returns to step 1 with everything intact.

A left rail carries the three-step explainer and the working hours; a progress bar runs 50% → 100%, and the numbered step markers light as you move.

The footer button is disabled until the current step is valid, exactly like the reference. Because a greyed-out button doesn't say *which* field is missing, errors also surface on blur — but only on fields the user actually focused, never on ones they merely tabbed through.

One POST fires, on **Submit request**, carrying both steps plus the chat context.

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
  // step 1
  "contactReason": "order-status",
  "firstName": "Paul",
  "lastName": "Harraghy",
  "countryRegion": "US",
  "dialCode": "+1",
  "phone": "+1 5550104477",
  "phoneE164": "+15550104477",
  "consentToCallRecording": true,

  // step 2
  "description": "My banner order arrived with the wrong dimensions.",

  // same context the chat widget carries
  "shopperId": "d2FyaG9s-237A146D7D6859E2CE8BEFDCAB4D38F9",

  "source": "quirepress-web",
  "channel": "callback",
  "requestedAt": "2026-08-21T08:59:59.669Z",
  "pageUrl": "https://…"
}
```

Reshape it in `buildPayload()` if the real contract differs. Non-2xx responses and timeouts surface inline in the dialog rather than closing it.

**Building the backend?** `docs/lambda-agent-prompt.md` is a self-contained brief for whoever implements the endpoint — the exact request contract, the response shape the UI expects, the CORS requirements, and the abuse/idempotency constraints that come with an endpoint that dials phones.

---

## Widget config

Hard-coded at the top of `connect-widget.js` in `CONNECT_WIDGET_CONFIG` — widget ID, snippet script URL, snippet ID, styles, and supported messaging content types, taken straight from the generated hosted-widget snippet. All of them are replayed on every boot, so a reload reproduces the snippet exactly. There is no runtime config panel.

### Why swapping context reloads the page

The `amazon_connect(...)` config calls are queued and consumed **once**, when the widget client boots. There is no public API to mutate contact attributes on a live widget, so new attributes need a fresh boot.

In-place teardown — removing the script, stripping the nodes, deleting the globals — is not enough. The widget client keeps state we can't reach: closures, its own iframes, and a **persisted chat session** (the same mechanism that lets the bubble survive a refresh). A re-injected script can rejoin the existing contact, and a rejoined contact keeps the attributes it was created with — so the newly selected shopper never reaches the flow.

So `RELOAD_STRATEGY` defaults to `'page'`: clear the persisted session keys, then reload. The selection lives in `localStorage`, so it comes straight back and the demo looks the same.

`'dom'` is still there for the no-flash swap, but only use it if you've verified the swap against your own instance.

A chat already in progress can't be retro-fitted either; set the context before starting the chat.

---

## Files

```
index.html          header, hero with the shopper picker, Contact Us, callback wizard
styles.css          all styling
shoppers.js         demo shoppers, contact reasons, country regions, working hours
callback-api.js     CALLBACK_API config, payload shape, POST + simulation mode
connect-widget.js   CONNECT_WIDGET_CONFIG + widget load / teardown / reload
app.js              state and wiring
netlify.toml        publish dir + headers
docs/               lambda-agent-prompt.md — brief for the callback endpoint
```

---

## Local dev

```bash
npx serve .
```

## Deploy

Live at **https://commerce-hub-website.netlify.app**

Netlify — publish directory `.`, no build command.

---

## Demo script

1. Open the page. Everything fits one screen. There is **no chat bubble** — the Assistant card reads "Set a chat context to start".
2. Pick a shopper from the dropdown. The three attributes appear under it; nothing has loaded yet.
3. Hit **Set chat context**. The bubble appears, the header switches from "Guest" to the shopper's name, and the status line confirms the widget loaded.
4. Open the bubble and start a chat. In the CCP or contact flow, show `HostedWidget-shopperId`, `-firstName` and `-lastName` arriving.
5. Switch to a different shopper, hit the button again, start a fresh chat to show the new values coming through.
6. Click **Request callback** — the heading greets the shopper by first name, the name fields are prefilled, and the shopper ID is shown beneath. Fill in the reason and phone, hit **Next**, describe the issue, **Submit request** — then show the payload in the console with `shopperId` carried through.

---

A demo of Amazon Connect context passing. Quirepress is a fictional brand; not a real storefront.
