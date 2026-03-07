/**
 * Base URL for the backend API. Points to your backend on Render (vura-app service).
 * Set VITE_API_URL in your frontend env if you use a different backend URL.
 */
const PROD_FALLBACK = "https://vura-app.onrender.com/api";

export function getApiUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv && typeof fromEnv === "string" && fromEnv.trim()) {
    const base = fromEnv.trim().replace(/\/$/, "");
    return base.endsWith("/api") ? base : `${base}/api`;
  }

  if (import.meta.env.PROD) {
    return PROD_FALLBACK;
  }

  return "http://localhost:3002/api";
}
