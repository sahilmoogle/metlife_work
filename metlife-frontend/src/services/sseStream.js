import { envConfig } from "../config/env.js";

/**
 * Browser EventSource cannot send ``Authorization``; backend accepts the same JWT as ``access_token``.
 * @param {string} token
 * @returns {string}
 */
export function buildSseStreamUrl(token) {
  if (!token) {
    throw new Error("SSE requires an access token");
  }
  const root = (envConfig.apiBaseUrl || "").replace(/\/$/, "");
  const path = `${root}/sse/stream`;
  const url = path.startsWith("http")
    ? new URL(path)
    : new URL(path.startsWith("/") ? path : `/${path}`, window.location.origin);
  url.searchParams.set("access_token", token);
  return url.toString();
}
