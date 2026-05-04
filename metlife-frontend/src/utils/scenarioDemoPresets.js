/**
 * Demo intake presets aligned with backend `classify_scenario`
 * (metlife_agents_backend/core/v1/services/agents/rules/scenario_rules.py).
 *
 * S4 is not produced by quote/consultation intake — it applies to dormant revival in batch flow.
 */

export const SCENARIO_DEMO_ORDER = ["S1", "S2", "S3", "S4", "S5", "S6", "S7"];

/** @typedef {"quote"|"consultation"|"none"} ScenarioDemoPath */

export const SCENARIO_DEMO_PRESETS = {
  S1: {
    id: "S1",
    label: "S1 · Young Professional",
    path: "quote",
    description: "ANS3 = C, life-event survey = No, age under 35 → young-prof survey path.",
    build: () => ({
      ans3: "C",
      ans4: "No",
      age: 28,
    }),
  },
  S2: {
    id: "S2",
    label: "S2 · Life Event",
    path: "quote",
    description: "ANS3 = C with an affirmative life-event answer (Yes).",
    build: () => ({
      ans3: "C",
      ans4: "Yes",
      age: 34,
    }),
  },
  S3: {
    id: "S3",
    label: "S3 · Senior",
    path: "quote",
    description: "ANS3 = C, no life event, age 35+ → senior survey path.",
    build: () => ({
      ans3: "C",
      ans4: "No",
      age: 55,
    }),
  },
  S4: {
    id: "S4",
    label: "S4 · Dormant Revival",
    path: "none",
    description: "Not available from this intake — classification never returns S4 for a new quote/consult form.",
    help: "S4 is assigned when a dormant lead re-enters through the batch dormant queue (Campaigns / batch run), not from Settings intake.",
  },
  S5: {
    id: "S5",
    label: "S5 · Active Buyer",
    path: "quote",
    description: "ANS3 = A or B (high intent product path).",
    build: () => ({
      ans3: "A",
      ans4: null,
      age: 40,
    }),
  },
  S6: {
    id: "S6",
    label: "S6 · F2F Consultation",
    path: "consultation",
    description: "Consultation request with request_type face_to_face (f2f_form).",
    build: () => ({
      request_type: "face_to_face",
    }),
  },
  S7: {
    id: "S7",
    label: "S7 · Web-to-Call / Seminar",
    path: "consultation",
    description: "Consultation request with web_to_call or seminar (same scenario bucket in rules).",
    build: () => ({
      request_type: "web_to_call",
    }),
  },
};

/** Scenarios that can be created from Settings intake (excludes S4 — dormant path only). */
export const SCENARIO_DEMO_CREATABLE_IDS = SCENARIO_DEMO_ORDER.filter(
  (id) => SCENARIO_DEMO_PRESETS[id]?.path !== "none"
);
