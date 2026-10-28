# Push activation (Web Push / VAPID)

Fail-open: push is dormant until keys are set. In-app notifications always deliver.

## 1. Generate VAPID keys

```bash
pip install pywebpush
python -c "from pywebpush import webpush; print('pywebpush ok')"
# Generate once (keep private key server-only):
python - <<'EOF'
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
import base64
key = ec.generate_private_key(ec.SECP256R1())
raw_priv = key.private_numbers().private_value.to_bytes(32, "big")
raw_pub = key.public_key().public_numbers().x.to_bytes(32, "big") + key.public_key().public_numbers().y.to_bytes(32, "big")
print("PRIVATE:", base64.urlsafe_b64encode(raw_priv).decode().rstrip("="))
print("PUBLIC:", base64.urlsafe_b64encode(b"\x04" + raw_pub).decode().rstrip("="))
EOF
```

Or: `npx web-push generate-vapid-keys`.

## 2. Backend (HF Space)

Add to `backend/requirements.txt`: `pywebpush` (install on Space).
Set env secrets:

- `VAPID_PUBLIC_KEY` = public key above
- `VAPID_PRIVATE_KEY` = private key above (server only, never ship to frontend)
- `VAPID_SUBJECT` = `mailto:hello@ardenostudio.com`

Check: `GET /api/v1/notifications/preferences` returns
`push_configured: true` + `vapid_public_key`.

## 3. Frontend (Vercel)

Set: `VITE_VAPID_PUBLIC_KEY` = same public key. Redeploy.
Subscribe from `/alerts` (Enable push button calls `usePush().subscribe()`,
registers `/sw-push.js`, posts endpoint to `/notifications/push/subscribe`).

Without the var the button shows "Push needs VAPID keys + HTTPS worker;
in-app still works." — expected dormant state.

## 4. Verify

1. `/alerts` → Enable push → allow notifications → `push_subscribed` event.
2. Create alert with channel `push`, trigger match pass.
3. `GET /api/v1/notifications/deliveries` shows `push/sent`;
   without keys it shows `push` queued/skipped and in-app still arrives.
4. Digest/quiet-hours: `digest_queued`/`queued_quiet` receipts flush at
   07:00 Asia/Colombo via digest-flush scheduler
   (`DIGEST_FLUSH_ENABLED`, default on).
