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

  it("projectId が MCP 指示に含まれる", () => {
    const prompt = buildNewProjectPrompt(sampleProject, "http://localhost:3001");
    expect(prompt).toContain("proj-abc123");
    expect(prompt).toContain('projectId: "proj-abc123"');
  });

  it("appOrigin から AIアシストURL・MCP URL が組み立てられる", () => {
    const prompt = buildNewProjectPrompt(sampleProject, "http://localhost:3001");
    expect(prompt).toContain("http://localhost:3001/projects/proj-abc123/ai");
    expect(prompt).toContain("http://localhost:3001/mcp");
  });

  it("WBS JSONスキーマ指示が含まれる", () => {
    const prompt = buildNewProjectPrompt(sampleProject, "http://localhost:3001");
    expect(prompt).toContain('"tasks"');
    expect(prompt).toContain("フェーズ名");
    expect(prompt).toContain("ワークパッケージ");
  });
});
