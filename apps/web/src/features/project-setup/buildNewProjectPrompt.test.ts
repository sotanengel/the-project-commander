import type { Project } from "@tpc/shared";
import { describe, expect, it } from "vitest";
import { buildNewProjectPrompt } from "./buildNewProjectPrompt.js";

const sampleProject: Project = {
  id: "proj-abc123",
  name: "コーポレートサイト制作",
  description: "B2B向けコーポレートサイトのリニューアル。CMS導入と多言語対応を含む。",
  startDate: "2026-06-10",
  createdAt: "2026-06-10T00:00:00.000Z",
};

describe("buildNewProjectPrompt", () => {
  it("プロジェクト名・概要・開始日がプロンプトに含まれる", () => {
    const prompt = buildNewProjectPrompt(sampleProject, "http://localhost:3001");
    expect(prompt).toContain("コーポレートサイト制作");
    expect(prompt).toContain("B2B向けコーポレートサイトのリニューアル");
    expect(prompt).toContain("2026-06-10");
  });

  it("Web検索・ブラウジングでの取り込み指示を含む", () => {
    const prompt = buildNewProjectPrompt(sampleProject, "http://localhost:3001");
    expect(prompt).toContain("Web検索・ブラウジング");
    expect(prompt).toContain("http://localhost:3001/api/projects/proj-abc123/ai-import-manifest");
    expect(prompt).toContain("http://localhost:3001/api/projects/proj-abc123/tasks/bulk");
    expect(prompt).toContain("http://localhost:3001/projects/proj-abc123/setup?payload=");
  });

  it("ユーザーへの生JSON返却を禁止する指示を含む", () => {
    const prompt = buildNewProjectPrompt(sampleProject, "http://localhost:3001");
    expect(prompt).toContain("ユーザーへの返答に生JSONは含めない");
  });

  it("WBS JSONスキーマ指示が含まれる", () => {
    const prompt = buildNewProjectPrompt(sampleProject, "http://localhost:3001");
    expect(prompt).toContain('"tasks"');
    expect(prompt).toContain("フェーズ名");
    expect(prompt).toContain("ワークパッケージ");
  });
});
