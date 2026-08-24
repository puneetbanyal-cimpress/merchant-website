#!/usr/bin/env bash
# Why does an identical request succeed once and fail the next time?
#
# When two byte-identical bodies get different answers, the cause is server
# state, not content. The three candidates — all of them behaviours the Lambda
# was asked to implement — are:
#
#   1. Idempotency de-duplication, keyed on phoneE164 + description
#   2. Rate limiting, per phone number or per source IP
#   3. A redirect that only `curl -L` follows
#
# This tells them apart. Run it and read the status codes.
#
#   chmod +x diagnose-callback.sh && ./diagnose-callback.sh
#
# Requires curl and python3 (both stock on macOS).

set -uo pipefail
URL="${CALLBACK_URL:-https://cykdl4xwkivlkod3mpx6s62sky0pjzrl.lambda-url.eu-west-1.on.aws/}"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
NONCE="$RANDOM$RANDOM"

body () {  # $1 = description, $2 = phoneE164, $3 = phone
  python3 -c '
import json, sys
print(json.dumps({
  "contactReason": "reprint",
  "firstName": "Vinay",
  "lastName": "Sawant",
  "countryRegion": "US",
  "dialCode": "+1",
  "phone": sys.argv[3],
  "phoneE164": sys.argv[2],
  "consentToCallRecording": True,
  "description": sys.argv[1],
  "shopperId": "IMDD2MFQRWQL3SUSGM4K2VR3ZIJ0ZNLE",
  "source": "quirepress-web",
  "channel": "callback",
  "requestedAt": sys.argv[4],
  "pageUrl": "https://commerce-hub-website.netlify.app/"
}))' "$1" "$2" "$3" "$STAMP"
}

post () {  # $1 = body, $2 = label
  local out code resp
  out=$(curl -sS -m 25 -w $'\n%{http_code}' -X POST "$URL" \
        -H 'Content-Type: application/json' \
        -H 'Origin: https://commerce-hub-website.netlify.app' \
        --data-raw "$1" 2>&1)
  code=$(printf '%s' "$out" | tail -n1)
  resp=$(printf '%s' "$out" | sed '$d' | tr -d '\n' | cut -c1-150)
  case "$code" in
    2*) printf '  \033[32m%-3s\033[0m  %-34s %s\n' "$code" "$2" "$resp" ;;
    *)  printf '  \033[31m%-3s\033[0m  %-34s %s\n' "$code" "$2" "$resp" ;;
  esac
}

echo
echo "=== 1. does it redirect? (no -L, headers only) ==="
curl -sS -m 25 -o /dev/null -D - -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://commerce-hub-website.netlify.app' \
  --data-raw "$(body "Redirect probe $NONCE, long enough to pass validation." '+12342343243' '+1 234 234 3243')" \
  | grep -iE '^(HTTP/|location:|access-control-)' | sed 's/^/  /'
echo "  ^ a 3xx with a Location header would explain why only --location worked."

echo
echo "=== 2. exact duplicate, sent three times in a row ==="
DUP="$(body "Duplicate probe $NONCE, long enough to pass validation." '+12342343243' '+1 234 234 3243')"
post "$DUP" "1st send"
post "$DUP" "2nd send (identical)"
post "$DUP" "3rd send (identical)"
echo "  ^ 1st PASS then failures => idempotency de-dup on phoneE164 + description."

echo
echo "=== 3. same phone, different description ==="
post "$(body "Different text $NONCE-a, long enough to pass validation." '+12342343243' '+1 234 234 3243')" "desc changed, phone same"
post "$(body "Different text $NONCE-b, long enough to pass validation." '+12342343243' '+1 234 234 3243')" "desc changed again"
echo "  ^ these PASS => de-dup keyed on the description. These FAIL => rate limit on the phone."

echo
echo "=== 4. different phone, same description ==="
post "$(body "Shared text $NONCE, long enough to pass validation." '+12125550188' '+1 212 555 0188')" "phone changed"
echo "  ^ PASS here plus failures in 3 => the limit is per phone number."

echo
echo "Read it as:"
echo "  section 1 shows a 3xx      -> add -L, or point the site at the final URL"
echo "  2 fails, 3 passes          -> idempotency de-dup (working as designed)"
echo "  2 and 3 fail, 4 passes     -> rate limit per phone number"
echo "  everything passes          -> transient; capture the failing response next time"
echo
