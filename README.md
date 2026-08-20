# Commerce Hub Website — Amazon Connect chat context demo

A single-screen storefront page for demoing **shopper context flowing into an Amazon Connect chat**.

Type a shopper ID, click **Add Shopper ID**, start a chat — the agent and the contact flow see that ID before the customer types anything.

No framework, no build step, no backend. Four files.

---

## How it works

The page has one control: a **Shopper ID** input with an **Add Shopper ID** button. Clicking it (or pressing Enter) stores the ID, updates the header chip, and reboots the Amazon Connect widget so the new value is carried into the next chat.

Everything else — Contact Us with the chat, phone, and email cards — is static page content.

The shopper ID persists in `localStorage`, and `?shopperId=SHP-77341` in the URL pre-seeds it, which is handy for demo links.

---

## Widget config

Hard-coded at the top of `connect-widget.js` in `CONNECT_WIDGET_CONFIG` — widget ID, snippet script URL, snippet ID, styles, and supported messaging content types, taken straight from the generated hosted-widget snippet. That is the only place widget config lives; there is no runtime config panel.

To point the demo at a different Connect instance, replace those values.

---

## Reading the attribute in your contact flow

Add a **Check contact attributes** block with namespace **User defined** and read:

```
HostedWidget-shopperId
```

The hosted widget prepends `HostedWidget-` to every plaintext attribute key. That prefix is the single most common thing people get wrong here — `shopperId` alone will not match.

---

## Why the widget reboots

The `amazon_connect(...)` config calls are queued and consumed **once**, when the widget client boots. There is no public API to mutate contact attributes on a live widget.

So **Add Shopper ID** tears the widget down — removes the injected script, strips the nodes it added to `<head>`/`<body>`, deletes its globals — and boots it again with the new attribute. See `connect-widget.js`.

A chat already in progress can't be retro-fitted; set the ID before starting the chat.

If teardown ever misbehaves against a real instance, set `RELOAD_STRATEGY = 'page'` at the top of `connect-widget.js`. The shopper ID lives in `localStorage`, so a full page reload is a bulletproof fallback and the demo looks the same.

---

## Files

```
index.html          markup — header, hero with the shopper ID box, Contact Us, footer
styles.css          all styling
connect-widget.js   CONNECT_WIDGET_CONFIG + widget load / teardown / reload
app.js              shopper ID state and wiring
netlify.toml        publish dir + headers
```

Attribute values are coerced to **strings** and empties are dropped before sending. Amazon Connect rejects non-strings and the chat fails to start with no useful error.

---

## Local dev

```bash
npx serve .
```

## Deploy

Netlify — publish directory `.`, no build command.

---

## Demo script

1. Open the page. Everything fits in one screen; no scrolling needed.
2. Type a shopper ID and click **Add Shopper ID**. The header chip and the line under the input both update, and the status line confirms the widget reloaded.
3. Click the chat bubble at the bottom right and start a chat.
4. In the CCP or contact flow, show `HostedWidget-shopperId` arriving with exactly what you typed.
5. Change the ID, click **Add Shopper ID** again, start a fresh chat to show the new value coming through.

---

A demo of Amazon Connect context passing. Not a real storefront.
