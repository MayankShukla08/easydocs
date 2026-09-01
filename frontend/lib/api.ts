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

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ||
  "https://easydocs-m2zh.onrender.com";

/**
 * The base URL for all API v1 calls.
 * Example: https://easydocs-m2zh.onrender.com/api/v1
 */
export const API_BASE = `${BACKEND_URL}/api/v1`;
