import { describe, expect, it } from "vitest";
import type { BulkTaskInput } from "../types.js";
import { decodeImportPayload } from "./decode.js";
import { buildAiImportManifest, buildImportNavigateUrl, encodeImportPayload } from "./index.js";

const sampleTasks: BulkTaskInput[] = [
  { name: "フェーズ1", durationDays: 10, children: [{ name: "タスクA", durationDays: 3 }] },
];

const sampleProject = {
  id: "proj-abc123",
  name: "結婚式",
  description: "概要",
  startDate: "2027-04-01",
  createdAt: "2027-04-01T00:00:00.000Z",
};

describe("encodeImportPayload / decodeImportPayload", () => {
  it("タスク配列を往復できる", () => {
    const encoded = encodeImportPayload(sampleTasks);
    expect(decodeImportPayload(encoded)).toEqual(sampleTasks);
  });

  it("空配列は拒否する", () => {
    expect(() => decodeImportPayload(encodeURIComponent(JSON.stringify({ tasks: [] })))).toThrow();
  });
});

describe("buildImportNavigateUrl", () => {
  it("setup URL に payload クエリを付与する", () => {
    const url = buildImportNavigateUrl("http://localhost:3001", "proj-abc123", sampleTasks);
    expect(url).toMatch(/^http:\/\/localhost:3001\/projects\/proj-abc123\/setup\?payload=/);
    const payload = new URL(url).searchParams.get("payload");
    expect(payload).toBeTruthy();
    expect(decodeImportPayload(payload as string)).toEqual(sampleTasks);
  });
});

describe("buildAiImportManifest", () => {
  it("POST URL とブラウザ遷移パターンを含む", () => {
    const manifest = buildAiImportManifest(sampleProject, "http://localhost:3001");
    expect(manifest.project.id).toBe("proj-abc123");
    expect(manifest.methods[0]).toMatchObject({
      type: "http_post",
      url: "http://localhost:3001/api/projects/proj-abc123/tasks/bulk",
    });
    expect(manifest.methods[1]).toMatchObject({
      type: "browser_navigate",
      urlPattern: "http://localhost:3001/projects/proj-abc123/setup?payload={urlencoded_json}",
    });
  });
});
