#!/usr/bin/env bash
# Which field makes the Lambda reject the request?
#
# The two bodies are structurally identical — same 14 keys, same order, same
# types. Only seven VALUES differ. This flips them one at a time from the
# working body to the failing value and prints the status for each, so the
# culprit is whichever line stops returning 2xx.
#
#   chmod +x bisect-callback.sh && ./bisect-callback.sh
#
# Requires curl and python3 (both stock on macOS).

set -uo pipefail
URL="${CALLBACK_URL:-https://cykdl4xwkivlkod3mpx6s62sky0pjzrl.lambda-url.eu-west-1.on.aws}"

# The body that works, as the baseline.
read -r -d '' BASE <<'JSON'
{
  "contactReason": "order-status",
  "firstName": "Paul",
  "lastName": "Harraghy",
  "countryRegion": "US",
  "dialCode": "+1",
  "phone": "+1 5550104477",
  "phoneE164": "+15550104477",
  "consentToCallRecording": true,
  "description": "My banner order arrived with the wrong dimensions.",
  "shopperId": "d2FyaG9s-237A146D7D6859E2CE8BEFDCAB4D38F9",
  "source": "quirepress-web",
  "channel": "callback",
  "requestedAt": "2026-08-21T08:59:59.669Z",
  "pageUrl": "https://commerce-hub-website.netlify.app"
}
JSON

# field=value pairs from the FAILING body, applied one at a time.
FLIPS=(
  'contactReason=other'
  'shopperId=nVke2QV2-01KYVXXPBJ47EWXRAKBXPKWWF2'
  'phoneE164=+12342343243'
  'phone=+1 234 234 3243'
  'requestedAt=2026-08-24T11:08:09.367Z'
  'description=Just testing this.'
  'firstName=Puneet'
  'lastName=Banyal'
)

post () {  # $1 = json body, $2 = label
  local out code body
  out=$(curl -sS -m 20 -w $'\n%{http_code}' -X POST "$URL" \
        -H 'Content-Type: application/json' \
        -H 'Origin: https://commerce-hub-website.netlify.app' \
        --data "$1" 2>&1)
  code=$(printf '%s' "$out" | tail -n1)
  body=$(printf '%s' "$out" | sed '$d' | tr -d '\n' | cut -c1-160)
  case "$code" in
    2*) printf '  \033[32mPASS\033[0m %-3s  %-46s %s\n' "$code" "$2" "$body" ;;
    *)  printf '  \033[31mFAIL\033[0m %-3s  %-46s %s\n' "$code" "$2" "$body" ;;
  esac
}

echo
echo "=== preflight (CORS) ==="
curl -sS -m 20 -o /dev/null -D - -X OPTIONS "$URL" \
  -H 'Origin: https://commerce-hub-website.netlify.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
  | grep -iE '^(HTTP/|access-control-)' | sed 's/^/  /'

echo
echo "=== baselines ==="
post "$BASE" "known-good body"

echo
echo "=== one field at a time, working -> failing value ==="
for flip in "${FLIPS[@]}"; do
  key="${flip%%=*}"; val="${flip#*=}"
  body=$(BASE="$BASE" KEY="$key" VAL="$val" python3 -c '
import json, os
d = json.loads(os.environ["BASE"])
d[os.environ["KEY"]] = os.environ["VAL"]
print(json.dumps(d))')
  post "$body" "$key = $val"
done

echo
echo "Whichever line above flips to FAIL is the field the Lambda rejects."
echo "If they all PASS, the two bodies are equivalent and the difference is"
echo "elsewhere — headers, or state that changed between the two attempts."
echo
