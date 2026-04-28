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
          subtitle: "Batch workflows with auto-run agents & HITL pauses",
        },
        analytics: {
          title: "Analytics",
          subtitle: "Performance and conversion intelligence",
        },
        profile: {
          title: "Profile",
          subtitle: "Personal details, preferences, and security",
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
        prev: "Prev",
        next: "Next",
        perPage: "Per page",
        records: "records",
        noItems: "No items",
        loading: "Loading…",
        ready: "Ready",
        idle: "Idle",
        complete: "Complete",
        running: "Running…",
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
        detail: {
          fieldReviewStatus: "Review status",
          successApproved:
            "Approved — decision saved and the workflow will continue for this lead.",
          successEdited:
            "Saved — your edits were applied and the workflow will continue.",
          redirecting: "Returning to queue…",
        },
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
        subtitle: "Sign in",
        welcomeLine: "Welcome back",
        welcomeHint: "Enter your credentials to access the workspace.",
      },
      dashboard: {
        loading: "Loading dashboard…",
        failed: "Failed to load dashboard.",
        kpi: {
          totalLeads: "Total Leads",
          activeWorkflows: "Active Workflows",
          converted: "Converted",
          pendingHitl: "Pending HITL",
          pendingHitlCaption: "{{items}} review items · {{leads}} leads awaiting",
          allRecords: "All records",
          suppressed: "{{count}} suppressed",
          ofTotal: "{{pct}}% of total",
          ltTenthPct: "<0.1% of total",
        },
        funnel: {
          title: "Conversion Funnel",
          subtitle:
            "Percent bars use share of total leads. HITL uses unique leads with a pending review (queue may list more than one item per lead).",
          totalLeads: "Total Leads",
          activeProcessing: "Active / Processing",
          hitlQueue: "HITL queue",
          hitlQueueBar: "{{items}} items · {{leads}} leads",
          converted: "Converted",
          dormant: "Dormant",
        },
        scenarios: {
          title: "Scenario Distribution",
          subtitle: "All leads by scenario_id",
        },
        feed: {
          title: "Live Activity Feed",
          fromActiveNodes: "From active agent nodes",
          empty: "No active pipeline nodes with counts yet.",
          activePipeline: "Active pipeline",
          activeLeads: "{{count}} active leads",
        },
        scenarioLabels: {
          S1: "Young Prof",
          S2: "Life Event",
          S3: "Senior",
          S4: "Dormant",
          S5: "Buyer",
          S6: "F2F",
          S7: "W2C",
        },
      },
      campaigns: {
        title: "Workflow Orchestration",
        subtitle: "LangGraph batch execution • Auto-runs all agents • Pauses only at HITL gates",
        status: {
          complete: "✓ Complete",
          batchRunning: "Batch running",
          loading: "Loading…",
          ready: "Ready",
        },
        runButton: {
          complete: "Re-run",
          running: "Running…",
          runAll: "Run All Workflows",
          runningTitle:
            "Server batch job is in progress. Pausing mid-batch is not supported — graphs pause only at HITL gates.",
        },
        batch: {
          processing: "Batch Processing",
          leads: "leads",
          succeeded: "succeeded",
          awaitingHitl: "awaiting HITL",
          awaitingHitlScoped: "awaiting HITL (this batch)",
          awaitingHitlAll: "awaiting HITL (all batches)",
          remaining: "remaining",
          failed: "failed",
          // 
          hitlOrgWide: "Full pending queue (all batches): {{count}}",
          scopeSucceeded: "Successfully processed leads in this batch.",
          scopeAwaitingHitl:
            "Human reviews opened during this batch run (requires batch_id on the queue row).",
          scopeAwaitingHitlGlobal: "Everyone currently awaiting human review across all batches.",
          scopeRemaining: "Leads in this batch not processed yet.",
          scopeFailed: "Leads that failed in this batch run.",
        },
        scenarios: {
          subtitle:
            "Counts every lead in the database by scenario—not limited to the current batch.",
        },
        pipeline: {
          title: "Agent Execution Pipeline",
          subtitle:
            "Large figure: stage completions this batch (graph exits via SSE—not unique leads; A4+A5 share one tile). Subtext adds how many Active/Processing leads sit at that stage now (DB snapshot). Batch bar uses SSE batch_progress plus 1.2s polling; refreshes use the dashboard API on a timer and when SSE signals activity.",
          queueScopeNote:
            "“In queue” on agent tiles counts Active/Processing leads globally at that stage—not “remaining” in the batch bar.",
          hitlAwaiting: "{{count}} awaiting",
          succeeded: "Succeeded",
          idleCaption: "Idle",
          emDash: "—",
          completionsQueued: "Completions this batch · {{queued}} in queue",
          queuedOnly: "In queue: {{queued}}",
          stageMainHint:
            "Completions this batch: each graph node exit increments the count (not deduplicated per lead). A4 and A5 both roll into this card.",
          stageSubHint:
            "Queued in DB: Active/Processing leads whose current_agent_node maps to this stage.",
          hitlTileHintBatch:
            "Same scope as the amber legend when a batch is loaded—pending reviews tagged with this batch id.",
          hitlTileHintGlobal:
            "Same scope as the amber legend—entire pending queue when no batch filter applies.",
          batchSuccessLabel: "✓ Batch run OK",
          batchSuccessCaption:
            "Graph finished without error (may still await HITL). CRM converted (all leads in DB): {{crm}}",
          batchSuccessTitleHint:
            "Number of leads where this batch’s graph invocation returned without an exception — includes runs that stopped at HITL. Not the same as CRM conversion.",
          batchSuccessSubHint:
            "Compare to “CRM converted” from dashboard stats (subtitle). Large figure is batch success_count.",
        },
      },
      analytics: {
        title: "Analytics",
        subtitle: "Performance metrics across all 7 scenarios • {{range}}",
        noWeeklyData: "No weekly data yet.",
        weekly: {
          title: "Weekly Lead Progression",
          subtitle: "New leads, engaged, and converted per week",
          newLeads: "New Leads",
          engaged: "Engaged",
          converted: "Converted",
        },
        scenarioConversion: {
          title: "Conversion by Scenario",
          subtitle: "% of leads converted per scenario (cohort in range)",
          empty: "No scenario data.",
        },
        agentPerf: {
          title: "Agent Performance",
          subtitle: "Throughput (approximate counts from DB). Latency/success when instrumented.",
          agent: "Agent",
          processed: "Processed",
          avgLatency: "Avg Latency",
          success: "Success",
          empty: "No agent rows.",
        },
        emailPerf: {
          title: "Email Performance",
          subtitle: "Across all campaigns (selected window)",
          topPerforming: "Top performing (by scenario)",
          bestOpen: "· best open",
          bestClick: "· best click",
          notEnough: "Not enough email data to rank scenarios.",
          openSuffix: "% open",
          clickSuffix: "% click",
        },
        hitlGate: {
          title: "HITL Gate Stats",
          subtitle: "Approval metrics by gate",
          noReviews: "No reviews in window",
          reviewedAvg: "{{count}} reviewed · {{mins}}m avg",
          autoApproved: "AUTO-APPROVED (G1 · existing_asset)",
        },
        scoreDist: {
          title: "Lead Score Distribution",
          subtitle: "Non–opt-out leads · engagement_score",
          empty: "No scores.",
          below: "{{count}} leads below 0.40",
          above: "{{count}} leads above 0.70",
        },
        llm: {
          title: "LLM Token Usage",
          subtitle: "When billing hooks persist usage, values appear here",
          tokens: "tokens",
          totalMonthly: "Total monthly cost (tracked)",
          notPersisted: "LLM usage is not persisted in the database yet.",
        },
        ranges: {
          d30: "30 Days",
          d90: "90 Days",
          all: "All Time",
        },
      },
      signup: {
        title: "Sign up",
        subtitle: "Start nurturing leads with secure access and analytics.",
        haveAccount: "Already have an account?",
        login: "Login",
      },
      auth: {
        fields: {
          fullName: "Full name",
          email: "Email",
          password: "Password",
          confirmPassword: "Confirm password",
        },
        placeholders: {
          fullName: "Enter full name",
          email: "Enter email",
          password: "Create password",
          confirmPassword: "Confirm password",
        },
        hints: {
          passwordMin: "Must be at least {{min}} characters.",
        },
        validation: {
          fullNameRequired: "Full name is required.",
          emailRequired: "Email is required.",
          emailInvalid: "Enter a valid email address.",
          passwordRequired: "Password is required.",
          passwordMin: "Password must be at least {{min}} characters.",
          confirmPasswordRequired: "Please confirm your password.",
          passwordMismatch: "Passwords do not match.",
        },
        signup: {
          title: "Sign up for",
          cta: "Create Account →",
          creating: "Creating account...",
          failed: "Sign up failed. Please try again.",
        },
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
        profile: {
          title: "プロフィール",
          subtitle: "個人情報、設定、セキュリティ",
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
        prev: "前へ",
        next: "次へ",
        perPage: "表示件数",
        records: "件",
        noItems: "項目はありません",
        loading: "読み込み中…",
        ready: "準備完了",
        idle: "待機",
        complete: "完了",
        running: "実行中…",
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
        detail: {
          fieldReviewStatus: "レビュー状態",
          successApproved:
            "承認しました — 決定を保存し、このリードのワークフローを再開しました。",
          successEdited:
            "保存しました — 編集を反映し、ワークフローを再開しました。",
          redirecting: "キューに戻ります…",
        },
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
        subtitle: "サインイン",
        welcomeLine: "おかえりなさい",
        welcomeHint: "ワークスペースにアクセスするための認証情報を入力してください。",
      },
      dashboard: {
        loading: "ダッシュボードを読み込み中…",
        failed: "ダッシュボードの読み込みに失敗しました。",
        kpi: {
          totalLeads: "総リード数",
          activeWorkflows: "稼働中ワークフロー",
          converted: "成約",
          pendingHitl: "HITL 保留",
          pendingHitlCaption: "レビュー項目 {{items}} · 対象リード {{leads}}",
          allRecords: "全レコード",
          suppressed: "{{count}} 件抑制",
          ofTotal: "全体の {{pct}}%",
          ltTenthPct: "全体の <0.1%",
        },
        funnel: {
          title: "コンバージョンファネル",
          subtitle:
            "％は総リードに対する割合。HITL はレビュー待ちのユニークリード数（キュー行数はそれ以上の場合あり）。",
          totalLeads: "総リード",
          activeProcessing: "アクティブ / 処理中",
          hitlQueue: "HITL キュー",
          hitlQueueBar: "{{items}} 件 · リード {{leads}}",
          converted: "成約",
          dormant: "休眠",
        },
        scenarios: {
          title: "シナリオ分布",
          subtitle: "scenario_id 別の全リード",
        },
        feed: {
          title: "ライブアクティビティ",
          fromActiveNodes: "稼働中ノードより",
          empty: "まだアクティブノードの集計がありません。",
          activePipeline: "稼働中パイプライン",
          activeLeads: "{{count}} 件のアクティブリード",
        },
        scenarioLabels: {
          S1: "若手プロ",
          S2: "ライフイベント",
          S3: "シニア",
          S4: "休眠",
          S5: "購入意向",
          S6: "対面",
          S7: "Web→電話",
        },
      },
      campaigns: {
        title: "ワークフロー制御",
        subtitle: "LangGraph 一括実行 • 全エージェント自動実行 • HITL ゲートでのみ停止",
        status: {
          complete: "✓ 完了",
          batchRunning: "バッチ実行中",
          loading: "読み込み中…",
          ready: "準備完了",
        },
        runButton: {
          complete: "再実行",
          running: "実行中…",
          runAll: "全ワークフロー実行",
          runningTitle:
            "サーバーのバッチ処理が実行中です。途中停止はできません（HITL ゲートでのみ停止します）。",
        },
        batch: {
          processing: "バッチ処理",
          leads: "件",
          succeeded: "成功",
          awaitingHitl: "HITL 待ち",
          awaitingHitlScoped: "HITL 待ち（このバッチ）",
          awaitingHitlAll: "HITL 待ち（全バッチ）",
          remaining: "残り",
          failed: "失敗",
          legendExplain:
            "緑・青・赤はこのバッチのみ。琥珀はこのバッチ ID が付いた HITL のみ（新規）。タグなしの旧データは含みません。チップの合計とバッチ総数は一致しません。",
          hitlOrgWide: "全バッチの保留キュー合計: {{count}}",
          scopeSucceeded: "このバッチで正常に処理できたリード数。",
          scopeAwaitingHitl:
            "このバッチ実行で作成されたレビュー（キュー行に batch_id があるもの）。",
          scopeAwaitingHitlGlobal: "全バッチを通じた現在のヒューマンレビュー待ち件数。",
          scopeRemaining: "このバッチでまだ処理されていないリード数。",
          scopeFailed: "このバッチでエラーになったリード数。",
        },
        scenarios: {
          subtitle: "シナリオ別件数はデータベース上の全リード対象です（現在のバッチのみではありません）。",
        },
        pipeline: {
          title: "エージェント実行パイプライン",
          subtitle:
            "大きい数字＝本バッチの段階完了回数（SSE のノード完了。ユニークリード数ではありません。A4+A5 は同一カード）。小さな説明＝その段階に現在滞留している Active/Processing 件数（DB）。バッチバーは SSE と 1.2 秒ポーリング。更新はタイマーと SSE に連動したダッシュボード取得。",
          queueScopeNote:
            "エージェントタイルの「待ち」は、その段階にいる Active/Processing の全体件数であり、バッチバーの残り件数とは別です。",
          hitlAwaiting: "{{count}} 件待ち",
          succeeded: "成功",
          idleCaption: "待機",
          emDash: "—",
          completionsQueued: "本バッチの段階完了 · 待ち {{queued}}",
          queuedOnly: "待ち: {{queued}}",
          stageMainHint:
            "本バッチ内のノード完了回数（リード単位では重複あり得る）。A4 と A5 はこのカードに集約されます。",
          stageSubHint:
            "DB 上の滞留: Active/Processing で現在のノードがこの段階に該当するリード数。",
          hitlTileHintBatch:
            "バッチ読み込み時の琥珀レジェンドと同じ — このバッチ ID の保留レビュー。",
          hitlTileHintGlobal:
            "琥珀レジェンドと同じ — バッチ指定がないときは全キュー。",
          batchSuccessLabel: "✓ バッチ実行 OK",
          batchSuccessCaption:
            "グラフがエラー終了しなかった件数（HITL 待ちを含む）。CRM 成約（DB 全リード）: {{crm}}",
          batchSuccessTitleHint:
            "バッチの graph 呼び出しが例外なく終わったリード数（HITL で停止も含む）。ビジネス上の成約数ではありません。",
          batchSuccessSubHint:
            "ダッシュボード集計の CRM 成約件数と比較してください。大きい数字は batch の success_count です。",
        },
      },
      analytics: {
        title: "分析",
        subtitle: "7 シナリオ横断の指標 • {{range}}",
        noWeeklyData: "週次データがありません。",
        weekly: {
          title: "週次リード推移",
          subtitle: "週ごとの新規・エンゲージ・成約",
          newLeads: "新規",
          engaged: "エンゲージ",
          converted: "成約",
        },
        scenarioConversion: {
          title: "シナリオ別成約",
          subtitle: "シナリオ別の成約率（期間内コホート）",
          empty: "シナリオデータがありません。",
        },
        agentPerf: {
          title: "エージェント性能",
          subtitle: "DB の概算処理数。遅延/成功率は計測時に表示。",
          agent: "エージェント",
          processed: "処理数",
          avgLatency: "平均遅延",
          success: "成功率",
          empty: "行がありません。",
        },
        emailPerf: {
          title: "メール性能",
          subtitle: "全キャンペーン（選択期間）",
          topPerforming: "上位（シナリオ別）",
          bestOpen: "· 開封トップ",
          bestClick: "· クリックトップ",
          notEnough: "ランキングに十分なメールデータがありません。",
          openSuffix: "% 開封",
          clickSuffix: "% クリック",
        },
        hitlGate: {
          title: "HITL ゲート統計",
          subtitle: "ゲート別承認指標",
          noReviews: "期間内レビューなし",
          reviewedAvg: "{{count}} 件レビュー · 平均 {{mins}} 分",
          autoApproved: "自動承認（G1 · existing_asset）",
        },
        scoreDist: {
          title: "リードスコア分布",
          subtitle: "オプトアウト除外 · engagement_score",
          empty: "スコアがありません。",
          below: "0.40 未満 {{count}} 件",
          above: "0.70 以上 {{count}} 件",
        },
        llm: {
          title: "LLM トークン使用量",
          subtitle: "課金フックで保存されるとここに表示されます",
          tokens: "トークン",
          totalMonthly: "月額合計（計測分）",
          notPersisted: "LLM 使用量はまだ DB に保存されていません。",
        },
        ranges: {
          d30: "30日",
          d90: "90日",
          all: "全期間",
        },
      },
      signup: {
        title: "新規登録",
        subtitle: "安全なアクセスと分析でリード育成を開始。",
        haveAccount: "すでにアカウントをお持ちですか？",
        login: "ログイン",
      },
      auth: {
        fields: {
          fullName: "氏名",
          email: "メール",
          password: "パスワード",
          confirmPassword: "パスワード確認",
        },
        placeholders: {
          fullName: "氏名を入力",
          email: "メールを入力",
          password: "パスワードを作成",
          confirmPassword: "パスワードを再入力",
        },
        hints: {
          passwordMin: "{{min}}文字以上にしてください。",
        },
        validation: {
          fullNameRequired: "氏名は必須です。",
          emailRequired: "メールは必須です。",
          emailInvalid: "有効なメールアドレスを入力してください。",
          passwordRequired: "パスワードは必須です。",
          passwordMin: "パスワードは{{min}}文字以上にしてください。",
          confirmPasswordRequired: "パスワード確認を入力してください。",
          passwordMismatch: "パスワードが一致しません。",
        },
        signup: {
          title: "新規登録",
          cta: "アカウント作成 →",
          creating: "作成中...",
          failed: "新規登録に失敗しました。もう一度お試しください。",
        },
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
