# VPay setup (send to bank + webhook)

## 1. Bank list and send-to-bank

The bank list comes from **VPay’s API**, not from a webhook. The backend:

1. Logs in to VPay: `POST /api/service/v1/query/merchant/login` (username, password, `publicKey` header).
2. Fetches banks: `GET /api/service/v1/query/bank/list/show` with the token.

So the backend **must** have these env vars set (e.g. on Render):

- `VPAY_PUBLIC_KEY`
- `VPAY_USERNAME`
- `VPAY_PASSWORD`

Optional:

- `VPAY_BASE_URL` – default `https://services2.vpay.africa` (production).

If any of the three required vars are missing, the backend returns “bank transfer not available” and the frontend shows “Bank transfer is temporarily unavailable”. After you set them, **redeploy** the backend and use “Try again” or switch to the Bank tab (the app refetches the bank list).

## 2. Webhook URL to set on VPay

Use this URL in the VPay dashboard (or wherever they ask for a webhook URL):

```text
https://YOUR-BACKEND-URL/api/webhooks/vpay
```

Examples:

- Render: `https://vura-app.onrender.com/api/webhooks/vpay`
- Any host: `https://your-domain.com/api/webhooks/vpay`

The backend accepts `POST`, logs the body, and returns `200` with `{ "received": true }`. You can later extend this to update transaction status when VPay sends transfer success/failure (payload format from VPay docs).

## 3. Quick check

- **Bank list not loading:** Ensure `VPAY_PUBLIC_KEY`, `VPAY_USERNAME`, `VPAY_PASSWORD` are set on the backend and redeploy. Then open Send → Bank or click “Try again”.
- **Webhook:** In VPay dashboard set Webhook URL to `https://YOUR-BACKEND-URL/api/webhooks/vpay`.
