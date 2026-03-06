/**
 * Base URL for the backend API. Must point to the backend, not the frontend.
 * Wrong URL causes "Unexpected token 'export'" when the app serves JS instead of JSON.
 */
export function getApiUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv && typeof fromEnv === "string" && fromEnv.trim()) {
    const base = fromEnv.trim().replace(/\/$/, "");
    return base.endsWith("/api") ? base : `${base}/api`;
  }
  if (import.meta.env.PROD) {
    return "https://vura-app.onrender.com/api";
  }
  return "http://localhost:3002/api";
}
