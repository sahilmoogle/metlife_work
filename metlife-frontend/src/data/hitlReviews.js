export const hitlReviewSeed = [
  {
    id: "r1",
    state: "pending",
    gateTitle: "G1 - Content Compliance Review",
    gateSubtitle:
      "Review LLM-generated email for brand compliance, tone accuracy, and regulatory requirements. Workflow paused until resolved",
    lead: {
      initials: "MT",
      name: "Masaki Tanaka",
      email: "m.tanaka@email.jp",
      scenario: "S2",
      persona: "E / Kana",
      lifeEvent: "Marriage",
      score: 0.65,
      emailsSent: "2 / 5",
      keigo: "Standard（丁寧語）",
      step: "G1 Paused",
      mode: "Autonomous → Paused",
    },
    content: {
      title: "Content Preview — Email #3",
      chips: ["GPT-4 Generated", "Requires Approval"],
      subject:
        "件名：新たなご結婚おめでとうございます｜ご家族のための保険プランのご案内",
      greeting: "鈴木 加奈 様",
      body: [
        "ご結婚、おめでとうございます。新しい生活のスタートにあたり、大切なご家族を守る保険について、少しだけお話させてください。",
        "■ ご結婚後に検討される方が多い３つのポイント：",
        "① 万が一の備えの「カバー範囲」",
        "② ご出産前後の負担軽減を考慮した設計",
        "③ 将来のお子様のための教育資金準備",
      ],
    },
    compliance: [
      "Brand tone matches persona（丁寧語）",
      "No prohibited claims",
      "Unsubscribe link present",
      "Review: product claims in bullet",
      "CTA links to approved page",
    ],
  },
  {
    id: "r2",
    state: "pending",
    gateTitle: "G4 - Sales Handoff",
    gateSubtitle: "Confirm handoff details before routing to sales agent.",
    lead: {
      initials: "RE",
      name: "Riku Endo",
      email: "r.endo@email.jp",
      scenario: "S2",
      persona: "E / Recently Married",
      lifeEvent: "Marriage",
      score: 0.65,
      emailsSent: "2 / 5",
      keigo: "Standard（丁寧語）",
      step: "G4 Paused",
      mode: "Autonomous → Paused",
    },
    content: {
      title: "Handoff Summary",
      chips: ["Auto-Generated", "Requires Approval"],
      subject: "Sales handoff summary for review",
      greeting: "",
      body: ["Please verify the handoff packet details and approve to continue."],
    },
    compliance: ["Required fields present", "No restricted content"],
  },
];

export const getHitlReviewById = (id) =>
  hitlReviewSeed.find((r) => String(r.id) === String(id));

