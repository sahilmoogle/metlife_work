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
 * GET /api/v1/analytics/overview?range=30d|90d|all — Bearer JWT required.
 */
export const fetchAnalyticsOverview = async (token, rangeKey = "30d") => {
  const q = new URLSearchParams({ range: rangeKey });
  const url = `${buildUrl(envConfig.analyticsOverviewPath)}?${q.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to load analytics.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data ?? null;
};
