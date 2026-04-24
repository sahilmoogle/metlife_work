import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import mainIcon from "../src/assets/images/main-icon.jpg";
import metlifeBg from "../src/assets/images/loginBackground.png";

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
  const { t, i18n } = useTranslation();

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
    `h-12 w-full rounded-xl border bg-white pl-11 pr-4 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-volt-borderSoft dark:bg-volt-card/85 dark:text-volt-text dark:placeholder:text-volt-muted2 dark:focus:ring-indigo-500/15 ${
      hasError ? "border-rose-300 focus:border-rose-400 focus:ring-rose-400/15" : "border-gray-200"
    }`;

  return (
    <div className="h-screen overflow-hidden bg-white dark:bg-volt-bg0">
      <div className="mx-auto grid h-full max-w-[1600px] grid-cols-1 lg:grid-cols-2">
        {/* Marketing panel */}
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

        {/* Signup panel */}
        <section className="app-dark-main-fill relative flex min-h-0 w-full flex-col bg-gradient-to-b from-slate-50 to-white px-6 py-6 sm:px-10 lg:px-14 xl:px-20 dark:from-transparent dark:to-transparent">
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

          <div className="mx-auto flex min-h-0 w-full max-w-[460px] flex-1 flex-col justify-center py-6">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-200 dark:bg-volt-panel dark:ring-volt-borderSoft">
                <img src={mainIcon} alt="" className="h-10 w-10 object-contain" />
              </div>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                {t("auth.signup.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-volt-muted">
                Create your {t("brand.name")} account to continue
              </p>
            </div>

            <div className="app-surface-card mt-6 p-5 sm:p-6">
              <form onSubmit={onSubmit} className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="md:col-span-1">
                  <label className="mb-2 block text-xs font-semibold text-gray-700 dark:text-volt-text">
                    {t("auth.fields.fullName")}
                  </label>
                  <div className="relative">
                    <UserIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-indigo-500/80" />
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
                    <p className="mt-2 text-xs text-rose-600 dark:text-rose-200">{fieldErrors.fullName}</p>
                  ) : null}
                </div>

                <div className="md:col-span-1">
                  <label className="mb-2 block text-xs font-semibold text-gray-700 dark:text-volt-text">
                    {t("auth.fields.email")}
                  </label>
                  <div className="relative">
                    <MailIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-indigo-500/80" />
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
                    <p className="mt-2 text-xs text-rose-600 dark:text-rose-200">{fieldErrors.email}</p>
                  ) : null}
                </div>

                <div className="md:col-span-1">
                  <label className="mb-2 block text-xs font-semibold text-gray-700 dark:text-volt-text">
                    {t("auth.fields.password")}
                  </label>
                  <div className="relative">
                    <LockIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-indigo-500/80" />
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
                    <p className="mt-2 text-xs text-rose-600 dark:text-rose-200">{fieldErrors.password}</p>
                  ) : (
                    <p className="mt-2 text-[11px] text-gray-400 dark:text-volt-muted2">
                      {t("auth.hints.passwordMin", { min: 8 })}
                    </p>
                  )}
                </div>

                <div className="md:col-span-1">
                  <label className="mb-2 block text-xs font-semibold text-gray-700 dark:text-volt-text">
                    {t("auth.fields.confirmPassword")}
                  </label>
                  <div className="relative">
                    <LockIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-indigo-500/80" />
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
                    <p className="mt-2 text-xs text-rose-600 dark:text-rose-200">{fieldErrors.confirmPassword}</p>
                  ) : null}
                </div>

                {error ? (
                  <p className="md:col-span-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="md:col-span-2 mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4c27ff] via-[#3b1fe8] to-[#2a20b8] text-sm font-semibold text-white shadow-[0_12px_30px_rgba(59,31,232,0.32)] transition hover:brightness-[1.05] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
                >
                  {isSubmitting ? t("auth.signup.creating") : t("auth.signup.cta")}
                </button>
              </form>
            </div>

            <p className="mt-6 text-center text-sm text-gray-500 dark:text-volt-muted2">
              {t("signup.haveAccount")}{" "}
              <Link
                to="/login"
                className="font-semibold text-indigo-700 underline-offset-4 hover:text-indigo-800 hover:underline dark:text-indigo-300 dark:hover:text-indigo-200"
              >
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

