const escapeCsvCell = (value) => {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export const downloadBlob = (filename, content, mimeType = "text/plain;charset=utf-8") => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/** UTF-8 BOM helps Excel open CSV correctly */
export const leadsToCsv = (rows) => {
  const headers = [
    "id",
    "name",
    "email",
    "scenario_id",
    "persona_code",
    "engagement_score",
    "workflow_status",
    "current_agent_node",
    "thread_id",
    "last_activity",
  ];
  const lines = [headers.join(",")];
  rows.forEach((r) => {
    lines.push(
      headers
        .map((h) => escapeCsvCell(r[h]))
        .join(",")
    );
  });
  return `\uFEFF${lines.join("\n")}`;
};

export const leadDetailToJson = (detail) => JSON.stringify(detail, null, 2);
