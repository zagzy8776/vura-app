# Fix: Admin 404 and wrong API URL on Vercel

If you see in the browser console:

- `GET https://vura-backend.onrender.com/api/admin/check 404`
- Or the admin login page shows **API: https://vura-backend.onrender.com/api**

then the **frontend was built** with the wrong backend URL. The code in this repo uses **vura-app.onrender.com** by default, but **Vite bakes `VITE_API_URL` into the build**. So if that variable is set to `vura-backend.onrender.com` in Vercel, every deploy will keep using it.

## Fix (do this in Vercel)

1. Open **Vercel** → your project (the one that serves the frontend).
2. Go to **Settings** → **Environment Variables**.
3. Find **VITE_API_URL**.
   - **Edit it** to: `https://vura-app.onrender.com`  
     (no trailing slash; the app adds `/api` itself.)
   - Or **delete it** so the app uses the default (vura-app.onrender.com).
4. **Redeploy**: **Deployments** → three dots on the latest deployment → **Redeploy**.

After the new build finishes, the app will call **https://vura-app.onrender.com/api** and admin (and all other API calls) will hit your real backend.

---

**Note:** The error `webpage_content_reporter.js: Uncaught SyntaxError: Unexpected token 'export'` comes from a **browser extension**, not this app. You can ignore it or disable that extension.
