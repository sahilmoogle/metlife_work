import { envConfig } from "../config/env";

const buildUrl = (path) => `${envConfig.apiBaseUrl}${path}`;

const parseApiError = async (response, fallbackMessage) => {
  try {
    const payload = await response.json();
    return payload?.detail || payload?.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
};

export const loginRequest = async ({ email, password }) => {
  const response = await fetch(buildUrl(envConfig.authLoginPath), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to login.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const registerRequest = async ({ fullName, email, password }) => {
  const response = await fetch(buildUrl(envConfig.authRegisterPath), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ full_name: fullName, email, password }),
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to sign up.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const meRequest = async (token) => {
  const response = await fetch(buildUrl(envConfig.authMePath), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to fetch user profile.");
    throw new Error(message);
  }

  const payload = await response.json();
  return payload?.data;
};

export const logoutRequest = async (token) => {
  const response = await fetch(buildUrl(envConfig.authLogoutPath), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Unable to logout.");
    throw new Error(message);
  }
};
