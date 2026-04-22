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
 * GET /api/v1/dashboard/stats — requires Bearer JWT (same as other protected routes).
 */
export const fetchDashboardStats = async (token) => {
  const response = await fetch(buildUrl(envConfig.dashboardStatsPath), {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to load dashboard stats.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};
