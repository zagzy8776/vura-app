# Nellobyte Systems (ClubKonnect) Bills Integration

Vura uses **Nellobyte Systems** (ClubKonnect / Nellobyte Systems Ltd) as the primary bills provider for airtime, data, electricity, cable TV, and betting when configured.

## Setup

1. **Register** at [ClubKonnect](https://www.clubkonnect.com/) (Nellobyte Systems).
2. **Get credentials** from your dashboard:
   - `UserID` (e.g. CK101273533)
   - `APIKey` (keep secret)
3. **Whitelist your server IP** — see [How to whitelist your server IP](#how-to-whitelist-your-server-ip) below.
4. **Set environment variables** in your backend `.env`:

```env
NELLOBYTE_USERID=YOUR_USERID
NELLOBYTE_API_KEY=YOUR_API_KEY
```

5. Restart the backend.

## Provider selection

- If **both** `NELLOBYTE_USERID` and `NELLOBYTE_API_KEY` are set → Nellobyte is used.
- Otherwise → Peyflex is used (requires `PEYFLEX_API_TOKEN`).

## Supported services

| Service | Endpoint | Notes |
|--------|----------|-------|
| **Airtime** | `APIAirtimeV1.asp` | Min ₦50, max ₦200,000 (Nellobyte) |
| **Data** | `APIDatabundleV1.asp` | Plans from `APIDatabundlePlansV2.asp`; API returns network-keyed object or array; supports SME, Corporate, Gifting piles per network |
| **Electricity** | `APIElectricityV1.asp` | Discos from `APIElectricityDiscosV2.asp` |
| **Cable TV** | `APICableTVV1.asp` | DStv, GOtv, StarTimes, Showmax |
| **Betting** | `APIBettingV1.asp` | Fund betting wallets (NAIRABET, Bet9ja, etc.) |

---

## How to whitelist your server IP

ClubKonnect requires your server’s public IP to be whitelisted. Without this, their API will reject your requests.

1. **Get your server’s public IP**
   - **Local dev:** Use your current public IP (visit https://whatismyipaddress.com/ or `curl ifconfig.me`).
   - **Production (e.g. Render):** Check your hosting provider’s “Service IP” or use an outbound IP. On Render, it’s usually in Settings → Networking. If your IP changes, you may need a static IP or to update the whitelist.
   - **Your own server/VPS:** Use the public IP from `curl ifconfig.me` on the server.

2. **Add it in ClubKonnect**
   - Log in at [ClubKonnect](https://www.clubkonnect.com/).
   - Open the **IP whitelist** page: [APIParaWhitelistServerIPV1.asp](https://www.clubkonnect.com/APIParaWhitelistServerIPV1.asp).
   - Add your server’s public IP and save.

3. **Test**
   - Call any bills API (e.g. `/bills/airtime/networks`) from your backend. If you see data, the whitelist is correct.
   - If you get “INVALID_CREDENTIALS” or connection errors, confirm:
     - `NELLOBYTE_USERID` and `NELLOBYTE_API_KEY` are correct.
     - The whitelisted IP matches your server’s outbound IP.

## Flow

1. User selects network/plan/disco in the app.
2. Backend debits user balance and calls Nellobyte API.
3. Nellobyte returns `ORDER_RECEIVED` (statuscode 100).
4. Backend polls `APIQueryV1.asp` until `ORDER_COMPLETED` (statuscode 200) or timeout (~18 sec).
5. On success → transaction marked SUCCESS.  
   On timeout/failure → user refunded.

## Status codes

- `100` = ORDER_RECEIVED (processing)
- `200` = ORDER_COMPLETED (success)
- See [full list](https://www.clubkonnect.com/APIParaGetDisputeResolutionV1.asp) for errors.

## Security

- **Never** commit `NELLOBYTE_USERID` or `NELLOBYTE_API_KEY` to version control.
- Use environment variables or a secrets manager.
