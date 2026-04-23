import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
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

const UserIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Z"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M4.5 20a7.5 7.5 0 0 1 15 0"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
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

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const validate = ({ t, fullName, email, password, confirmPassword }) => {
  const errors = {};
  const name = fullName.trim();
  const e = email.trim();

  if (!name) errors.fullName = t("auth.validation.fullNameRequired");
  if (!e) errors.email = t("auth.validation.emailRequired");
  else if (!isValidEmail(e)) errors.email = t("auth.validation.emailInvalid");

  if (!password) errors.password = t("auth.validation.passwordRequired");
  else if (password.length < 8) errors.password = t("auth.validation.passwordMin", { min: 8 });

  if (!confirmPassword) errors.confirmPassword = t("auth.validation.confirmPasswordRequired");
  else if (confirmPassword !== password) errors.confirmPassword = t("auth.validation.passwordMismatch");

  return errors;
};

const Signup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { register } = useAuth();
  const { t } = useTranslation();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    const errs = validate({ t, fullName, email, password, confirmPassword });
    return Object.keys(errs).length === 0 && !isSubmitting;
  }, [confirmPassword, email, fullName, isSubmitting, password, t]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const errs = validate({ t, fullName, email, password, confirmPassword });
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setIsSubmitting(true);
    try {
      await register({ fullName: fullName.trim(), email: email.trim(), password });
      const destination = location.state?.from || "/dashboard";
      navigate(destination, { replace: true });
    } catch (submitError) {
      setError(submitError.message || t("auth.signup.failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

const inputClass = (hasError) =>
  `h-11 w-full rounded-full border bg-white pl-11 pr-4 text-sm text-gray-700 outline-none transition focus:ring-2 dark:border-volt-borderSoft dark:bg-volt-panel dark:text-volt-text dark:focus:ring-indigo-500/20 ${
      hasError
        ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
        : "border-gray-200 focus:border-indigo-500 focus:ring-indigo-100"
    }`;

  return (
    <div className="min-h-screen bg-white dark:bg-gradient-to-b dark:from-volt-bg1 dark:via-volt-bg0 dark:to-volt-bg0">
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
            <div className="w-full max-w-[520px] text-center">
              <h2 className="text-3xl font-semibold">Create your account</h2>
              <p className="mt-2 text-sm text-white/80">
                Start nurturing leads with secure access and analytics.
              </p>
              <div className="mx-auto mt-10 aspect-[4/3] w-full max-w-[520px] overflow-hidden rounded-3xl bg-white/10 ring-1 ring-white/20">
                <div className="h-full w-full bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.20),transparent_50%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.18),transparent_55%)]" />
              </div>
            </div>
          </div>
        </section>

        <section className="flex w-full flex-col bg-white px-6 py-8 sm:px-10 lg:w-1/2 lg:px-16 dark:bg-volt-bg1">
          <header className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-lg font-bold text-indigo-700">
              LN
            </div>
            <div>
              <h1 className="text-base font-bold text-indigo-700">{t("brand.name")}</h1>
              <p className="text-xs text-gray-500 dark:text-volt-muted">{t("brand.tagline")}</p>
            </div>
          </header>

          <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center">
            <h3 className="text-sm font-medium text-gray-600 dark:text-volt-muted">{t("auth.signup.title")}</h3>
            <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
              <span className="text-indigo-700">{t("brand.name")}</span>
            </p>

            <form onSubmit={onSubmit} className="mt-8">
              <label className="mb-2 block text-xs font-medium text-gray-600 dark:text-volt-muted">{t("auth.fields.fullName")}</label>
              <div className="relative mb-1">
                <UserIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500/70" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t("auth.placeholders.fullName")}
                  autoComplete="name"
                  className={inputClass(Boolean(fieldErrors.fullName))}
                />
              </div>
              {fieldErrors.fullName ? (
                <p className="mb-3 ml-4 text-xs text-rose-600">{fieldErrors.fullName}</p>
              ) : (
                <div className="mb-3" />
              )}

              <label className="mb-2 block text-xs font-medium text-gray-600 dark:text-volt-muted">{t("auth.fields.email")}</label>
              <div className="relative mb-1">
                <MailIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500/70" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.placeholders.email")}
                  autoComplete="email"
                  className={inputClass(Boolean(fieldErrors.email))}
                />
              </div>
              {fieldErrors.email ? (
                <p className="mb-3 ml-4 text-xs text-rose-600">{fieldErrors.email}</p>
              ) : (
                <div className="mb-3" />
              )}

              <label className="mb-2 block text-xs font-medium text-gray-600 dark:text-volt-muted">{t("auth.fields.password")}</label>
              <div className="relative mb-1">
                <LockIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500/70" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.placeholders.password")}
                  autoComplete="new-password"
                  className={inputClass(Boolean(fieldErrors.password))}
                />
              </div>
              {fieldErrors.password ? (
                <p className="mb-3 ml-4 text-xs text-rose-600">{fieldErrors.password}</p>
              ) : (
                <p className="mb-3 ml-4 text-[11px] text-gray-400 dark:text-volt-muted2">{t("auth.hints.passwordMin", { min: 8 })}</p>
              )}

              <label className="mb-2 block text-xs font-medium text-gray-600 dark:text-volt-muted">{t("auth.fields.confirmPassword")}</label>
              <div className="relative mb-1">
                <LockIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500/70" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("auth.placeholders.confirmPassword")}
                  autoComplete="new-password"
                  className={inputClass(Boolean(fieldErrors.confirmPassword))}
                />
              </div>
              {fieldErrors.confirmPassword ? (
                <p className="mb-3 ml-4 text-xs text-rose-600">{fieldErrors.confirmPassword}</p>
              ) : (
                <div className="mb-3" />
              )}

              {error ? <p className="mb-3 text-sm text-red-500">{error}</p> : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-2 h-11 w-full rounded-full bg-gradient-to-r from-[#3b2fd6] to-[#2a1bb3] text-sm font-semibold text-white shadow-[0_10px_25px_rgba(59,47,214,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? t("auth.signup.creating") : t("auth.signup.cta")}
              </button>
            </form>

            <p className="mt-10 text-center text-xs text-gray-500 dark:text-volt-muted2">
              {t("signup.haveAccount")}{" "}
              <Link to="/login" className="font-semibold text-indigo-700 hover:underline">
                {t("signup.login")}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Signup;

