import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import loginIcon from "../src/assets/images/login-icon.jpg";
import mainIcon from "../src/assets/images/main-icon.jpg";
import { useTranslation } from "react-i18next";

const MailIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M6.5 7.5 12 11.25 17.5 7.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const LockIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M7 11V8.8A5 5 0 0 1 12 4a5 5 0 0 1 5 4.8V11"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M6.5 11h11A2.5 2.5 0 0 1 20 13.5v4A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-4A2.5 2.5 0 0 1 6.5 11Z"
      stroke="currentColor"
      strokeWidth="1.6"
    />
  </svg>
);

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login({ email, password });
      const destination = location.state?.from || "/dashboard";
      navigate(destination, { replace: true });
    } catch (submitError) {
      setError(submitError.message || "Login failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "relative z-[1] h-12 w-full rounded-xl border border-gray-200 bg-white pl-12 pr-4 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-volt-borderSoft dark:bg-volt-panel dark:text-volt-text dark:placeholder:text-volt-muted2 dark:focus:ring-indigo-500/15";

  return (
    <div className="min-h-screen min-h-[100dvh] bg-white dark:bg-gradient-to-b dark:from-volt-bg1 dark:via-volt-bg0 dark:to-volt-bg0">
      <div className="mx-auto flex min-h-[100dvh] max-w-[1600px]">
        {/* Brand panel */}
        <section className="relative hidden w-1/2 overflow-hidden rounded-r-[32px] bg-gradient-to-br from-[#3228d4] via-[#2a20b8] to-[#1e1688] text-white lg:flex lg:flex-col">
          <div className="pointer-events-none absolute inset-0 opacity-40">
            <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-white/20 blur-3xl" />
            <div className="absolute -bottom-16 -right-16 h-96 w-96 rounded-full bg-indigo-400/25 blur-3xl" />
          </div>

          <div className="relative flex flex-1 flex-col justify-center px-12 py-16 xl:px-16">
            <div className="mx-auto w-full max-w-[480px]">
              <div className="relative overflow-hidden rounded-[28px] bg-white/[0.08] p-6 shadow-inner ring-1 ring-white/20 backdrop-blur-[2px]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_20%,rgba(255,255,255,0.22),transparent)]" />
                <div className="relative flex aspect-[4/3] max-h-[min(52vh,380px)] items-center justify-center">
                  <img
                    src={loginIcon}
                    alt=""
                    className="max-h-full max-w-full object-contain object-center drop-shadow-lg"
                  />
                </div>
              </div>

              <div className="mt-10 text-center">
                <h2 className="text-3xl font-semibold tracking-tight xl:text-[2rem]">{t("brand.name")}</h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/85">
                  Protecting your information is our top priority.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Form panel */}
        <section className="flex w-full flex-1 flex-col bg-gradient-to-b from-slate-50 to-white lg:w-1/2 dark:from-volt-bg1 dark:to-volt-bg0">
          <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:px-14 xl:px-20">
            <div className="mx-auto w-full max-w-[420px]">
              <header className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-indigo-200/80 bg-white shadow-sm dark:border-volt-borderSoft dark:bg-volt-panel">
                  <img src={mainIcon} alt="" className="h-9 w-9 object-contain" />
                </div>
                <div className="min-w-0 leading-tight">
                  <h1 className="truncate text-base font-bold text-indigo-700 dark:text-indigo-400">{t("brand.name")}</h1>
                  <p className="truncate text-xs text-gray-500 dark:text-volt-muted">{t("brand.tagline")}</p>
                </div>
              </header>

              <div className="mt-10">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600 dark:text-indigo-400">
                  {t("login.subtitle")}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                  {t("login.welcomeLine")}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-volt-muted">
                  {t("login.welcomeHint")}
                </p>
              </div>

              <div className="mt-8 rounded-2xl border border-gray-200/90 bg-white p-6 shadow-[0_4px_32px_rgba(15,23,42,0.06)] sm:p-8 dark:border-volt-borderSoft dark:bg-volt-panel/80 dark:shadow-none">
                <form onSubmit={handleSubmit} className="isolate space-y-5">
                  <div>
                    <label
                      htmlFor="login-email"
                      className="mb-2 block text-xs font-semibold text-gray-700 dark:text-volt-text"
                    >
                      {t("login.email")}
                    </label>
                    <div className="relative">
                      <MailIcon className="pointer-events-none absolute left-4 top-1/2 z-[2] h-[18px] w-[18px] -translate-y-1/2 text-indigo-500/80" />
                      <input
                        id="login-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder={t("login.email")}
                        autoComplete="email"
                        required
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="pt-1">
                    <label
                      htmlFor="login-password"
                      className="mb-2 block text-xs font-semibold text-gray-700 dark:text-volt-text"
                    >
                      {t("login.password")}
                    </label>
                    <div className="relative">
                      <LockIcon className="pointer-events-none absolute left-4 top-1/2 z-[2] h-[18px] w-[18px] -translate-y-1/2 text-indigo-500/80" />
                      <input
                        id="login-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={t("login.password")}
                        autoComplete="current-password"
                        required
                        className={inputClass}
                      />
                    </div>
                  </div>

                  {error ? (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                      {error}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#3d32d8] to-[#2a20b8] text-sm font-semibold text-white shadow-[0_8px_24px_rgba(45,32,184,0.35)] transition hover:brightness-[1.05] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        {t("login.loggingIn")}
                      </>
                    ) : (
                      t("login.loginNow")
                    )}
                  </button>
                </form>
              </div>

              <p className="mt-8 text-center text-sm text-gray-500 dark:text-volt-muted2">
                Don&apos;t have an account?{" "}
                <Link
                  to="/signup"
                  className="font-semibold text-indigo-700 underline-offset-4 hover:text-indigo-800 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  Sign up
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;
