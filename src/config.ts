/// <reference types="vite/client" />
/**
 * Resolves the backend URL for API endpoints.
 * When running inside a mobile APK/WebView (like Capacitor), relative paths like /api/...
 * will not resolve correctly to the backend server. Using getApiUrl ensures all fetches
 * point to the correct absolute URL of the deployed cloud backend.
 */
export function getApiUrl(path: string): string {
  try {
    const stored = localStorage.getItem("fleet_settings");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.backendUrl) {
        const base = parsed.backendUrl.trim().replace(/\/$/, "");
        if (base) {
          return `${base}${path}`;
        }
      }
    }
  } catch (e) {
    // LocalStorage or JSON parse failed, ignore
  }

  // Fallback to bundler-injected env variable if present
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) {
    const base = envUrl.trim().replace(/\/$/, "");
    if (base) {
      return `${base}${path}`;
    }
  }

  // Default fallback: relative path for standard web app deployments
  return path;
}
