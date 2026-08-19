# Commerce Hub Website — Amazon Connect chat context demo

A minimal storefront for demoing **shopper context flowing into an Amazon Connect chat**.

There are no preset personas. Every attribute in the chat context is one you add at runtime — shopper ID, mobile number, and any key/value pairs you type in. That map, and nothing else, is handed to the chat widget.

No framework, no build step, no backend. Four files.

---

## What it does

- **Shopper ID** and **Mobile number** fields in the demo bar.
- **Add attribute** — type any `key` / `value` and hit Add. Remove any of them with the `×` on its chip. As many as you like.
- **Live JSON panel** — shows exactly what the next chat will carry.
- **Chat context card** in the hero mirrors the same attributes, so your audience sees them without reading the demo bar.
- The mobile number you enter renders as the phone number in the **Contact Us** card.
- State persists in `localStorage`, so a reload keeps everything.
- Query params pre-seed the context — handy for demo links:
  `?shopperId=SHP-77341&mobileNumber=%2B15550104477&tier=gold`

---

## Setup

### 1. Point it at your widget

Click **Widget config** in the demo bar and either fill in the fields or paste your whole generated hosted-widget snippet and hit **Parse snippet**. It needs:

| Field | Where it comes from |
|---|---|
| Widget ID | last argument of the snippet's IIFE — `(window, document, 'amazon_connect', '<widgetId>')` |
| Snippet script URL | the `s.src = '…/amazon-connect-chat-interface-client.js'` line |
| Snippet ID | only if your snippet calls `amazon_connect('snippetId', '…')` |

Saved to `localStorage` in your browser — nothing leaves the page, nothing is committed.

**To bake the values in instead**, edit `DEFAULT_CONFIG` at the top of `connect-widget.js`. Note these become public in the repo and on the deployed site.

### 2. Read the attributes in your contact flow

Add a **Check contact attributes** block with namespace **User defined**, and read:

```
HostedWidget-shopperId
HostedWidget-mobileNumber
HostedWidget-<whatever key you added>
```

The hosted widget prepends `HostedWidget-` to every attribute key. That prefix is the single most common thing people get wrong here.

---

## How context changes reach the flow

The `amazon_connect(...)` config calls are queued and consumed **once**, when the widget client boots. There is no public API to mutate contact attributes on a live widget.

So changing an attribute does a teardown-and-reboot: remove the injected script, strip the nodes the widget added to `<head>`/`<body>`, delete its globals, then re-inject with the new attributes. See `connect-widget.js`. Edits while a widget is already open prompt you to hit **Reload widget**, since a chat in progress can't be retro-fitted.

If teardown ever misbehaves against your real instance, set `RELOAD_STRATEGY = 'page'` at the top of `connect-widget.js`. Context lives in `localStorage`, so a full page reload is a bulletproof fallback — the demo looks the same.

---

## Files

```
index.html          markup — storefront, Help Center, Contact Us, demo bar, config modal
styles.css          all styling
connect-widget.js   widget load / teardown / reload, config storage, attribute normalising
app.js              UI wiring, state, attribute assembly
netlify.toml        publish dir + headers
```

Every attribute value is coerced to a **string** before it's sent. Amazon Connect rejects non-strings and the chat fails to start with no useful error, so `normalizeAttributes` also drops empty values rather than passing `""`.

---

## Local dev

```bash
npx serve .
```

## Deploy

Netlify — publish directory `.`, no build command.

---

## Demo script

1. Open the site. The demo bar is pinned at the top; the JSON panel starts empty.
2. Type a shopper ID. Watch it appear in the JSON panel, the hero context card, and the header chip.
3. Add a mobile number. It shows up as the phone number under **Contact Us**.
4. Add a couple of attributes — `tier=gold`, `lastOrderId=ORD-2026-004512`. Remove one to show it drop out.
5. Hit **Reload widget**, then **Start chat** and open the bubble at the bottom right.
6. In the CCP or contact flow, show `HostedWidget-shopperId` arriving with exactly what you typed.

---

A demo of Amazon Connect context passing. Not a real storefront.
