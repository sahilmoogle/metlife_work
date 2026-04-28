import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import mainIcon from "../src/assets/images/main-icon.png";
import metlifeBg from "../src/assets/images/loginBackground.png";
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

const EyeIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
      stroke="currentColor"
      strokeWidth="1.6"
    />
  </svg>
);

const EyeOffIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M3.5 4.5 20 21"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M10.6 10.6a2.5 2.5 0 0 0 3.54 3.54"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M6.6 6.65C4.25 8.21 2.5 12 2.5 12s3.5 7 9.5 7c1.55 0 2.95-.3 4.18-.8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M9.2 5.4A10.9 10.9 0 0 1 12 5c6 0 9.5 7 9.5 7s-1.15 2.3-3.3 4.25"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    "relative z-[1] h-12 w-full rounded-xl border border-gray-200 bg-white pl-12 pr-12 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-volt-borderSoft dark:bg-volt-card/85 dark:text-volt-text dark:placeholder:text-volt-muted2 dark:focus:ring-indigo-500/15";

  return (
    <div className="h-screen overflow-hidden bg-white dark:bg-volt-bg0">
      <div className="mx-auto grid h-full max-w-[1600px] grid-cols-1 lg:grid-cols-2">
        {/* Inspiration / marketing panel */}
        <section className="relative hidden h-full overflow-hidden lg:block">
          <img
            src={metlifeBg}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-white/10 to-white/0" />
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/18 blur-3xl" />
            <div className="absolute right-[-120px] top-10 h-96 w-96 rounded-full bg-cyan-300/15 blur-3xl" />
            <div className="absolute -bottom-24 left-10 h-96 w-96 rounded-full bg-fuchsia-300/15 blur-3xl" />
          </div>
          <div className="relative flex h-full flex-col px-10 py-8">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70 shadow-sm ring-1 ring-white/80">
                <img src={mainIcon} alt="" className="h-8 w-8 object-contain" />
              </div>
              <div className="leading-tight">
                <p className="text-base font-semibold tracking-tight text-slate-900">
                  Lead<span className="text-[#7c3aed]">Nurturing</span>
                </p>
                <p className="text-xs text-slate-600">AI Agents Platform</p>
              </div>
            </div>

            <div className="mt-4 max-w-[520px]">
              <h1 className="text-[36px] font-semibold leading-[1.1] tracking-tight text-slate-900">
                Smarter Leads.
                <br />
                <span className="text-[#7c3aed]">Stronger Relationships.</span>
              </h1>

            </div>

            <div className="mt-6 grid max-w-[520px] gap-3">
              {[
                {
                  title: "AI-Powered Insights",
                  desc: "Understand lead behavior and intent with advanced AI.",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                      <path
                        d="M12 3 20 7v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M9.5 12.5 11.2 14.2 14.8 10.6"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ),
                },
                {
                  title: "Intelligent Engagement",
                  desc: "AI Agents engage leads with the right message at the right time.",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                      <path
                        d="M7 7h10v7a4 4 0 0 1-4 4H9l-4 3V7a4 4 0 0 1 4-4Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                      <path d="M9 11h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      <path d="M9 14h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  ),
                },
                {
                  title: "Better Conversions",
                  desc: "Optimize every interaction to improve conversion rates.",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                      <path d="M4 19h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      <path
                        d="M7 16V10m5 6V6m5 10v-4"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  ),
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="flex items-center gap-3 rounded-2xl bg-white/60 px-4 py-3 shadow-sm ring-1 ring-white/70 backdrop-blur-[2px]"
                >
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white/75 text-[#7c3aed] ring-1 ring-white/80">
                    {f.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{f.title}</p>
                    <p className="text-xs leading-relaxed text-slate-600">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto pt-5">
              <div className="grid max-w-[520px] grid-cols-3 gap-3">
                <div className="rounded-2xl bg-white/70 px-4 py-3 text-xs text-slate-600 shadow-sm ring-1 ring-white/75 backdrop-blur-[2px]">
                  <p className="text-[11px]">Lead Score</p>
                  <div className="mt-0.5 flex items-baseline justify-between gap-2">
                    <p className="text-lg font-semibold text-[#7c3aed]">92</p>
                    <span className="text-emerald-600">↗</span>
                  </div>
                </div>
                <div className="rounded-2xl bg-white/70 px-4 py-3 text-xs text-slate-600 shadow-sm ring-1 ring-white/75 backdrop-blur-[2px]">
                  <p className="text-[11px]">Engagement</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">High</p>
                </div>
                <div className="rounded-2xl bg-white/70 px-4 py-3 text-xs text-slate-600 shadow-sm ring-1 ring-white/75 backdrop-blur-[2px]">
                  <p className="text-[11px]">Conversion</p>
                  <div className="mt-0.5 flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">+35%</p>
                    <span className="text-emerald-600">↗</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Auth panel */}
        <section className="app-dark-main-fill relative flex w-full flex-col bg-gradient-to-b from-slate-50 to-white px-6 py-6 sm:px-10 lg:px-14 xl:px-20 dark:from-transparent dark:to-transparent">
          <div className="flex items-center justify-end">
            <div className="relative inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs shadow-sm dark:border-volt-borderSoft/80 dark:bg-[linear-gradient(180deg,rgba(20,38,74,0.9),rgba(12,22,46,0.88))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <span className="inline-block h-2 w-2 rounded-full bg-indigo-500/80" />
              <select
                value={i18n.language}
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                className="ml-2 cursor-pointer appearance-none bg-transparent pr-6 text-xs font-semibold text-gray-900 outline-none dark:text-white"
                aria-label="Language"
              >
                <option value="en">{t("language.en")}</option>
                <option value="jp">{t("language.jp")}</option>
              </select>
              <svg viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute right-2 h-4 w-4 text-gray-500 dark:text-volt-muted" aria-hidden="true">
                <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center py-6">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-200 dark:bg-volt-panel dark:ring-volt-borderSoft">
                <img src={mainIcon} alt="" className="h-10 w-10 object-contain" />
              </div>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                Welcome Back!
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-volt-muted">
                Sign in to your {t("brand.name")} platform to continue
              </p>
            </div>

            <div className="app-surface-card mt-6 p-5 sm:p-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="login-email" className="mb-2 block text-xs font-semibold text-gray-700 dark:text-volt-text">
                    {t("login.email")}
                  </label>
                  <div className="relative">
                    <MailIcon className="pointer-events-none absolute left-4 top-1/2 z-[2] h-[18px] w-[18px] -translate-y-1/2 text-indigo-500/80" />
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="Enter your email address"
                      autoComplete="email"
                      required
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="pt-1">
                  <div className="mb-2 flex items-center justify-between">
                    <label htmlFor="login-password" className="block text-xs font-semibold text-gray-700 dark:text-volt-text">
                      {t("login.password")}
                    </label>
                    <button
                      type="button"
                      className="text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                      onClick={() => setError("Forgot password is not enabled yet.")}
                    >
                      Forgot your password?
                    </button>
                  </div>
                  <div className="relative">
                    <LockIcon className="pointer-events-none absolute left-4 top-1/2 z-[2] h-[18px] w-[18px] -translate-y-1/2 text-indigo-500/80" />
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                      className={inputClass}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 z-[3] -translate-y-1/2 rounded-md p-2 text-gray-400 transition hover:text-gray-600 dark:text-volt-muted2 dark:hover:text-volt-text"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {error ? (
                  <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4c27ff] via-[#3b1fe8] to-[#2a20b8] text-sm font-semibold text-white shadow-[0_12px_30px_rgba(59,31,232,0.32)] transition hover:brightness-[1.05] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
                >
                  {isSubmitting ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      {t("login.loggingIn")}
                    </>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </form>
            </div>

            <p className="mt-6 text-center text-sm text-gray-500 dark:text-volt-muted2">
              Don&apos;t have an account?{" "}
              <Link
                to="/signup"
                className="font-semibold text-indigo-700 underline-offset-4 hover:text-indigo-800 hover:underline dark:text-indigo-300 dark:hover:text-indigo-200"
              >
                Sign up
              </Link>
            </p>

            <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-gray-400 dark:text-volt-muted2">
              <LockIcon className="h-4 w-4" />
              Your data is secure with enterprise-grade encryption
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;
