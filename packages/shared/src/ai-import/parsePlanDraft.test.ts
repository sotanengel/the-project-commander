import { describe, expect, it } from "vitest";
import {
  decodePlanDraftPayload,
  encodePlanDraftPayload,
  parsePlanDraft,
} from "./parsePlanDraft.js";

const sampleDraft = {
  tasks: [
    {
      name: "フェーズ1",
      durationDays: 0,
      children: [{ name: "タスクA", durationDays: 3, description: "作業A" }],
    },
  ],
  dependencies: [{ predecessorName: "タスクA", successorName: "タスクB", type: "FS" as const }],
  milestones: [{ name: "完了", dueDate: "2027-10-01", status: "pending" as const }],
  risks: [
    {
      title: "遅延リスク",
      probability: "medium" as const,
      impact: "high" as const,
      response: "軽減: バッファを確保",
    },
  ],
  stakeholders: [
    {
      name: "山田",
      role: "スポンサー",
      influence: "high" as const,
      interest: "high" as const,
    },
  ],
};

describe("parsePlanDraft", () => {
  it("フル計画JSONを検証する", () => {
    const result = parsePlanDraft(sampleDraft);
    expect(result.tasks).toHaveLength(1);
    expect(result.dependencies).toHaveLength(1);
    expect(result.milestones).toHaveLength(1);
    expect(result.risks).toHaveLength(1);
    expect(result.stakeholders).toHaveLength(1);
  });

  it("tasks が空なら拒否する", () => {
    expect(() => parsePlanDraft({ tasks: [] })).toThrow();
  });

  it("risk の response 欠落を拒否する", () => {
    expect(() =>
      parsePlanDraft({
        tasks: [{ name: "A", durationDays: 1, description: "x" }],
        risks: [{ title: "R", probability: "low", impact: "low" }],
      }),
    ).toThrow();
  });
});

describe("encodePlanDraftPayload / decodePlanDraftPayload", () => {
  it("往復できる", () => {
    const encoded = encodePlanDraftPayload(sampleDraft);
    const decoded = decodePlanDraftPayload(encoded);
    expect(decoded.tasks[0]?.name).toBe("フェーズ1");
    expect(decoded.risks[0]?.title).toBe("遅延リスク");
  });
});
