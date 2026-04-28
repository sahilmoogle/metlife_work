/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loginRequest, meRequest, registerRequest } from "../src/services/authApi";

const AUTH_TOKEN_KEY = "lead_nurturing_access_token";
const AUTH_TYPE_KEY = "lead_nurturing_token_type";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY));
  const [tokenType, setTokenType] = useState(() => localStorage.getItem(AUTH_TYPE_KEY) || "Bearer");
  const [user, setUser] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const clearSession = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_TYPE_KEY);
    setToken(null);
    setTokenType("Bearer");
    setUser(null);
  }, []);

  const loadUser = useCallback(
    async (accessToken, { mode } = { mode: "bootstrap" }) => {
      if (!accessToken) {
        setUser(null);
        return;
      }

      try {
        const userData = await meRequest(accessToken);
        setUser(userData);
      } catch (error) {
        const message = String(error?.message || "");
        const isRevoked = message.toLowerCase().includes("revoked");

        // If /me fails during bootstrap, treat token as invalid and clear it.
        // If it fails right after login, keep the token and allow navigation;
        // the backend may not be ready to resolve user details yet.
        if (mode === "bootstrap" || isRevoked) {
          clearSession();
        } else {
          setUser(null);
        }
      }
    },
    [clearSession]
  );

  useEffect(() => {
    const bootstrap = async () => {
      if (!token) {
        setIsBootstrapping(false);
        return;
      }

      await loadUser(token, { mode: "bootstrap" });
      setIsBootstrapping(false);
    };

    bootstrap();
  }, [loadUser, token]);

  const login = useCallback(async ({ email, password }) => {
    const data = await loginRequest({ email, password });

    localStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
    localStorage.setItem(AUTH_TYPE_KEY, data.token_type || "Bearer");
    setToken(data.access_token);
    setTokenType(data.token_type || "Bearer");

    await loadUser(data.access_token, { mode: "postLogin" });
  }, [loadUser]);

  const register = useCallback(
    async ({ fullName, email, password }) => {
      const data = await registerRequest({ fullName, email, password });

      localStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
      localStorage.setItem(AUTH_TYPE_KEY, data.token_type || "Bearer");
      setToken(data.access_token);
      setTokenType(data.token_type || "Bearer");

      await loadUser(data.access_token, { mode: "postLogin" });
    },
    [loadUser]
  );

  const logout = useCallback(async () => {
    // Frontend-only: clear local auth without blacklisting token server-side.
    // Backend currently uses deterministic JWTs and blacklist; calling /logout
    // can cause all future logins to return the same (now revoked) token.
    clearSession();
  }, [clearSession]);

  const updateUser = useCallback((patch) => {
    setUser((current) => {
      const base = current ?? {};
      const nextPatch = typeof patch === "function" ? patch(base) : patch;
      return { ...base, ...(nextPatch || {}) };
    });
  }, []);

  const value = useMemo(
    () => ({
      token,
      tokenType,
      user,
      isAuthenticated: Boolean(token),
      isBootstrapping,
      login,
      register,
      logout,
      updateUser,
    }),
    [isBootstrapping, login, logout, register, token, tokenType, updateUser, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
};
