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

export const startWorkflow = async (token, { leadId, targetLanguage = "JA" }) => {
  const response = await fetch(`${buildUrl(envConfig.agentsPath)}/start`, {
    method: "POST",
    headers: authedHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ lead_id: leadId, target_language: targetLanguage }),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Failed to start workflow.");
    throw new Error(message);
  }
  const payload = await response.json();
  return payload?.data;
};

export const resumeWorkflow = async (token, { threadId, resumeValue = "approved" }) => {
  const response = await fetch(`${buildUrl(envConfig.agentsPath)}/resume`, {
    method: "POST",
    headers: authedHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ thread_id: threadId, resume_value: resumeValue }),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Failed to resume workflow.");
    throw new Error(message);
  }
  const payload = await response.json();
  return payload?.data;
};

export const retryResumeWorkflow = async (token, { threadId, resumeValue = "approved" }) => {
  const safeId = encodeURIComponent(threadId);
  const qs = new URLSearchParams({ resume_value: resumeValue }).toString();
  const response = await fetch(`${buildUrl(envConfig.agentsPath)}/${safeId}/resume?${qs}`, {
    method: "POST",
    headers: authedHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Failed to resume workflow.");
    throw new Error(message);
  }
  const payload = await response.json();
  return payload?.data;
};

export const getWorkflowStatus = async (token, threadId) => {
  const safeId = encodeURIComponent(threadId);
  const response = await fetch(`${buildUrl(envConfig.agentsPath)}/${safeId}/status`, {
    method: "GET",
    headers: authedHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Failed to load workflow status.");
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  const payload = await response.json();
  return payload?.data;
};

/** GET /agents/{thread_id}/history — LangGraph execution_log audit trail. */
export const getWorkflowHistory = async (token, threadId) => {
  const safeId = encodeURIComponent(threadId);
  const response = await fetch(`${buildUrl(envConfig.agentsPath)}/${safeId}/history`, {
    method: "GET",
    headers: authedHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Failed to load workflow history.");
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  const payload = await response.json();
  return payload?.data;
};

export const getLatestBatch = async (token) => {
  const response = await fetch(`${buildUrl(envConfig.agentsPath)}/batch/latest`, {
    method: "GET",
    headers: authedHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Failed to load latest batch.");
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  const payload = await response.json();
  return payload?.data;
};

export const runBatch = async (token) => {
  const response = await fetch(`${buildUrl(envConfig.agentsPath)}/batch/run`, {
    method: "POST",
    headers: authedHeaders(token),
  });

  // Note: backend returns 200 with success=false when no leads found.
  if (!response.ok) {
    const message = await parseApiError(response, "Failed to start batch run.");
    throw new Error(message);
  }
  const payload = await response.json();
  return payload;
};

export const getBatchStatus = async (token, batchId) => {
  const safeId = encodeURIComponent(batchId);
  const response = await fetch(`${buildUrl(envConfig.agentsPath)}/batch/${safeId}`, {
    method: "GET",
    headers: authedHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Failed to load batch status.");
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  const payload = await response.json();
  return payload?.data;
};

export const trackEvent = async (token, body) => {
  const response = await fetch(`${buildUrl(envConfig.agentsPath)}/events/track`, {
    method: "POST",
    headers: authedHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Failed to track event.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const trackClick = async (token, body) => {
  const response = await fetch(`${buildUrl(envConfig.agentsPath)}/track/click`, {
    method: "POST",
    headers: authedHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Failed to track click.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const listScenarioConfig = async (token) => {
  const response = await fetch(`${buildUrl(envConfig.agentsPath)}/scenarios/config`, {
    method: "GET",
    headers: authedHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Failed to load scenario config.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data ?? [];
};

export const updateScenarioConfig = async (token, scenarioId, body) => {
  const safeId = encodeURIComponent(scenarioId);
  const response = await fetch(`${buildUrl(envConfig.agentsPath)}/scenarios/config/${safeId}`, {
    method: "PATCH",
    headers: authedHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Failed to update scenario config.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const intakeQuote = async (token, body) => {
  const response = await fetch(`${buildUrl(envConfig.agentsPath)}/intake/quote`, {
    method: "POST",
    headers: authedHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Failed to create quote intake.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const intakeConsultation = async (token, body, { seminar = false } = {}) => {
  const path = seminar ? "/intake/seminar" : "/intake/consultation";
  const response = await fetch(`${buildUrl(envConfig.agentsPath)}${path}`, {
    method: "POST",
    headers: authedHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Failed to create consultation intake.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const getWorkflowState = async (token, threadId) => {
  const safeId = encodeURIComponent(threadId);
  const response = await fetch(`${buildUrl(envConfig.agentsPath)}/state/${safeId}`, {
    method: "GET",
    headers: authedHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Failed to load workflow state.");
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  const payload = await response.json();
  return payload?.data;
};

