import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import mainIcon from "../src/assets/images/main-icon.jpg";
import lightIcon from "../src/assets/images/light.jpg";
import userIcon from "../src/assets/images/user.jpg";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  BarChart3,
  Users,
  Workflow,
  ClipboardCheck,
  Settings
} from "lucide-react";



const navItems = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "leads", path: "/leads", icon: Users },
  { key: "campaigns", path: "/campaigns", icon: Workflow },
  { key: "reviews", path: "/reviews", icon: ClipboardCheck },
  { key: "analytics", path: "/analytics", icon: BarChart3 },
  { key: "settings", path: "/settings", icon: Settings },
];
const pageMeta = {
  "/dashboard": {
    titleKey: "page.dashboard.title",
    subtitleKey: "page.dashboard.subtitle",
  },
  "/leads": {
    titleKey: "page.leads.title",
    subtitleKey: "page.leads.subtitle",
  },
  "/campaigns": {
    titleKey: "page.campaigns.title",
    subtitleKey: "page.campaigns.subtitle",
  },
  "/analytics": {
    titleKey: "page.analytics.title",
    subtitleKey: "page.analytics.subtitle",
  },
  "/settings": {
    titleKey: "page.settings.title",
    subtitleKey: "page.settings.subtitle",
  },
};

const AppLayout = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [isDark, setIsDark] = useState(() => {
    try {
      return window.localStorage.getItem("theme") === "dark";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    try {
      window.localStorage.setItem("theme", isDark ? "dark" : "light");
    } catch {
      // ignore
    }
  }, [isDark]);

  const meta = pageMeta[location.pathname] ?? {
    titleKey: "page.leadDetail.title",
    subtitleKey: "page.leadDetail.subtitle",
  };

  return (
    <div className="min-h-screen bg-[#f6f8fc] p-3 sm:p-4 dark:bg-slate-950">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1500px] overflow-hidden rounded-xl bg-white shadow-sm dark:bg-slate-900 dark:ring-1 dark:ring-white/10">
        <aside className="hidden w-[255px] border-r border-gray-100 bg-white p-4 lg:block dark:border-white/10 dark:bg-slate-900">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-700">
              <img src={mainIcon} alt="icon" className="w-8 h-8" />            </div>
            <div>
              <h1 className="text-sm font-bold text-indigo-700">{t("brand.name")}</h1>
              <p className="text-[11px] text-gray-400 dark:text-slate-400">{t("brand.tagline")}</p>
            </div>
          </div>
          <nav className="space-y-2 text-sm">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={`${item.key}-${item.path}`}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 transition ${isActive
                      ? "bg-indigo-50 font-medium text-indigo-700"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {t(`nav.${item.key}`)}
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 p-4 sm:p-6">
          <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[#004EB2]">
                {t(meta.titleKey)}
              </h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">{t(meta.subtitleKey)}</p>
            </div>
            <div className="flex items-center gap-3">

              <div className="rounded-md border border-indigo-200 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => i18n.changeLanguage("en")}
                  className={`rounded px-2 py-1 ${
                    i18n.language === "en"
                      ? "bg-indigo-600 text-white"
                      : "text-gray-500 hover:bg-indigo-50 dark:text-slate-300 dark:hover:bg-white/10"
                  }`}
                >
                  {t("language.en")}
                </button>
                <button
                  type="button"
                  onClick={() => i18n.changeLanguage("jp")}
                  className={`rounded px-2 py-1 ${
                    i18n.language === "jp"
                      ? "bg-indigo-600 text-white"
                      : "text-gray-500 hover:bg-indigo-50 dark:text-slate-300 dark:hover:bg-white/10"
                  }`}
                >
                  {t("language.jp")}
                </button>

              </div>
              <button
                type="button"
                onClick={() => setIsDark((v) => !v)}
                className="rounded-md ring-1 ring-transparent transition hover:ring-indigo-200 dark:hover:ring-white/10"
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                title={isDark ? "Light mode" : "Dark mode"}
              >
                <img src={lightIcon} alt="icon" />
              </button>
              <img src={userIcon} alt="icon" className="w-10 h-10" />
              <div className="hidden items-center gap-2  bg-gray-10 px-3 py-1.5 sm:flex">
                {/* <div className="h-8 w-8 rounded-full bg-indigo-600" /> */}

                <div>
                  <p className="text-xs font-medium text-gray-800">
                    {user?.name || "Authenticated User"}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {user?.email || "user@domain.com"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={logout}
                className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-indigo-300 hover:text-indigo-700 dark:border-white/10 dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white"
              >
                {t("common.logout")}
              </button>
            </div>
          </header>

          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
