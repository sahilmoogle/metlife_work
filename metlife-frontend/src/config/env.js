const normalizeBaseUrl = (url) => {
  if (!url) {
    return "";
  }

  return url.endsWith("/") ? url.slice(0, -1) : url;
};

export const envConfig = {
  apiBaseUrl: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL),
  authLoginPath: import.meta.env.VITE_AUTH_LOGIN_PATH || "/auth/login",
  authRegisterPath: import.meta.env.VITE_AUTH_REGISTER_PATH || "/auth/register",
  authMePath: import.meta.env.VITE_AUTH_ME_PATH || "/auth/me",
  authLogoutPath: import.meta.env.VITE_AUTH_LOGOUT_PATH || "/auth/logout",
};
