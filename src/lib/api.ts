/**
 * Base URL for the backend API. Must point to the backend, not the frontend.
 * Wrong URL causes "Unexpected token 'export'" when the app serves JS instead of JSON.
 */
const PROD_FALLBACK = "https://vura-app.onrender.com/api";
const MISCONFIGURED_HOSTS = [
  "https://vura-backend.onrender.com",
  "https://vura-backend.onrender.com/api",
];

export function getApiUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv && typeof fromEnv === "string" && fromEnv.trim()) {
    const base = fromEnv.trim().replace(/\/$/, "");
    const normalized = base.endsWith("/api") ? base : `${base}/api`;

    // Auto-correct the known wrong host to avoid 404 HTML responses during auth
    if (MISCONFIGURED_HOSTS.some((host) => normalized.startsWith(host))) {
      console.warn(
        `[Vura] VITE_API_URL is set to deprecated host (${normalized}). Falling back to ${PROD_FALLBACK}.`,
      );
      return PROD_FALLBACK;
    }

    return normalized;
  }

  if (import.meta.env.PROD) {
    return PROD_FALLBACK;
  }

  return "http://localhost:3002/api";
}
