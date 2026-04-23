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

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <section className="relative hidden w-1/2 overflow-hidden bg-gradient-to-b from-[#2f21c7] via-[#2a1bb3] to-[#21179a] text-white lg:flex lg:flex-col">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
            <div className="absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
          </div>

          {/* <div className="relative flex items-center gap-3 px-10 pt-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25">
              <div className="h-5 w-5 rounded bg-white/70" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Lead Nurturing</p>
              <p className="text-xs text-white/70">Your Intelligence Platform</p>
            </div>
          </div> */}

          <div className="relative flex flex-1 flex-col items-center justify-center px-10">
            <div className="w-full max-w-[520px]">

              <div className="mx-auto w-full max-w-[520px]">
               
                <div className="relative mx-auto mb-10 aspect-[4/3] w-full overflow-hidden rounded-3xl bg-white/10 ring-1 ring-white/20">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.20),transparent_50%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.18),transparent_55%)]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                     <img src={loginIcon} alt="" />
                  </div>
                </div>

                <div className="text-center">
                  <h2 className="text-3xl font-semibold">{t("brand.name")}</h2>
                  <p className="mt-2 text-sm text-white/80">
                    protecting your information is a top priority
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex w-full flex-col bg-white px-6 py-8 sm:px-10 lg:w-1/2 lg:px-16 dark:bg-slate-950">
          <header className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-lg font-bold text-indigo-700">
              <img src={mainIcon} alt="icon" className="w-8 h-8" /> 
            </div>
            <div>
              <h1 className="text-base font-bold text-indigo-700">{t("brand.name")}</h1>
              <p className="text-xs text-gray-500 dark:text-slate-400">{t("brand.tagline")}</p>
            </div>
          </header>

          <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center">
            <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300">Log in to</h3>
            <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
              <span className="text-indigo-700">{t("brand.name")}</span>
            </p>

            <form onSubmit={handleSubmit} className="mt-8">
              <label className="mb-2 block text-xs font-medium text-gray-600 dark:text-slate-300">{t("login.email")}</label>
              <div className="relative mb-4">
                <MailIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500/70" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("login.email")}
                  autoComplete="email"
                  required
                  className="h-11 w-full rounded-full border border-gray-200 bg-white pl-11 pr-4 text-sm text-gray-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-indigo-500/20"
                />
              </div>

              <label className="mb-2 block text-xs font-medium text-gray-600 dark:text-slate-300">{t("login.password")}</label>
              <div className="relative mb-4">
                <LockIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500/70" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t("login.password")}
                  autoComplete="current-password"
                  required
                  className="h-11 w-full rounded-full border border-gray-200 bg-white pl-11 pr-4 text-sm text-gray-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-indigo-500/20"
                />
              </div>

              {error ? <p className="mb-3 text-sm text-red-500">{error}</p> : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 h-11 w-full rounded-full bg-gradient-to-r from-[#3b2fd6] to-[#2a1bb3] text-sm font-semibold text-white shadow-[0_10px_25px_rgba(59,47,214,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? t("login.loggingIn") : t("login.loginNow")}
              </button>
            </form>

            <p className="mt-10 text-center text-xs text-gray-500 dark:text-slate-400">
              Don&apos;t have an account?{" "}
              <Link to="/signup" className="font-semibold text-indigo-700 hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;