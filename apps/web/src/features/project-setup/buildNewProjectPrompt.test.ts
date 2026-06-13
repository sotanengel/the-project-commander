import type { Project } from "@tpc/shared";
import { describe, expect, it } from "vitest";
import { buildNewProjectPrompt } from "./buildNewProjectPrompt.js";

const weddingProject: Project = {
  id: "proj-wedding",
  name: "結婚式",
  description: "福岡と沖縄の二人が2027年10月に東京お台場で挙式・披露宴を行うプロジェクト。",
  startDate: "2027-04-01",
  createdAt: "2027-04-01T00:00:00.000Z",
};

describe("buildNewProjectPrompt", () => {
  it("プロジェクト名・概要・開始日がプロンプトに含まれる", () => {
    const prompt = buildNewProjectPrompt(weddingProject, "http://localhost:3001");
    expect(prompt).toContain("結婚式");
    expect(prompt).toContain("お台場");
    expect(prompt).toContain("2027-04-01");
  });

  it("Web検索・ブラウジングでのフル計画取り込み指示を含む", () => {
    const prompt = buildNewProjectPrompt(weddingProject, "http://localhost:3001");
    expect(prompt).toContain("Web検索・ブラウジング");
    expect(prompt).toContain("http://localhost:3001/api/projects/proj-wedding/ai-import-manifest");
    expect(prompt).toContain("http://localhost:3001/api/projects/proj-wedding/plan-draft-import");
    expect(prompt).toContain("http://localhost:3001/projects/proj-wedding/setup?payload=");
  });

  it("WBS・依存・マイルストーン・リスク・関係者のガイドラインを含む", () => {
    const prompt = buildNewProjectPrompt(weddingProject, "http://localhost:3001");
    expect(prompt).toContain("【WBS生成ルール】");
    expect(prompt).toContain("【依存関係ルール】");
    expect(prompt).toContain("【マイルストーンルール】");
    expect(prompt).toContain("会場");
    expect(prompt).toContain('"stakeholders"');
  });

  it("ユーザーへの生JSON返却を禁止する指示を含む", () => {
    const prompt = buildNewProjectPrompt(weddingProject, "http://localhost:3001");
    expect(prompt).toContain("ユーザーへの返答に生JSONは含めない");
  });
});
