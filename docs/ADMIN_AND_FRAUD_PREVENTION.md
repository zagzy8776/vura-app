# Admin dashboard & fraud prevention (Vura Bank)

This note is for anyone who uses the **admin dashboard** to approve or reject user verifications. Following it helps keep the bank safe, compliant, and your reputation protected.

---

## How the admin dashboard sees users

- **Pending** tab: users with `kycStatus === PENDING` (Prembly completed or ID/selfie uploaded, waiting for your decision).
- **All users** tab: everyone, with pagination (page size 20).
- For each user you can see:
  - **@vuraTag**, tier, KYC status, **Joined** date, **Verification submitted** date (when they completed Prembly or uploads).
  - **Fraud/risk score** when &gt; 0 (shown in list and in the review modal).
  - **Last login** (if available).
  - **Prembly vs ID/selfie**: Prembly users have no ID/selfie images stored in our app; the modal shows a blue “Prembly verification” note. Users with ID/selfie show the amber “Review checklist (ID/selfie)” and you can view the images.

---

## How to use the dashboard so the bank isn’t used for fraud

1. **Only approve after you’re satisfied**
   - For **Prembly**: we don’t store their ID/selfie; approve only if you’re comfortable they completed the flow and nothing seems off.
   - For **ID/selfie**: confirm the document is a valid government-issued ID and the selfie matches. Reject if unclear, invalid, or obviously fake.

2. **When in doubt, reject**
   - Reject if details don’t match, documents look fake, or behaviour is suspicious. The user will see the reason under **Settings → Identity verification** and can resubmit.

3. **Use fraud/risk signals**
   - If **fraud score** (or any risk indicator) is shown and &gt; 0, review carefully before approving. Consider rejecting or escalating.

4. **One secret for admin**
   - Use the same **admin secret** (the one you use to open the dashboard) for all admin actions, including “Set Tier 2”. Don’t share it; treat it like a root password.

5. **Audit trail**
   - Backend logs admin actions (verify, reject, set tier 2, etc.). Assume everything you do is logged and can be reviewed later.

6. **“Back to Vura”**
   - Use the **Back to Vura** link to leave the admin area and return to the main app without logging out of the app itself.

---

## Quick checklist before approving

- [ ] Identity (name, document, face) is consistent and believable.
- [ ] No obvious red flags (e.g. fake document, wrong person, high fraud score).
- [ ] For Prembly: you’re satisfied they completed the flow; for ID/selfie: document and selfie are valid and match.

If all are true, you can approve to **Tier 3**. If not, **reject** with a clear reason so the user knows what to fix.

---

## Your responsibility

You are the gatekeeper. Approving bad actors can lead to fraud, regulatory issues, and reputational damage. Rejecting when unsure is safer than approving when in doubt. All actions are on you and the platform; use the dashboard accordingly.
