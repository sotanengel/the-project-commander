import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./client.js";

describe("ApiError", () => {
  it("status / message / issues を保持する", () => {
    const err = new ApiError(400, "bad request", [{ path: "name", message: "required" }]);
    expect(err.status).toBe(400);
    expect(err.message).toBe("bad request");
    expect(err.issues).toEqual([{ path: "name", message: "required" }]);
    expect(err.name).toBe("ApiError");
  });
});

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("成功時に JSON を返す", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [{ id: "1", name: "Test" }],
    } as Response);

    const projects = await api.listProjects();
    expect(projects).toEqual([{ id: "1", name: "Test" }]);
  });

  it("HTTP エラー時に ApiError を投げる", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "validation failed",
        issues: [{ path: "name", message: "required" }],
      }),
    } as Response);

    await expect(api.listProjects()).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      message: "validation failed",
      issues: [{ path: "name", message: "required" }],
    });
  });

  it("ネットワーク障害時に status 0 の ApiError を投げる", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("connection refused"));

    await expect(api.listProjects()).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
      message: expect.stringContaining("サーバーに接続できません"),
    });
  });
});
