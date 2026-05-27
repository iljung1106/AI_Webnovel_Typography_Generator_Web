export const workflowSteps = [
  { id: "genre", label: "장르" },
  { id: "cover", label: "표지" },
  { id: "title", label: "제목" },
  { id: "layout", label: "배치" },
  { id: "style", label: "스타일" },
  { id: "generation", label: "생성" },
  { id: "effects", label: "효과" },
  { id: "export", label: "내보내기" }
] as const;

export type WorkflowStepId = (typeof workflowSteps)[number]["id"];
