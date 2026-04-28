import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import mainIcon from "../src/assets/images/main-icon.jpg";
import userIcon from "../src/assets/images/user.jpg";
import { useTranslation } from "react-i18next";
import sidebarPhoto from "../src/assets/images/sidebar-japan-art.png";

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
  ChevronDown,
  Sun,
  Moon,
  User,
  HelpCircle,
  LogOut,
  Bell,
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
  "/reviews": {
    titleKey: "reviews.title",
    subtitleKey: "reviews.subtitle",
  },
  "/analytics": {
    titleKey: "page.analytics.title",
    subtitleKey: "page.analytics.subtitle",
  },
  "/settings": {
    titleKey: "page.settings.title",
    subtitleKey: "settings.accessControlSubtitle",
  },
  "/profile": {
    titleKey: "page.profile.title",
    subtitleKey: "page.profile.subtitle",
  },
};

const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const userMenuRef = useRef(null);
  const notificationsRef = useRef(null);
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
    setUserMenuOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!userMenuOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setUserMenuOpen(false);
    };

    const handlePointerDown = (event) => {
      const root = userMenuRef.current;
      if (!root) return;
      if (!root.contains(event.target)) setUserMenuOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    if (!notificationsOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };

    const handlePointerDown = (event) => {
      const root = notificationsRef.current;
      if (!root) return;
      if (!root.contains(event.target)) setNotificationsOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [notificationsOpen]);

  const meta = (() => {
    if (pageMeta[location.pathname]) return pageMeta[location.pathname];
    if (location.pathname.startsWith("/leads/")) {
      return { titleKey: "page.leadDetail.title", subtitleKey: "page.leadDetail.subtitle" };
    }
    if (location.pathname.startsWith("/reviews/")) {
      return { titleKey: "reviews.title", subtitleKey: "reviews.subtitle" };
    }
    return { titleKey: "page.leadDetail.title", subtitleKey: "page.leadDetail.subtitle" };
  })();

  const displayName = user?.name || "Takashi Yamamoto";
  const displayEmail = user?.email || "takashi.yamamoto@metlife.co.jp";
  const notifications = [
    {
      id: "n1",
      title: "Campaign review requested",
      message: "A new campaign needs your approval.",
      time: "2m ago",
      unread: true,
    },
    {
      id: "n2",
      title: "Lead assigned to you",
      message: "You have a new lead in Japan region.",
      time: "1h ago",
      unread: true,
    },
    {
      id: "n3",
      title: "Weekly analytics ready",
      message: "Your performance summary is available.",
      time: "Yesterday",
      unread: false,
    },
  ];
  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <div
      className="h-screen overflow-hidden bg-[#f3f6fb] dark:bg-volt-bg0"
    >
      <div
        className="flex h-screen w-full overflow-hidden bg-white shadow-sm dark:bg-volt-bg1 dark:shadow-[0_18px_60px_rgba(0,0,0,0.55)] dark:ring-1 dark:ring-volt-borderSoft"
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

        {/* Sidebar — photo layer + gradient so the skyline stays visible and sharp */}
        <aside
          className={`fixed left-0 top-0 z-50 h-full w-[280px] overflow-x-hidden overflow-y-hidden border-r border-white/10 bg-[#0b1830] text-white transition-[transform,width] duration-200 lg:static lg:z-auto lg:h-full lg:flex-none lg:translate-x-0 lg:block dark:border-volt-borderSoft dark:text-volt-text ${sidebarCollapsed ? "lg:w-[84px]" : "lg:w-[255px]"
            } ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        >
          <div className="pointer-events-none absolute inset-0 z-0">
            <img
              src={sidebarPhoto}
              alt=""
              className="h-full w-full object-cover object-center dark:brightness-[0.95] dark:contrast-[1.06]"
              decoding="async"
              fetchPriority="high"
            />
          </div>
          <div
            className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-[#050f1f]/78 from-0% via-[#050f1f]/38 via-[40%] to-transparent to-[100%] dark:from-[#020617]/56 dark:via-[#020617]/18 dark:to-transparent"
            aria-hidden
          />
          <div className="relative z-10 flex h-full min-h-0 flex-col overflow-y-auto p-4 [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">
            <div className={`mb-8 ${sidebarCollapsed ? "lg:flex lg:flex-col lg:items-center lg:gap-2" : "flex items-center gap-3"}`}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-700">
                <img src={mainIcon} alt="icon" className="w-8 h-8" />
              </div>

              {!sidebarCollapsed ? (
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-semibold text-white dark:text-volt-text">{t("brand.name")}</h1>
                  <p className="truncate text-[11px] text-white/70 dark:text-volt-muted">{t("brand.tagline")}</p>
                </div>
              ) : null}

              {/* Mobile close */}
              <button
                type="button"
                className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/15 hover:text-white lg:hidden dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
                aria-label="Close sidebar"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>

              {/* Desktop collapse/expand */}
              <button
                type="button"
                className={`hidden h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/15 hover:text-white lg:inline-flex dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted ${sidebarCollapsed ? "lg:ml-0" : "ml-auto"
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
                      `flex items-center gap-3 rounded-xl px-3 py-2 transition ${sidebarCollapsed ? "lg:justify-center" : ""
                      } ${isActive
                        ? "bg-white/15 font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_28px_rgba(124,158,255,0.22)] ring-1 ring-white/20 dark:bg-white/12 dark:text-volt-text dark:ring-[rgba(124,158,255,0.35)]"
                        : "text-white/80 hover:bg-white/10 hover:text-white dark:text-volt-muted dark:hover:bg-white/10 dark:hover:text-volt-text"
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
          </div>
        </aside>

        <main className="flex-1 flex flex-col">
          <header className="sticky top-0 z-20 flex flex-none items-start justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3 shadow-sm sm:px-6 dark:border-volt-borderSoft/70 dark:bg-[linear-gradient(165deg,rgba(22,40,78,0.94),rgba(11,22,46,0.9))] dark:backdrop-blur-md dark:shadow-[0_18px_55px_rgba(0,0,0,0.58)]">
            <div className="flex min-w-0 items-start gap-3">
              <button
                type="button"
                className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-indigo-200 hover:text-indigo-700 lg:hidden dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
                aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                onClick={() => setSidebarOpen((v) => !v)}
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-[#004EB2] dark:text-volt-text">
                  {t(meta.titleKey)}
                </h2>
                <p className="text-xs text-gray-500 dark:text-volt-muted">{t(meta.subtitleKey)}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              <div className="relative inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-1.5 text-xs shadow-sm sm:px-3 dark:border-volt-borderSoft/80 dark:bg-[linear-gradient(180deg,rgba(20,38,74,0.9),rgba(12,22,46,0.88))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-indigo-500/80" />
                <select
                  value={i18n.language}
                  onChange={(e) => i18n.changeLanguage(e.target.value)}
                  className="cursor-pointer appearance-none bg-transparent pr-5 text-xs font-semibold text-gray-900 outline-none sm:pr-6 dark:text-white"
                  aria-label="Language"
                >
                  <option value="en">{t("language.en")}</option>
                  <option value="jp">{t("language.jp")}</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-gray-500 dark:text-volt-muted" />
              </div>
              <button
                type="button"
                onClick={() => setIsDark((v) => !v)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:border-indigo-200 hover:text-[#004EB2] dark:border-volt-borderSoft/80 dark:bg-[linear-gradient(180deg,rgba(20,38,74,0.9),rgba(12,22,46,0.88))] dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                title={isDark ? "Light mode" : "Dark mode"}
              >
                {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
              </button>

              <div className="relative" ref={notificationsRef}>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((v) => !v)}
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:border-indigo-200 hover:text-[#004EB2] dark:border-volt-borderSoft/80 dark:bg-[linear-gradient(180deg,rgba(20,38,74,0.9),rgba(12,22,46,0.88))] dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                  aria-label="Notifications"
                  aria-haspopup="menu"
                  aria-expanded={notificationsOpen}
                  title="Notifications"
                >
                  <Bell className="h-4.5 w-4.5" />
                  {unreadCount ? (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-volt-panel">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  ) : null}
                </button>

                {notificationsOpen ? (
                  <div
                    role="menu"
                    aria-label="Notifications"
                    className="absolute right-0 top-[calc(100%+10px)] z-[120] w-[min(340px,calc(100vw-24px))] max-h-[calc(100vh-96px)] overflow-auto rounded-2xl border border-gray-200 bg-white shadow-[0_20px_55px_rgba(0,0,0,0.18)] dark:border-volt-borderSoft dark:bg-volt-panel dark:shadow-[0_20px_55px_rgba(0,0,0,0.55)]"
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-volt-borderSoft/70">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-volt-text">Notifications</p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-volt-muted">
                          {unreadCount ? `${unreadCount} unread` : "You're all caught up"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700 dark:border-volt-borderSoft/80 dark:bg-volt-card/50 dark:text-volt-text dark:hover:bg-white/10"
                        onClick={() => setNotificationsOpen(false)}
                      >
                        Close
                      </button>
                    </div>

                    <div className="p-2">
                      {notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          role="menuitem"
                          onClick={() => setNotificationsOpen(false)}
                          className="flex w-full items-start gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-gray-50 dark:hover:bg-white/10"
                        >
                          <span
                            className={`mt-2 inline-flex h-2.5 w-2.5 flex-none rounded-full ${n.unread ? "bg-indigo-500" : "bg-gray-300 dark:bg-white/20"
                              }`}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-gray-900 dark:text-volt-text">
                                {n.title}
                              </p>
                              <span className="flex-none text-[11px] text-gray-400 dark:text-volt-muted2">
                                {n.time}
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs text-gray-600 dark:text-volt-muted">
                              {n.message}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 dark:border-volt-borderSoft/70">
                      <button
                        type="button"
                        className="text-xs font-semibold text-gray-600 transition hover:text-indigo-700 dark:text-volt-muted dark:hover:text-volt-text"
                        onClick={() => setNotificationsOpen(false)}
                      >
                        Mark all as read
                      </button>
                      <button
                        type="button"
                        className="rounded-xl bg-gradient-to-r from-[#4c27ff] via-[#3b1fe8] to-[#2a20b8] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-[1.04]"
                        onClick={() => {
                          setNotificationsOpen(false);
                          navigate("/dashboard");
                        }}
                      >
                        View all
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white p-1 text-left text-xs shadow-sm transition hover:border-indigo-200 sm:px-2 sm:py-1.5 dark:border-volt-borderSoft/80 dark:bg-[linear-gradient(180deg,rgba(20,38,74,0.9),rgba(12,22,46,0.88))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                >
                  <img
                    src={userIcon}
                    alt="User avatar"
                    className="h-9 w-9 rounded-full object-cover ring-1 ring-gray-200 dark:ring-volt-borderSoft"
                  />
                  <div className="hidden min-w-0 sm:block">
                    <p className="truncate text-xs font-medium text-gray-800 dark:text-volt-text">
                      {displayName}
                    </p>
                    <p className="truncate text-[11px] text-gray-400 dark:text-volt-muted">
                      {displayEmail}
                    </p>
                  </div>
                  <ChevronDown className="hidden h-4 w-4 text-gray-500 sm:block dark:text-volt-muted" />
                </button>

                {userMenuOpen ? (
                  <div
                    role="menu"
                    aria-label="User menu"
                    className="absolute right-0 top-[calc(100%+10px)] z-[120] w-[min(280px,calc(100vw-24px))] max-h-[calc(100vh-96px)] overflow-auto rounded-2xl border border-gray-200 bg-white shadow-[0_20px_55px_rgba(0,0,0,0.18)] dark:border-volt-borderSoft dark:bg-volt-panel dark:shadow-[0_20px_55px_rgba(0,0,0,0.55)]"
                  >
                    <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-volt-borderSoft/70">
                      <img
                        src={userIcon}
                        alt="User avatar"
                        className="h-11 w-11 rounded-full object-cover ring-1 ring-gray-200 dark:ring-volt-borderSoft"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-volt-text">
                          {displayName}
                        </p>
                        <p className="truncate text-xs text-gray-500 dark:text-volt-muted">
                          {displayEmail}
                        </p>
                      </div>
                    </div>

                    <div className="p-2">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => navigate("/profile")}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 hover:text-gray-900 dark:text-volt-text dark:hover:bg-white/10"
                      >
                        <User className="h-4 w-4" />
                        Profile
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => navigate("/settings")}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 hover:text-gray-900 dark:text-volt-text dark:hover:bg-white/10"
                      >
                        <Settings className="h-4 w-4" />
                        Account settings
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => window.open("mailto:support@metlife.co.jp", "_blank", "noopener,noreferrer")}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 hover:text-gray-900 dark:text-volt-text dark:hover:bg-white/10"
                      >
                        <HelpCircle className="h-4 w-4" />
                        Support
                      </button>

                      <div className="my-2 h-px bg-gray-100 dark:bg-volt-borderSoft/70" />

                      <button
                        type="button"
                        role="menuitem"
                        onClick={logout}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                      >
                        <LogOut className="h-4 w-4" />
                        {t("common.logout")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <div className="app-dark-main-fill flex-1 overflow-y-auto bg-transparent p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
