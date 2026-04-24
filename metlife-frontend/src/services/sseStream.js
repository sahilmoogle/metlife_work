import { envConfig } from "../config/env.js";

const buildUrl = (path) => `${envConfig.apiBaseUrl}${path}`;

const parseApiError = async (response, fallbackMessage) => {
  try {
    const payload = await response.json();
    return payload?.detail || payload?.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
};

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

/**
 * GET /sse/recent — persisted SSE rows (debug / trace). Uses Bearer (unlike EventSource stream).
 * @param {string} token
 * @param {{ leadId?: string, threadId?: string, eventType?: string, limit?: number }} [filters]
 */
export async function fetchRecentSseEvents(token, filters = {}) {
  const qs = new URLSearchParams();
  if (filters.leadId) qs.set("lead_id", filters.leadId);
  if (filters.threadId) qs.set("thread_id", filters.threadId);
  if (filters.eventType) qs.set("event_type", filters.eventType);
  if (filters.limit != null) qs.set("limit", String(filters.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await fetch(`${buildUrl("/sse/recent")}${suffix}`, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to load recent SSE events.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data ?? [];
}
