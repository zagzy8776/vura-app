/**
 * Base URL for the backend API. Must point to your backend (e.g. Render).
 * Set VITE_API_URL in your frontend env to your backend URL (e.g. https://vura-backend.onrender.com).
 */
const PROD_FALLBACK = "https://vura-backend.onrender.com/api";

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
