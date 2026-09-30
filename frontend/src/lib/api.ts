import axios from "axios";
import { demoAdapter } from "@/lib/demo/adapter";

/**
 * NEXT_PUBLIC_DEMO_MODE=browser → every request is served by an in-browser
 * implementation of the API (seeded sample mill, persisted to localStorage).
 * This is how the public demo runs with no backend host. Otherwise requests
 * go to the real FastAPI backend at NEXT_PUBLIC_API_URL.
 */
export const BROWSER_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "browser";

const api = axios.create({
  baseURL: BROWSER_DEMO ? "" : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  ...(BROWSER_DEMO ? { adapter: demoAdapter } : {}),
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    const url: string = error.config?.url ?? "";
    const isAuthCall = url.includes("/auth/login") || url.includes("/auth/register");
    if (error.response?.status === 401 && typeof window !== "undefined" && !isAuthCall) {
      localStorage.removeItem("access_token");
      document.cookie = "access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
