/**
 * Centralized API configuration for EasyDocs.
 *
 * Set NEXT_PUBLIC_BACKEND_URL in your environment:
 *   - Local dev:  http://localhost:8000  (if running backend locally)
 *                 OR the Render URL for testing against production backend
 *   - Vercel:     https://easydocs-m2zh.onrender.com
 *
 * Never put backend secrets (MongoDB URI, API keys) in NEXT_PUBLIC_* variables.
 */

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ||
  "https://easydocs-m2zh.onrender.com";

/**
 * The base URL for all API v1 calls.
 * Example: https://easydocs-m2zh.onrender.com/api/v1
 */
export const API_BASE = `${BACKEND_URL}/api/v1`;

/**
 * Extracts a human-readable error message from an HTTP Response.
 */
export async function parseApiError(
  response: Response,
  fallbackMessage = "Request failed"
): Promise<string> {
  try {
    const text = await response.text();
    if (text) {
      try {
        const json = JSON.parse(text);
        if (typeof json?.detail === "string" && json.detail.trim()) {
          return json.detail.trim();
        }
        if (Array.isArray(json?.detail)) {
          const joined = json.detail
            .map((item: { msg?: string; loc?: string[] }) => item.msg || JSON.stringify(item))
            .filter(Boolean)
            .join("; ");
          if (joined) return joined;
        }
        if (typeof json?.message === "string" && json.message.trim()) {
          return json.message.trim();
        }
        if (typeof json?.error === "string" && json.error.trim()) {
          return json.error.trim();
        }
      } catch {
        // Not JSON, return text if short
        if (text.length < 300) {
          return text.trim();
        }
      }
    }
  } catch {
    // Ignore body read errors
  }

  const statusText = response.statusText ? ` (${response.statusText})` : "";
  return `${fallbackMessage} [HTTP ${response.status}${statusText}]`;
}

/**
 * Formats caught exceptions into user-friendly error messages,
 * distinguishing network/connection errors from other exceptions.
 */
export function formatNetworkError(
  error: unknown,
  fallbackMessage = "An unexpected error occurred."
): string {
  if (error instanceof Error) {
    const msg = error.message;
    // Check for browser network errors (e.g. Failed to fetch, NetworkError)
    if (
      error.name === "TypeError" &&
      (msg.toLowerCase().includes("failed to fetch") ||
        msg.toLowerCase().includes("networkerror") ||
        msg.toLowerCase().includes("load failed"))
    ) {
      return `Unable to connect to the EasyDocs server (${BACKEND_URL}). Please verify your network connection or try again later.`;
    }
    return msg || fallbackMessage;
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return fallbackMessage;
}

