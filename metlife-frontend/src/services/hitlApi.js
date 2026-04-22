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

export const fetchHitlQueue = async (token, { gateType } = {}) => {
  const params = new URLSearchParams();
  if (gateType) params.set("gate_type", gateType);
  const qs = params.toString();

  const response = await fetch(`${buildUrl(envConfig.hitlPath)}/queue${qs ? `?${qs}` : ""}`, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to load HITL queue.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data ?? [];
};

export const fetchHitlDetail = async (token, threadId) => {
  const safeId = encodeURIComponent(threadId);
  const response = await fetch(`${buildUrl(envConfig.hitlPath)}/${safeId}`, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to load HITL detail.");
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  const payload = await response.json();
  return payload?.data;
};

export const approveHitl = async (token, threadId, body) => {
  const safeId = encodeURIComponent(threadId);
  const response = await fetch(`${buildUrl(envConfig.hitlPath)}/${safeId}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to submit HITL decision.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

