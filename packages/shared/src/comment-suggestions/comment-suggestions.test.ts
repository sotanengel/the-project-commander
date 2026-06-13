import { describe, expect, it } from "vitest";
import type { ProjectPlan } from "../types.js";
import { buildLocalCommentSuggestionPrompt } from "./buildLocalCommentSuggestionPrompt.js";
import {
  parseAndValidateCommentSuggestions,
  parseCommentSuggestionsResponse,
  validateSuggestionsAgainstPlan,
} from "./parseCommentSuggestions.js";
import { selectTaskIdsForContext, serializePlanContext } from "./planContext.js";

const samplePlan: ProjectPlan = {
  project: {
    id: "proj-1",
    name: "テスト",
    description: "概要",
    startDate: "2026-06-01",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  tasks: [
    {
      id: "task-1",
      projectId: "proj-1",
      parentId: null,
      name: "設計",
      description: "",
      durationDays: 5,
      progress: 30,
      assignee: "Alice",
      sortOrder: 0,
    },
    {
      id: "task-2",
      projectId: "proj-1",
      parentId: null,
      name: "実装",
      description: "",
      durationDays: 10,
      progress: 0,
      assignee: "",
      sortOrder: 1,
    },
  ],
  dependencies: [
    {
      id: "dep-1",
      projectId: "proj-1",
      predecessorId: "task-1",
      successorId: "task-2",
      type: "FS",
      lagDays: 0,
    },
  ],
  milestones: [
    {
      id: "ms-1",
      projectId: "proj-1",
      name: "リリース",
      dueDate: "2026-07-01",
      status: "pending",
    },
  ],
  cpm: {
    tasks: [
      {
        taskId: "task-1",
        earlyStart: 0,
        earlyFinish: 5,
        lateStart: 0,
        lateFinish: 5,
        totalFloat: 0,
        freeFloat: 0,
        isCritical: true,
      },
      {
        taskId: "task-2",
        earlyStart: 5,
        earlyFinish: 15,
        lateStart: 5,
        lateFinish: 15,
        totalFloat: 0,
        freeFloat: 0,
        isCritical: true,
      },
    ],
    projectDuration: 15,
    criticalPath: ["task-1", "task-2"],
  },
};

describe("buildLocalCommentSuggestionPrompt", () => {
  it("計画コンテキストとコメントを含む", () => {
    const prompt = buildLocalCommentSuggestionPrompt({
      plan: samplePlan,
      targetTaskId: "task-1",
      commentBody: "進捗50%に更新",
      recentComments: [],
    });
    expect(prompt).toContain("進捗50%に更新");
    expect(prompt).toContain("task-1");
    expect(prompt).toContain("update_task");
    expect(prompt).toContain("task-1");
    expect(prompt).toContain("設計");
    expect(prompt).not.toContain("get_project_plan");
  });
});

describe("serializePlanContext", () => {
  it("タスク・依存・マイルストーンを含む", () => {
    const text = serializePlanContext(samplePlan, { targetTaskId: "task-1" });
    expect(text).toContain("task-1|設計");
    expect(text).toContain("task-2|実装");
    expect(text).toContain("task-1->task-2");
    expect(text).toContain("ms-1|リリース");
    expect(text).toContain("criticalPath=task-1,task-2");
  });
});

describe("selectTaskIdsForContext", () => {
  it("対象タスクと依存先を優先する", () => {
    const ids = selectTaskIdsForContext(samplePlan, "task-1", 80);
    expect(ids.has("task-1")).toBe(true);
    expect(ids.has("task-2")).toBe(true);
  });
});

describe("parseCommentSuggestionsResponse", () => {
  it("素の JSON をパースする", () => {
    const json = JSON.stringify({
      suggestions: [
        {
          id: "s1",
          kind: "update_task",
          label: "進捗を50%に",
          rationale: "コメントに合わせる",
          taskId: "task-1",
          changes: { progress: 50 },
        },
      ],
    });
    const result = parseCommentSuggestionsResponse(json);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("update_task");
  });

  it("コードフェンス付き JSON をパースする", () => {
    const text = `説明文\n\`\`\`json\n${JSON.stringify({
      suggestions: [
        {
          id: "s1",
          kind: "update_task",
          label: "進捗更新",
          rationale: "理由",
          taskId: "task-1",
          changes: { progress: 80 },
        },
      ],
    })}\n\`\`\``;
    const result = parseCommentSuggestionsResponse(text);
    expect(result[0]?.kind).toBe("update_task");
    if (result[0]?.kind === "update_task") {
      expect(result[0].changes).toEqual({ progress: 80 });
    }
  });

  it("不正 kind は除外される", () => {
    const result = parseCommentSuggestionsResponse(
      JSON.stringify({ suggestions: [{ kind: "unknown" }] }),
    );
    expect(result).toHaveLength(0);
  });

  it("camelCase の kind を正規化する", () => {
    const result = parseCommentSuggestionsResponse(
      JSON.stringify({
        suggestions: [
          {
            id: "s1",
            kind: "updateTask",
            label: "進捗更新",
            rationale: "理由",
            taskId: "task-1",
            changes: { progress: 80 },
          },
        ],
      }),
    );
    expect(result[0]?.kind).toBe("update_task");
  });

  it("type フィールドから kind を推論する", () => {
    const result = parseCommentSuggestionsResponse(
      JSON.stringify({
        suggestions: [
          {
            id: "s1",
            type: "update_task",
            label: "進捗更新",
            rationale: "理由",
            taskId: "task-1",
            changes: { progress: 60 },
          },
        ],
      }),
    );
    expect(result[0]?.kind).toBe("update_task");
  });

  it("不正と正しい提案が混在する場合は正しいものだけ残す", () => {
    const result = parseCommentSuggestionsResponse(
      JSON.stringify({
        suggestions: [
          { kind: "unknown" },
          {
            id: "s1",
            kind: "update_task",
            label: "OK",
            rationale: "理由",
            taskId: "task-1",
            changes: { progress: 50 },
          },
        ],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("update_task");
  });
});

describe("validateSuggestionsAgainstPlan", () => {
  it("存在しない taskId を除外する", () => {
    const suggestions = parseCommentSuggestionsResponse(
      JSON.stringify({
        suggestions: [
          {
            id: "s1",
            kind: "update_task",
            label: "OK",
            rationale: "理由",
            taskId: "task-1",
            changes: { progress: 50 },
          },
          {
            id: "s2",
            kind: "update_task",
            label: "NG",
            rationale: "理由",
            taskId: "no-such",
            changes: { progress: 50 },
          },
        ],
      }),
    );
    const valid = validateSuggestionsAgainstPlan(suggestions, samplePlan);
    expect(valid).toHaveLength(1);
    expect(valid[0]?.kind).toBe("update_task");
    if (valid[0]?.kind === "update_task") {
      expect(valid[0].taskId).toBe("task-1");
    }
  });

  it("create_dependency の taskId を検証する", () => {
    const suggestions = parseCommentSuggestionsResponse(
      JSON.stringify({
        suggestions: [
          {
            id: "d1",
            kind: "create_dependency",
            label: "依存追加",
            rationale: "理由",
            dependency: { predecessorId: "task-1", successorId: "task-2", type: "FS" },
          },
          {
            id: "d2",
            kind: "create_dependency",
            label: "NG",
            rationale: "理由",
            dependency: { predecessorId: "task-1", successorId: "bad", type: "FS" },
          },
        ],
      }),
    );
    expect(validateSuggestionsAgainstPlan(suggestions, samplePlan)).toHaveLength(1);
  });
});

describe("parseAndValidateCommentSuggestions", () => {
  it("パースと検証をまとめて行う", () => {
    const result = parseAndValidateCommentSuggestions(
      JSON.stringify({
        suggestions: [
          {
            id: "s1",
            kind: "update_milestone",
            label: "完了",
            rationale: "理由",
            milestoneId: "ms-1",
            changes: { status: "done" },
          },
        ],
      }),
      samplePlan,
    );
    expect(result[0]?.kind).toBe("update_milestone");
  });
});
