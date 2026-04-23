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
  Settings,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem("sidebar_collapsed") === "1";
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

  useEffect(() => {
    try {
      window.localStorage.setItem("sidebar_collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const meta = pageMeta[location.pathname] ?? {
    titleKey: "page.leadDetail.title",
    subtitleKey: "page.leadDetail.subtitle",
  };

  return (
    <div
      className="h-screen overflow-hidden bg-[#f6f8fc] dark:bg-gradient-to-b dark:from-volt-bg1 dark:via-volt-bg0 dark:to-volt-bg0"
    >
      <div
        className="flex h-screen w-full overflow-hidden bg-white shadow-sm dark:bg-volt-panel dark:shadow-volt-card dark:ring-1 dark:ring-volt-borderSoft"
      >
        {/* Mobile overlay */}
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close sidebar"
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        {/* Sidebar */}
        <aside
          className={`fixed left-0 top-0 z-50 h-full w-[280px] overflow-y-auto border-r border-gray-100 bg-white p-4 transition-[transform,width] duration-200 lg:static lg:z-auto lg:h-full lg:flex-none lg:translate-x-0 lg:overflow-y-auto lg:block dark:border-volt-borderSoft dark:bg-volt-panel ${
            sidebarCollapsed ? "lg:w-[84px]" : "lg:w-[255px]"
          } ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        >
          <div className={`mb-8 ${sidebarCollapsed ? "lg:flex lg:flex-col lg:items-center lg:gap-2" : "flex items-center gap-3"}`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-700">
              <img src={mainIcon} alt="icon" className="w-8 h-8" />
            </div>

            {!sidebarCollapsed ? (
              <div className="min-w-0">
                <h1 className="truncate text-sm font-bold text-indigo-700">{t("brand.name")}</h1>
                <p className="truncate text-[11px] text-gray-400 dark:text-volt-muted">{t("brand.tagline")}</p>
              </div>
            ) : null}

            {/* Mobile close */}
            <button
              type="button"
              className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-indigo-200 hover:text-indigo-700 lg:hidden dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
              aria-label="Close sidebar"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>

            {/* Desktop collapse/expand */}
            <button
              type="button"
              className={`hidden h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-indigo-200 hover:text-indigo-700 lg:inline-flex dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted ${
                sidebarCollapsed ? "lg:ml-0" : "ml-auto"
              }`}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setSidebarCollapsed((v) => !v)}
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
          <nav className="space-y-2 text-sm">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={`${item.key}-${item.path}`}
                  to={item.path}
                  title={sidebarCollapsed ? t(`nav.${item.key}`, { defaultValue: item.key }) : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 transition ${
                      sidebarCollapsed ? "lg:justify-center" : ""
                    } ${isActive
                      ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-white/10 dark:text-volt-text"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-volt-muted dark:hover:bg-white/10 dark:hover:text-volt-text"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {!sidebarCollapsed ? (
                    <span className="truncate">{t(`nav.${item.key}`, { defaultValue: item.key })}</span>
                  ) : null}
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 flex flex-col">
          <header className="flex flex-none flex-wrap items-start justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3 shadow-sm dark:border-volt-borderSoft dark:bg-volt-panel dark:shadow-[0_10px_30px_rgba(7,4,26,0.45)] sm:px-6">
            <div>
              <button
                type="button"
                className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-indigo-200 hover:text-indigo-700 lg:hidden dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
                aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                onClick={() => setSidebarOpen((v) => !v)}
              >
                <Menu className="h-4 w-4" />
              </button>
              <h2 className="text-xl font-semibold text-[#004EB2] dark:text-volt-text">
                {t(meta.titleKey)}
              </h2>
              <p className="text-xs text-gray-500 dark:text-volt-muted">{t(meta.subtitleKey)}</p>
            </div>
            <div className="flex items-center gap-3">

              <div className="rounded-md border border-indigo-200 p-0.5 text-xs dark:border-volt-borderSoft dark:bg-white/5">
                <button
                  type="button"
                  onClick={() => i18n.changeLanguage("en")}
                  className={`rounded px-2 py-1 ${i18n.language === "en"
                    ? "bg-indigo-600 text-white"
                    : "text-gray-500 hover:bg-indigo-50 dark:text-volt-muted dark:hover:bg-white/10"
                    }`}
                >
                  {t("language.en")}
                </button>
                <button
                  type="button"
                  onClick={() => i18n.changeLanguage("jp")}
                  className={`rounded px-2 py-1 ${i18n.language === "jp"
                    ? "bg-indigo-600 text-white"
                    : "text-gray-500 hover:bg-indigo-50 dark:text-volt-muted dark:hover:bg-white/10"
                    }`}
                >
                  {t("language.jp")}
                </button>

              </div>
              <button
                type="button"
                onClick={() => setIsDark((v) => !v)}
                className="rounded-md ring-1 ring-transparent transition hover:ring-indigo-200 dark:hover:ring-volt-borderSoft"
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                title={isDark ? "Light mode" : "Dark mode"}
              >
                <img
                  alt="icon"
                  src="/src/assets/images/light.jpg"
                  className="rounded-full"
                />
              </button>
              <img src={userIcon} alt="icon" className="w-9 h-9 rounded-full" />              <div className="hidden items-center gap-2  bg-gray-10 px-3 py-1.5 sm:flex">
                {/* <div className="h-8 w-8 rounded-full bg-indigo-600" /> */}

                <div>
                  <p className="text-xs font-medium text-gray-800 dark:text-volt-text">
                    {user?.name || "Authenticated User"}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-volt-muted">
                    {user?.email || "user@domain.com"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={logout}
                className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-indigo-300 hover:text-indigo-700 dark:border-volt-borderSoft dark:text-volt-muted dark:hover:border-volt-border dark:hover:text-volt-text"
              >
                {t("common.logout")}
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
