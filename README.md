# Vista Demo — Amazon Connect context passing

A deliberately minimal Vistaprint-style storefront for demoing **shopper context flowing into an Amazon Connect chat**.

Switch between three shopper contexts (or type any shopper ID), then start a chat — the agent and the contact flow see that shopper's attributes.

No framework, no build step. Plain HTML/CSS/JS + one optional Netlify function.

---

## What it does

- **Three context tabs** — Guest, Returning, Pro/Business. Each carries a preset shopper ID, tier, locale, storefront, cart value, and order history.
- **Shopper ID input** — overrides the active context's `shopperId` live.
- **Custom attributes** — add arbitrary `key=value` pairs at demo time.
- **Live JSON panel** — shows exactly what will be handed to Amazon Connect.
- **Two attribute modes**, switchable in the demo bar:
  - **Plaintext** — `amazon_connect('contactAttributes', {...})`. No backend, no widget security needed.
  - **JWT (signed)** — a Netlify function signs the attributes with your widget's security key.
- State persists in `localStorage`, so a page reload keeps the active context.
- `?shopperId=SHP-123` in the URL pre-seeds the shopper ID — handy for demo links.

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

Add a **Check contact attributes** block, namespace **User defined**.

| Mode | Key in the flow |
|---|---|
| Plaintext | `HostedWidget-shopperId` |
| JWT | `shopperId` |

The hosted widget prepends `HostedWidget-` to every plaintext attribute key. JWT-signed attributes arrive unprefixed.

### 3. (Optional) Enable JWT mode

1. In your widget configuration, step 2, choose **Yes** to enable widget security and copy the security key.
2. In Netlify → *Site configuration → Environment variables*, add:
   - `CONNECT_WIDGET_SECRET` — the security key (mark as secret)
   - `CONNECT_WIDGET_ID` — your widget ID (optional; falls back to the value sent by the browser)
3. Redeploy, then flip **Attribute mode** to **JWT (signed)** in the demo bar.

Until the secret is set the function returns `501` and the demo bar shows the error — plaintext mode keeps working.

---

## How context switching actually works

The `amazon_connect(...)` config calls are queued and consumed **once**, when the widget client boots. There is no public API to mutate contact attributes on a live widget.

So switching context does a teardown-and-reboot: remove the injected script, strip the nodes the widget added to `<head>`/`<body>`, delete its globals, then re-inject with the new attributes. See `connect-widget.js`.

If that ever misbehaves against your real instance, set `RELOAD_STRATEGY = 'page'` at the top of `connect-widget.js`. Context lives in `localStorage`, so a full page reload is a bulletproof fallback — the demo looks the same.

---

## Files

```
index.html                          markup — storefront + demo bar + config modal
styles.css                          all styling
contexts.js                         the three shopper contexts (edit these)
connect-widget.js                   widget load / teardown / reload, config storage
app.js                              UI wiring, state, attribute assembly
netlify/functions/connect-token.mjs HS256 JWT signer (zero deps)
netlify.toml                        publish dir + functions dir
```

To change the personas, edit `contexts.js` only. Every value under `attributes` must be a **string** — Amazon Connect rejects anything else and the chat fails to start.

---

## Local dev

```bash
npx serve .          # plaintext mode only
netlify dev          # plaintext + JWT (needs CONNECT_WIDGET_SECRET in .env)
```

## Deploy

Netlify, publish directory `.`, no build command. Functions auto-detected from `netlify/functions`.

---

## Demo script

1. Open the site. Demo bar is pinned at the top.
2. Start on **Guest** — point out `GUEST-0000` in the JSON panel.
3. Click **Returning** — the JSON panel and hero update; the widget reboots with the new attributes.
4. Type a custom shopper ID in the input; watch the JSON panel follow.
5. Click **Reload chat widget**, then the chat bubble bottom-right.
6. In the CCP / contact flow, show `HostedWidget-shopperId` arriving as that shopper.

---

Not affiliated with Vistaprint. Built purely to demo Amazon Connect context passing.
