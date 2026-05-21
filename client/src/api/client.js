import axios from "axios";

/**
 * API base URL resolution:
 * - VITE_API_URL (set in Vercel/local) wins when defined
 * - Dev without env → localhost backend
 * - Production without env → same-origin /api (requires proxy) — do NOT use localhost
 */
const resolveApiBaseUrl = () => {
  const configured = String(import.meta.env.VITE_API_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  if (import.meta.env.DEV) return "http://localhost:5000/api";
  return "/api";
};

const resolveServerBaseUrl = () => {
  const configured = String(import.meta.env.VITE_SERVER_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  if (import.meta.env.DEV) return "http://localhost:5000";
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
};

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("cds_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const serverBaseUrl = resolveServerBaseUrl();

export default api;
