import { describe, expect, it } from "vitest";
import { buildPromptGuidelinesBlock } from "./buildGuidelinesBlock.js";
import {
  DEPENDENCY_GUIDELINES,
  FULL_PROJECT_PLAN_SCHEMA,
  MILESTONE_GUIDELINES,
  RISK_GUIDELINES,
  STAKEHOLDER_GUIDELINES,
  WBS_DRAFT_OUTPUT_SCHEMA,
  WBS_GUIDELINES,
} from "./index.js";

describe("ai-prompts guidelines", () => {
  it("WBSガイドラインに親durationDays=0と葉description必須を含む", () => {
    expect(WBS_GUIDELINES).toContain("durationDays は必ず 0");
    expect(WBS_GUIDELINES).toContain("description は必須");
    expect(WBS_GUIDELINES).toContain("一意");
  });

  it("依存ガイドラインに葉タスク名のみを含む", () => {
    expect(DEPENDENCY_GUIDELINES).toContain("葉タスク");
    expect(DEPENDENCY_GUIDELINES).toContain("FS");
  });

  it("マイルストーン・リスク・関係者ガイドラインが必須キーワードを含む", () => {
    expect(MILESTONE_GUIDELINES).toContain("startDate");
    expect(RISK_GUIDELINES).toContain("response");
    expect(STAKEHOLDER_GUIDELINES).toContain("influence");
  });

  it("フル計画スキーマに全セクションを含む", () => {
    expect(FULL_PROJECT_PLAN_SCHEMA).toContain('"tasks"');
    expect(FULL_PROJECT_PLAN_SCHEMA).toContain('"dependencies"');
    expect(FULL_PROJECT_PLAN_SCHEMA).toContain('"milestones"');
    expect(FULL_PROJECT_PLAN_SCHEMA).toContain('"risks"');
    expect(FULL_PROJECT_PLAN_SCHEMA).toContain('"stakeholders"');
  });

  it("WBSドラフトスキーマは親durationDays=0の例を含む", () => {
    expect(WBS_DRAFT_OUTPUT_SCHEMA).toContain('"durationDays": 0');
  });

  it("buildPromptGuidelinesBlock が全セクションを含む", () => {
    const block = buildPromptGuidelinesBlock();
    expect(block).toContain("【WBS生成ルール】");
    expect(block).toContain("【依存関係ルール】");
    expect(block).toContain("【マイルストーンルール】");
    expect(block).toContain("会場");
  });
});
