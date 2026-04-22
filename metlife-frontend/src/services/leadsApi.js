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

export const fetchLeadsList = async (token) => {
  const response = await fetch(buildUrl(envConfig.leadsPath), {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to load leads.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data ?? [];
};

export const fetchLeadDetail = async (token, leadId) => {
  const safeId = encodeURIComponent(leadId);
  const response = await fetch(`${buildUrl(envConfig.leadsPath)}/${safeId}/detail`, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to load lead detail.");
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  const payload = await response.json();
  return payload?.data;
};
