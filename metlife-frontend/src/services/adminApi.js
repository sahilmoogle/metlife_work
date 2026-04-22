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

export const listAdminUsers = async (token) => {
  const response = await fetch(buildUrl(envConfig.adminUsersPath), {
    method: "GET",
    headers: authedHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to load users.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const createAdminUser = async (token, body) => {
  const response = await fetch(buildUrl(envConfig.adminUsersPath), {
    method: "POST",
    headers: authedHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to create user.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const updateAdminUser = async (token, userId, body) => {
  const safeId = encodeURIComponent(userId);
  const response = await fetch(`${buildUrl(envConfig.adminUsersPath)}/${safeId}`, {
    method: "PATCH",
    headers: authedHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to update user.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const deactivateAdminUser = async (token, userId) => {
  const safeId = encodeURIComponent(userId);
  const response = await fetch(`${buildUrl(envConfig.adminUsersPath)}/${safeId}`, {
    method: "DELETE",
    headers: authedHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to deactivate user.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const getAdminUser = async (token, userId) => {
  const safeId = encodeURIComponent(userId);
  const response = await fetch(`${buildUrl(envConfig.adminUsersPath)}/${safeId}`, {
    method: "GET",
    headers: authedHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to load user.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const getPermissionMatrix = async (token) => {
  const response = await fetch(`${buildUrl(envConfig.adminUsersPath)}/permissions/matrix`, {
    method: "GET",
    headers: authedHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to load permission matrix.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const getAdminUserPermissions = async (token, userId) => {
  const safeId = encodeURIComponent(userId);
  const response = await fetch(`${buildUrl(envConfig.adminUsersPath)}/${safeId}/permissions`, {
    method: "GET",
    headers: authedHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to load user permissions.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const updateAdminUserPermissions = async (token, userId, body) => {
  const safeId = encodeURIComponent(userId);
  const response = await fetch(`${buildUrl(envConfig.adminUsersPath)}/${safeId}/permissions`, {
    method: "PATCH",
    headers: authedHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to update user permissions.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

