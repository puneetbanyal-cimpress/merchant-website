# Quirepress — Amazon Connect chat context demo

Live at **https://commerce-hub-website.netlify.app**

A single-screen storefront page for demoing **shopper context flowing into an Amazon Connect chat**, plus a callback request form that carries the same context to a REST API.

Pick a shopper, hit **Set chat context**, start a chat — the agent and the contact flow see who it is before the customer types anything.

No framework, no build step. Six files.

---

## How it works

The hero has one control: a **Shopper** dropdown and a **Set chat context** button. **Changing the dropdown changes the context** — it stores the selection, updates the header (showing the shopper's **name**), and reboots the Amazon Connect widget so the new attributes reach the next chat. The button does the same thing on demand, for rebooting without switching shopper.

There is deliberately no "staged" selection waiting on a button press: a pending value the button had to commit meant the widget and the callback form could disagree with what the dropdown visibly said.

Four attributes go across:

| Attribute | In the contact flow / Streams |
|---|---|
| `shopperId` | `HostedWidget-shopperId` |
| `firstName` | `HostedWidget-firstName` |
| `lastName` | `HostedWidget-lastName` |
| `displayName` | `HostedWidget-displayName` |

Read them with a **Check contact attributes** block, namespace **User defined**, or in Streams with `contact.getAttributes()`. The hosted widget prepends `HostedWidget-` to every key — that prefix is the single most common thing people get wrong here.

### The customer display name

Separately from the attributes, the widget is given the customer's display name:

```js
amazon_connect('customerDisplayName', function (callback) {
  callback('Paul Harraghy');
});
```

Note the **callback form** — passing a bare string is silently ignored and the chat falls back to the default name "Customer". The value must be 1–256 characters; empty or null logs `Invalid customerDisplayName provided`.

This sets `ParticipantDetails.DisplayName` on `StartChatContact`, which is what the customer sees in their own chat window, what the agent sees in the CCP, and what appears in the transcript.

**It is not a contact attribute**, so `contact.getAttributes()` in Streams cannot read it back — Streams exposes no participant DisplayName. That is why the same string is *also* sent as the `displayName` attribute above. In a custom CCP:

```js
var attrs = contact.getAttributes();
var name = attrs['HostedWidget-displayName'].value;   // note .value
```

`getAttributes()` returns `{ name, value }` objects, not bare strings — reading `attrs['x']` directly gives you an object and renders as `[object Object]`.

### What the agent sees

**No Amazon Connect console setting is needed for the display name.** It rides in on `StartChatContact` and the agent side picks it up — but *how* depends on which agent desktop is in use:

- **Stock CCP** (`connect.core.initCCP()`, or the hosted CCP at `https://<instance>.my.connect.aws/ccp-v2`): the name renders automatically as the chat participant on every customer message. Nothing to build.
- **Custom chat UI on ChatJS**: you render the transcript yourself, so you must read it yourself. Each item carries `DisplayName` and `ParticipantRole` (`'AGENT' | 'CUSTOMER' | 'SYSTEM'`) — available on `onMessage` events and on `getTranscript()` items.
- **Contact attributes** (`shopperId` and friends): the stock CCP does **not** surface arbitrary attributes on its own. Read them from Streams with `contact.getAttributes()` and render them in your own panel, or surface them through the agent workspace.

Two things that can make the name not show:

1. **A pre-chat form on the widget.** If the widget's configuration captures the customer's name, that value is used instead. Check the widget config before assuming the code is at fault.
2. **A resumed chat session.** A rejoined contact keeps the participant details it was created with, so a name set after the fact won't appear. Start a fresh chat when testing.

**The widget is gated on that context.** With nothing selected, the widget script is never injected and no chat bubble appears; the Assistant card reads "Set a chat context to start". Clearing the selection tears down an already-loaded widget. This makes it impossible to open a chat carrying an empty or stale context.

Selection persists in `localStorage`, and `?shopperId=<id>` in the URL pre-seeds it — handy for demo links.

---

## Editing the shoppers

`shoppers.js`, one object per shopper (`firstName`, `lastName`, `shopperId`). The same file also holds the contact reasons, country regions with their dialling codes, and the working hours used by both the phone card and the callback form's rail. Add or change entries there; nothing else needs to touch.

Every value must be a **string** — Amazon Connect rejects non-strings and the chat fails to start with no useful error. `normalizeAttributes` coerces and drops empties as a backstop.

### Adding shoppers at runtime (hidden route)

For trying an ID without a redeploy, there is an unlinked panel at:

```
https://commerce-hub-website.netlify.app/?addShopper
https://commerce-hub-website.netlify.app/#add-shopper
```

Nothing on the page links to it. Added shoppers land in `localStorage`, appear in the dropdown marked `(added)`, and behave exactly like the built-in ones — same attributes, same display name, same callback prefill.

Two shortcuts, both shown inside the panel:

```
?addShopper&firstName=Ada&lastName=Lovelace&shopperId=ABC-123
```

```js
__ADD_SHOPPER__({ firstName: 'Ada', lastName: 'Lovelace', shopperId: 'ABC-123' })
__CLEAR_SHOPPERS__()
```

The deep link both adds *and* selects that shopper, since `shopperId` is also the param that pre-seeds the context.

Rejected: blank fields, a duplicate ID (built-in or added), and a name over 256 characters — the same ceiling Amazon Connect puts on the display name. Removing the shopper that is currently live also clears the context, so the widget can't keep sending someone who is no longer in the list. Malformed entries in `localStorage` are filtered out on read rather than reaching Connect.

**This is a scratch pad, not storage.** Entries are per-browser — another machine, another browser, or cleared site data all start from the built-in list. Anything worth keeping belongs in `shoppers.js`.

> Consumed params (`shopperId`, `addShopper`, `firstName`, `lastName`, and the `#add-shopper` hash) are stripped from the address bar once read. Switching shopper reloads the page, and the query string outranks `localStorage` on boot — a leftover `?shopperId=` would silently override every later selection and snap the demo back to the linked shopper.

---

## Request a callback

The **Request callback** button opens a native `<dialog>` (focus trapping, Escape-to-close, and inertness come free) running a two-step wizard modelled on the reference screens.

**Step 1 — "Hi {firstName}, let's make sure we have the right details"**: contact reason, first name, last name, country region, phone, and a call-recording consent checkbox. First and last name prefill from the active shopper; the shopper ID shows beneath the heading with a "Not {firstName}?" link that clears the prefill. Changing the country region reseeds the phone field's dialling code.

**Step 2 — "Tell us how we can help"**: a description textarea, minimum 15 characters, 1000 max, with a live counter. **Back** returns to step 1 with everything intact.

A left rail carries the three-step explainer and the working hours; a progress bar runs 50% → 100%, and the numbered step markers light as you move.

The footer button is disabled until the current step is valid, exactly like the reference. Because a greyed-out button doesn't say *which* field is missing, errors also surface on blur — but only on fields the user actually focused, never on ones they merely tabbed through.

One POST fires, on **Submit request**, carrying both steps plus the chat context.

### Wiring up the API

`callback-api.js`, top of file — the endpoint is live:

```js
var CALLBACK_API = {
  endpoint: 'https://cykdl4xwkivlkod3mpx6s62sky0pjzrl.lambda-url.eu-west-1.on.aws',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  timeoutMs: 15000
};
```

Blank the `endpoint` and the form drops back to **simulation mode**: the payload is logged to the console, a success is faked, and the confirmation panel says so. Useful for demoing with the backend down.

### What the UI does with the response

**Success** is any 2xx. The confirmation panel shows both identifiers as selectable rows:

```json
{ "referenceId": "b2d47d68-899c-4aa2-b023-b1b36455dfc7", "caseNumber": "CS-87" }
```

Either may be missing — that row is hidden rather than printing `undefined`, and a 2xx with no body at all is still treated as success.

**Failure** keeps the customer on step 2 with their text intact, shows the reason inline, and re-enables the button so they can retry:

| Case | Shown to the customer |
|---|---|
| Any status with `message` or `error` in the body | that string, verbatim |
| 400 / 422, no body | Some of those details were rejected. Please check them and try again. |
| 401 / 403, no body | We couldn't authorise that request. Please try again, or call us instead. |
| 404, no body | That service isn't available right now. Please call us instead. |
| 429, no body | That's a few too many requests. Please wait a minute and try again. |
| 5xx, no body | Something went wrong at our end. Please try again in a moment. |
| Timeout (15s) | That took too long to go through. Please try again. |
| Network or CORS rejection | We couldn't reach us just now. Check your connection and try again. |

That last row matters: `fetch()` rejects with the same `TypeError` for a dropped connection **and** for a CORS rejection — the browser deliberately hides which. "Failed to fetch" means nothing to a customer, so the UI says something actionable and logs the real error to the console for you.

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
