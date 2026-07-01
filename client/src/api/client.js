import axios from "axios";

/**
 * API base URL resolution:
 * - VITE_API_URL (set in Vercel/local) wins when defined
 * - Dev without env → localhost backend
 * - Production without env → same-origin /api (requires proxy) — do NOT use localhost
 */
export const getApiBaseUrl = () => {
  const configured = String(import.meta.env.VITE_API_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  if (import.meta.env.DEV) return "http://localhost:5000/api";
  return "/api";
};

/**
 * Base URL for <video src> and other browser media requests.
 * When VITE_API_URL is set (Vercel → Render), media must hit the backend — not /api on the frontend host.
 * In dev without VITE_API_URL, use same-origin /api so Vite proxy keeps canvas capture working.
 */
export const getMediaApiBaseUrl = () => {
  const configured = String(import.meta.env.VITE_API_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  if (import.meta.env.DEV && typeof window !== "undefined") return "/api";
  return getApiBaseUrl();
};

export const getServerBaseUrl = () => {
  const configured = String(import.meta.env.VITE_SERVER_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const apiUrl = String(import.meta.env.VITE_API_URL || "").trim();
  if (apiUrl) {
    return apiUrl.replace(/\/api\/?$/, "").replace(/\/$/, "");
  }
  if (import.meta.env.DEV) return "http://localhost:5000";
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("cds_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const serverBaseUrl = getServerBaseUrl();

export default api;
