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

const authedHeaders = (token, extra = {}) => ({
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...extra,
});

export const fetchHitlQueue = async (
  token,
  { gateType, queue, batchId, threadId } = {},
) => {
  const params = new URLSearchParams();
  if (gateType) params.set("gate_type", gateType);
  if (queue === "resolved") params.set("queue", "resolved");
  if (batchId) params.set("batch_id", batchId);
  if (threadId) params.set("thread_id", threadId);
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

export const listHandoffs = async (token, { status } = {}) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  const response = await fetch(`${buildUrl(envConfig.hitlPath)}/handoffs${qs ? `?${qs}` : ""}`, {
    method: "GET",
    headers: authedHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to load handoffs.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data ?? [];
};

export const assignHandoff = async (token, handoffId, assignedTo) => {
  const safeId = encodeURIComponent(handoffId);
  const response = await fetch(`${buildUrl(envConfig.hitlPath)}/handoffs/${safeId}/assign`, {
    method: "POST",
    headers: authedHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ assigned_to: assignedTo }),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to assign handoff.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const completeHandoff = async (token, handoffId) => {
  const safeId = encodeURIComponent(handoffId);
  const response = await fetch(`${buildUrl(envConfig.hitlPath)}/handoffs/${safeId}/complete`, {
    method: "POST",
    headers: authedHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to complete handoff.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

