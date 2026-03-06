# App-wide feedback report

This report covers Bills (airtime, data, electricity), Dashboard, Send Money, Receive, Fund Wallet, Settings, Crypto Deposit, Cards, Help, Privacy, Terms, Login, Register, and other pages. Focus: **what could make users feel they don’t need to stay in the app**, and **issues in every corner** (empty states, copy, support/contact, consistency).

---

## 1. Things that send users outside the app (or feel like it)

### 1.1 Support / contact — different emails and no single “stay in app” path

| Location | What users see / do | Issue |
|----------|---------------------|--------|
| **Settings** | “Contact support” → `mailto:support@vura.com` | Opens mail client (leaves app). Same in Profile dialog and “Contact support to freeze account”. |
| **Help** | “Email” shows `help@vura.ng` | **Different domain** (.ng vs .com). Buttons (Live Chat, Call Us, Email) **do nothing** on click — no `mailto:`, no `tel:`, no chat. Users may think they’re leaving the app or that contact is broken. |
| **Crypto Deposit** (error step) | “Contact Support” → `mailto:support@vura.app` | **Third email** (support@vura.**app**). Opens mail client. |
| **LiveChat** (Help flow) | “Visit our security page or call 0800-VURA” (forgot PIN/password) | Suggests going somewhere else; no in-app “security page” or clear next step. |
| **LiveChat** | “Call 0800-FRAUD” for fraud | Reasonable for fraud; no issue. |

**Summary:** Three different support emails (support@vura.com, help@vura.ng, support@vura.app) look inconsistent and can reduce trust. Every “contact support” path today sends users to email (or implies calling), so there’s no way to get help without leaving the app.

---

### 1.2 Fund Wallet

- **Paystack redirect:** “Fund with card” correctly opens `authorizationUrl` (Paystack). User leaves the app to pay, then returns. This is expected; no change needed for flow.

---

### 1.3 Terms & Privacy

- Links open `/terms` and `/privacy` in a **new tab** (`target="_blank"`). Same app, same origin — users are still in your product, just in another tab. Optional: open in same tab so it feels more “in app.”

---

### 1.4 Bills (Airtime, Data, Electricity)

- **Success:** “View wallet” / “Buy again” keep users in the app. No external links on success.
- **Error:** Refund message + “Try again” / “Retry” — no “contact support” that forces exit; good.
- No other links or copy that say “go to another site or app” for the main flow.

---

## 2. Bills page — corners and flow

- **Discovery:** Bills are only reachable from Dashboard **Quick Actions** (Airtime, Data, Electricity). There is **no “Bills” item in the sidebar**. Users who don’t look at Quick Actions may not find bills.
- **Tab switching:** Airtime / Data / Electricity tabs work; URL `?tab=airtime|data|electricity` is used correctly.
- **Balance:** Shown when available; no misleading “leave app to check balance” message.
- **Favorites / recents:** Save as favorite and labels are clear.
- **Empty states:** If networks or plans fail to load, the UI shows loading then grid; ensure fallback copy (e.g. “No plans right now. Try another network or try again later.”) exists so users don’t think the app is broken.
- **Electricity:** Customer name/address no longer shown before payment (per your earlier fix); only “Meter verified — proceed to pay.” Good.

---

## 3. Other pages — quick scan

| Page | Notes |
|------|--------|
| **Dashboard (Index)** | Balance, Quick Actions, stats, transactions. Error state: “Failed to load dashboard data. Please try again later.” — in-app, no “leave app” CTA. |
| **Send Money** | Tag/bank, amount, PIN, scheduling. No external links in the main flow. |
| **Receive** | QR, payment link, virtual account. All in-app. BVN message points to Settings (in-app). |
| **Fund Wallet** | Paystack redirect is the only “leave”; return flow and verify work in-app. |
| **Settings** | BVN, PIN, payment prefs, freeze account. All “contact support” use `mailto:support@vura.com`. |
| **Crypto Deposit** | Error step has “Contact Support” → `support@vura.app`. Rest of flow in-app. |
| **Cards** | In-app; no external links spotted. |
| **Help** | FAQ + contact options. Contact options are **non-clickable** (no mailto/tel/chat). |
| **Accounts** | Balances, “Convert” (button may be coming soon). No exit-inducing content. |
| **Transactions** | List in-app. No external links. |
| **Login / Register** | In-app; links to Terms/Privacy (same app). |
| **NotFound** | “Return to Home” → `/` (in-app). Good. |

---

## 4. Inconsistencies and trust

1. **Support emails:**  
   - Settings / Help dialog: **support@vura.com**  
   - Help page: **help@vura.ng**  
   - Crypto Deposit: **support@vura.app**  
   Pick one (e.g. support@vura.ng or support@vura.com) and use it everywhere. Update Help page and Crypto Deposit to match Settings.

2. **Help page contact buttons:**  
   “Live Chat,” “Call Us,” “Email” look like actions but don’t open chat, dialer, or mail. Either wire them (e.g. `mailto:`, `tel:`, or real live chat) or change the label (e.g. “Email: help@vura.ng” with a copy button and optional mailto).

3. **LiveChat “security page”:**  
   For forgot PIN/password, the bot says “visit our security page or call 0800-VURA.” If “security page” is just Settings or Help, say so in-app (e.g. “Go to Settings → Transaction PIN” or “See Help”) so users don’t feel they must leave the app.

---

## 5. Summary: “Won’t need to be in the app anymore”

- **Bills:** Nothing in the flow that would make users think they don’t need the app; success and error handling keep them in-app.
- **Rest of app:** The only strong “leave the app” moments are:
  1. **Support:** Every path is email (or phone). Unifying the support email and, where possible, adding in-app help (e.g. open Help/FAQ, or real chat) would keep more users inside the app.
  2. **Fund Wallet:** Paystack redirect is necessary and fine.

So: **users don’t see something on Bills or elsewhere that obviously replaces the app**; the main improvement is making support feel consistent and in-app where possible (one email, clickable contact on Help, and clearer in-app instructions for PIN/security).

---

## 6. Recommended next steps (optional)

1. **Unify support email** everywhere to one address (e.g. support@vura.ng or support@vura.com) and use it in Settings, Help page, and Crypto Deposit.
2. **Help page:** Make “Email” open `mailto:` and “Call Us” open `tel:0800-VURA` (or your real number); or add a “Copy email” button and keep mailto.
3. **Sidebar:** Consider adding a “Bills” nav item so bills are discoverable beyond Quick Actions.
4. **LiveChat:** Replace “visit our security page” with “Go to Settings → Transaction PIN” (or a direct link to `/settings` with a hash/anchor if you add one).
5. **Terms/Privacy:** Optionally open in same tab instead of new tab so it feels more like part of the app.

If you tell me which of these you want (e.g. “unify email and fix Help page only”), I can suggest exact copy and code changes file-by-file.
