import { ExportBundleSchema, computeCpm, computeEvm, validateWbs } from "@tpc/shared";
import { describe, expect, it } from "vitest";
import { SAMPLE_ELAPSED_DAYS, buildSampleProjectBundle } from "./sampleProject.js";

const TODAY = "2026-06-12";

describe("buildSampleProjectBundle", () => {
  it("ExportBundleスキーマに準拠している", () => {
    const bundle = buildSampleProjectBundle(TODAY);
    const result = ExportBundleSchema.safeParse(bundle);
    expect(result.success, JSON.stringify(result.success ? "" : result.error.issues)).toBe(true);
  });

  it("開始日は基準日からSAMPLE_ELAPSED_DAYS日さかのぼった日付になる", () => {
    const bundle = buildSampleProjectBundle(TODAY);
    expect(SAMPLE_ELAPSED_DAYS).toBeGreaterThan(0);
    expect(bundle.project.startDate).toBe("2026-06-02");
  });

  it("タスク階層（親子）を含み、WBS構造が妥当である", () => {
    const bundle = buildSampleProjectBundle(TODAY);
    expect(bundle.tasks.some((t) => t.parentId !== null)).toBe(true);
    expect(bundle.tasks.some((t) => t.parentId === null)).toBe(true);
    expect(validateWbs(bundle.tasks).issues).toEqual([]);
  });

  it("タスクIDは一意で、親IDはすべてバンドル内のタスクを指す", () => {
    const bundle = buildSampleProjectBundle(TODAY);
    const ids = new Set(bundle.tasks.map((t) => t.id));
    expect(ids.size).toBe(bundle.tasks.length);
    for (const task of bundle.tasks) {
      if (task.parentId !== null) {
        expect(ids.has(task.parentId), `親ID不明: ${task.parentId}`).toBe(true);
      }
      expect(task.projectId).toBe(bundle.project.id);
    }
  });

  it("依存関係を含み、両端はバンドル内のタスクを指す", () => {
    const bundle = buildSampleProjectBundle(TODAY);
    const ids = new Set(bundle.tasks.map((t) => t.id));
    expect(bundle.dependencies.length).toBeGreaterThan(0);
    for (const dep of bundle.dependencies) {
      expect(ids.has(dep.predecessorId), `先行ID不明: ${dep.predecessorId}`).toBe(true);
      expect(ids.has(dep.successorId), `後続ID不明: ${dep.successorId}`).toBe(true);
      expect(dep.projectId).toBe(bundle.project.id);
    }
  });

  it("依存関係は循環せずCPMを計算でき、クリティカルパスが存在する", () => {
    const bundle = buildSampleProjectBundle(TODAY);
    const cpm = computeCpm(bundle.tasks, bundle.dependencies);
    expect(cpm.projectDuration).toBeGreaterThan(0);
    expect(cpm.criticalPath.length).toBeGreaterThan(0);
  });

  it("マイルストーン・リスク・ステークホルダーを一通り含む", () => {
    const bundle = buildSampleProjectBundle(TODAY);
    expect(bundle.milestones.length).toBeGreaterThan(0);
    expect(bundle.risks.length).toBeGreaterThan(0);
    expect(bundle.stakeholders.length).toBeGreaterThan(0);
    for (const m of bundle.milestones) expect(m.projectId).toBe(bundle.project.id);
    for (const r of bundle.risks) expect(r.projectId).toBe(bundle.project.id);
    for (const s of bundle.stakeholders) expect(s.projectId).toBe(bundle.project.id);
  });

  it("完了・進行中・未着手のタスクが混在し、進捗バーとSPIが意味を持つ", () => {
    const bundle = buildSampleProjectBundle(TODAY);
    const leaves = bundle.tasks.filter((t) => !bundle.tasks.some((c) => c.parentId === t.id));
    expect(leaves.some((t) => t.progress === 100)).toBe(true);
    expect(leaves.some((t) => t.progress > 0 && t.progress < 100)).toBe(true);
    expect(leaves.some((t) => t.progress === 0)).toBe(true);
  });

  it("基準日時点でSPIが計測可能（PV > 0）である", () => {
    const bundle = buildSampleProjectBundle(TODAY);
    const cpm = computeCpm(bundle.tasks, bundle.dependencies);
    const evm = computeEvm(
      {
        project: bundle.project,
        tasks: bundle.tasks,
        dependencies: bundle.dependencies,
        milestones: bundle.milestones,
        cpm,
      },
      TODAY,
    );
    expect(evm.bac).toBeGreaterThan(0);
    expect(evm.pv).toBeGreaterThan(0);
    expect(evm.spi).not.toBeNull();
  });
});
