/**
 * Mints a short-lived HS256 JWT for the Amazon Connect hosted communications widget.
 *
 * Used only when the demo bar is set to "JWT (signed)". Attributes signed here
 * arrive in your contact flow UNPREFIXED (namespace: User defined), unlike the
 * plaintext path which prefixes every key with `HostedWidget-`.
 *
 * Required Netlify env vars:
 *   CONNECT_WIDGET_SECRET  — the security key from step 2 of your widget config
 *   CONNECT_WIDGET_ID      — (optional) falls back to the widgetId in the request body
 *
 * Zero dependencies: HS256 is signed with node:crypto.
 */
import { createHmac } from 'node:crypto';

const TTL_SECONDS = 300;

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function signHS256(payload, secret) {
  const header = { typ: 'JWT', alg: 'HS256' };
  const signingInput =
    b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return signingInput + '.' + signature;
}

/** Amazon Connect rejects non-string attribute values — coerce and drop empties. */
function stringify(attributes) {
  const out = {};
  for (const [k, v] of Object.entries(attributes || {})) {
    const key = String(k).trim();
    if (!key || v === null || v === undefined) continue;
    const val = String(v);
    if (val === '') continue;
    out[key] = val;
  }
  return out;
}

export default async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 });
  }

  const secret = Netlify.env.get('CONNECT_WIDGET_SECRET');
  if (!secret) {
    return Response.json(
      {
        error: 'CONNECT_WIDGET_SECRET is not set',
        hint: 'Add it in Netlify → Site configuration → Environment variables, then redeploy. Until then use Plaintext mode.'
      },
      { status: 501 }
    );
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const widgetId = Netlify.env.get('CONNECT_WIDGET_ID') || body.widgetId;
  if (!widgetId) {
    return Response.json({ error: 'widgetId missing' }, { status: 400 });
  }

  const attributes = stringify(body.attributes);
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    sub: widgetId,
    iat: now,
    exp: now + TTL_SECONDS,
    attributes
  };

  // Uncomment if this widget drives an Amazon Connect Guide:
  // payload.segmentAttributes = { 'connect:Subtype': { ValueString: 'connect:Guide' } };

  const token = signHS256(payload, secret);

  return new Response(JSON.stringify({ token, attributeCount: Object.keys(attributes).length }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
};

export const config = {
  path: '/.netlify/functions/connect-token'
};
