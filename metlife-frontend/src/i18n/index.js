import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      brand: {
        name: "Lead Nurturing",
        tagline: "Your Intelligence Platform",
      },
      nav: {
        dashboard: "Dashboard",
        leads: "Leads",
        campaigns: "Work Flow Engine",
        reviews: "HITL Reviews",
        analytics: "Analytics",
        settings: "Admin - RBAC",
      },
      page: {
        dashboard: {
          title: "Dashboard",
          subtitle: "Real-time overview across 7 scenarios",
        },
        leads: {
          title: "All Leads",
          subtitle: "Real-time overview across 7 scenarios",
        },
        campaigns: {
          title: "All Agents",
          subtitle: "2 of 6 agents complete - 33% progress - Hybrid Mode",
        },
        analytics: {
          title: "Analytics",
          subtitle: "Performance and conversion intelligence",
        },
        settings: {
          title: "Admin - RBAC",
          subtitle: "Access control and administration",
        },
        leadDetail: {
          title: "Lead Detail",
          subtitle: "Lead profile and activity timeline",
        },
      },
      common: {
        logout: "Logout",
        retry: "Retry",
        close: "Close",
        cancel: "Cancel",
        save: "Save",
        refresh: "Refresh",
        search: "Search",
        export: "Export",
        perPage: "Per page",
        records: "records",
        noItems: "No items",
        loading: "Loading…",
      },
      language: {
        en: "EN",
        jp: "JP",
      },
      reviews: {
        title: "HITL Review Queue",
        subtitle: "Human-in-the-loop gates awaiting review",
        pending: "Pending",
        resolved: "Resolved",
        filterByGate: "Filter by Gate",
        allGates: "All Gates",
        gates: {
          g1: "G1 · Compliance",
          g2: "G2 · Persona",
          g3: "G3 · Campaign",
          g4: "G4 · Sales Handoff",
          g5: "G5 · Score Override",
        },
        showing: "Showing {{from}}–{{to}} of {{total}} records",
        noGateItems: "No {{gate}} items in the queue right now.",
        resolvedNotExposed: "Resolved queue is not exposed by the backend yet.",
        nothingInQueue: "Nothing in this queue right now.",
      },
      settings: {
        accessControlTitle: "Admin - Access Control",
        accessControlSubtitle: "RBAC permissions for workflow execution, HITL approvals, and lead management",
        permissionsMatrixTitle: "User Permissions Matrix",
        addUser: "+ Add User",
        userDetail: "User detail",
        editUser: "Edit user",
        userPermissions: "User permissions",
        createStaffAccount: "Create a MetLife operational staff account.",
      },
      leads: {
        all: "All",
        active: "Active",
        hitl: "HITL",
        converted: "Converted",
        dormant: "Dormant",
        rowsPerPage: "Rows per page",
        showingEntries: "Showing 1 to {{to}} of {{total}} Entries",
      },
      login: {
        email: "Email",
        password: "Password",
        loginNow: "Login Now →",
        loggingIn: "Logging in...",
      },
    },
  },
  jp: {
    translation: {
      brand: {
        name: "リード育成",
        tagline: "インテリジェンス・プラットフォーム",
      },
      nav: {
        dashboard: "ダッシュボード",
        leads: "リード",
        campaigns: "ワークフローエンジン",
        reviews: "HITL レビュー",
        analytics: "分析",
        settings: "管理 - RBAC",
      },
      page: {
        dashboard: {
          title: "ダッシュボード",
          subtitle: "7つのシナリオのリアルタイム概要",
        },
        leads: {
          title: "全リード",
          subtitle: "7つのシナリオのリアルタイム概要",
        },
        campaigns: {
          title: "全エージェント",
          subtitle: "6件中2件完了 - 進捗33% - ハイブリッドモード",
        },
        analytics: {
          title: "分析",
          subtitle: "パフォーマンスとコンバージョンのインサイト",
        },
        settings: {
          title: "管理 - RBAC",
          subtitle: "アクセス制御と管理",
        },
        leadDetail: {
          title: "リード詳細",
          subtitle: "リードのプロフィールとアクティビティ履歴",
        },
      },
      common: {
        logout: "ログアウト",
        retry: "再試行",
        close: "閉じる",
        cancel: "キャンセル",
        save: "保存",
        refresh: "更新",
        search: "検索",
        export: "エクスポート",
        perPage: "表示件数",
        records: "件",
        noItems: "項目はありません",
        loading: "読み込み中…",
      },
      language: {
        en: "EN",
        jp: "JP",
      },
      reviews: {
        title: "HITL レビューキュー",
        subtitle: "レビュー待ちのヒューマン・イン・ザ・ループゲート",
        pending: "保留",
        resolved: "解決済み",
        filterByGate: "ゲートで絞り込み",
        allGates: "全ゲート",
        gates: {
          g1: "G1 · コンプライアンス",
          g2: "G2 · ペルソナ",
          g3: "G3 · キャンペーン",
          g4: "G4 · 営業引き継ぎ",
          g5: "G5 · スコア上書き",
        },
        showing: "{{from}}–{{to}} / {{total}}件を表示",
        noGateItems: "現在、{{gate}} の項目はありません。",
        resolvedNotExposed: "解決済みキューはまだバックエンドで提供されていません。",
        nothingInQueue: "現在キューに項目はありません。",
      },
      settings: {
        accessControlTitle: "管理 - アクセス制御",
        accessControlSubtitle: "ワークフロー実行、HITL 承認、リード管理の RBAC 権限",
        permissionsMatrixTitle: "ユーザー権限マトリクス",
        addUser: "+ ユーザー追加",
        userDetail: "ユーザー詳細",
        editUser: "ユーザー編集",
        userPermissions: "ユーザー権限",
        createStaffAccount: "MetLife 運用スタッフアカウントを作成します。",
      },
      leads: {
        all: "すべて",
        active: "アクティブ",
        hitl: "HITL",
        converted: "成約",
        dormant: "休眠",
        rowsPerPage: "表示行数",
        showingEntries: "{{total}}件中 1 〜 {{to}}件を表示",
      },
      login: {
        email: "メール",
        password: "パスワード",
        loginNow: "ログイン →",
        loggingIn: "ログイン中...",
      },
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: (() => {
    try {
      return window.localStorage.getItem("lang") || "en";
    } catch {
      return "en";
    }
  })(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  try {
    window.localStorage.setItem("lang", lng);
  } catch {
    // ignore
  }
});

export default i18n;
