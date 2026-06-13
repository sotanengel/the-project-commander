import type { Baseline, Dependency, ExportBundle, Project, Task } from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { createDb } from "../db.js";

describe("export/import API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    app = await buildApp(createDb(":memory:"));
  });

  afterEach(async () => {
    await app.close();
  });

  async function createProject(name = "輸出プロジェクト"): Promise<Project> {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name, description: "説明文", startDate: "2026-06-10" },
    });
    return res.json();
  }

  async function createTask(projectId: string, payload: Record<string, unknown>): Promise<Task> {
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/tasks`,
      payload,
    });
    return res.json();
  }

  /**
   * 階層タスク・依存・マイルストーン・リスク・ステークホルダー・ベースラインを持つ
   * フルセットのプロジェクトを作成する。
   */
  async function createFullProject(name = "輸出プロジェクト") {
    const project = await createProject(name);
    const phase = await createTask(project.id, { name: "フェーズ1" });
    const design = await createTask(project.id, {
      name: "設計",
      parentId: phase.id,
      durationDays: 3,
      assignee: "佐藤",
    });
    const impl = await createTask(project.id, {
      name: "実装",
      parentId: phase.id,
      durationDays: 5,
      progress: 40,
    });
    const review = await createTask(project.id, { name: "レビュー", durationDays: 2 });
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/dependencies`,
      payload: { predecessorId: design.id, successorId: impl.id, type: "FS", lagDays: 1 },
    });
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/dependencies`,
      payload: { predecessorId: impl.id, successorId: review.id },
    });
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/milestones`,
      payload: { name: "リリース", dueDate: "2026-07-01", status: "pending" },
    });
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/risks`,
      payload: { title: "要員不足", probability: "high", impact: "medium", response: "採用強化" },
    });
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/stakeholders`,
      payload: { name: "山田部長", role: "スポンサー", influence: "high", interest: "low" },
    });
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/baselines`,
      payload: { label: "初期計画" },
    });
    return { project, phase, design, impl, review };
  }

  async function exportProject(projectId: string): Promise<ExportBundle> {
    const res = await app.inject({ method: "GET", url: `/api/projects/${projectId}/export` });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  describe("GET /api/projects/:id/export", () => {
    it("存在しないプロジェクトは404で日本語メッセージ", async () => {
      const res = await app.inject({ method: "GET", url: "/api/projects/nope/export" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "プロジェクトが見つかりません" });
    });

    it("全エンティティ＋ベースラインを含むバンドルを返す", async () => {
      const { project, phase, design, impl, review } = await createFullProject();
      const bundle = await exportProject(project.id);

      expect(bundle.version).toBe(1);
      expect(typeof bundle.exportedAt).toBe("string");
      expect(bundle.project.id).toBe(project.id);
      expect(bundle.project.name).toBe("輸出プロジェクト");
      expect(bundle.project.startDate).toBe("2026-06-10");

      // タスク階層
      expect(bundle.tasks).toHaveLength(4);
      const byName = new Map(bundle.tasks.map((t) => [t.name, t]));
      expect(byName.get("フェーズ1")?.parentId).toBeNull();
      expect(byName.get("設計")?.parentId).toBe(phase.id);
      expect(byName.get("実装")?.parentId).toBe(phase.id);
      expect(byName.get("レビュー")?.parentId).toBeNull();
      expect(byName.get("実装")?.progress).toBe(40);
      expect(byName.get("設計")?.assignee).toBe("佐藤");

      // 依存関係
      expect(bundle.dependencies).toHaveLength(2);
      const dep = bundle.dependencies.find((d) => d.predecessorId === design.id) as Dependency;
      expect(dep.successorId).toBe(impl.id);
      expect(dep.type).toBe("FS");
      expect(dep.lagDays).toBe(1);
      expect(
        bundle.dependencies.some((d) => d.predecessorId === impl.id && d.successorId === review.id),
      ).toBe(true);

      // 登録簿（マイルストーン・リスク・ステークホルダー）
      expect(bundle.milestones).toHaveLength(1);
      expect(bundle.milestones[0]).toMatchObject({ name: "リリース", dueDate: "2026-07-01" });
      expect(bundle.risks).toHaveLength(1);
      expect(bundle.risks[0]).toMatchObject({
        title: "要員不足",
        probability: "high",
        impact: "medium",
        response: "採用強化",
      });
      expect(bundle.stakeholders).toHaveLength(1);
      expect(bundle.stakeholders[0]).toMatchObject({
        name: "山田部長",
        role: "スポンサー",
        influence: "high",
        interest: "low",
      });

      // ベースライン（taskIdが実タスクを指すスナップショット）
      expect(bundle.baselines).toHaveLength(1);
      const baseline = bundle.baselines[0] as Baseline;
      expect(baseline.label).toBe("初期計画");
      expect(baseline.projectDuration).toBeGreaterThan(0);
      const snapshotIds = baseline.tasks.map((t) => t.taskId).sort();
      expect(snapshotIds).toEqual([design.id, impl.id, review.id].sort());
    });

    it("タスク進捗コメントを含むバンドルを返す", async () => {
      const { project, design } = await createFullProject();
      await app.inject({
        method: "POST",
        url: `/api/tasks/${design.id}/comments`,
        payload: { body: "設計50%完了" },
      });
      const bundle = await exportProject(project.id);
      expect(bundle.taskComments).toHaveLength(1);
      expect(bundle.taskComments[0]).toMatchObject({
        taskId: design.id,
        body: "設計50%完了",
      });
    });
  });

  describe("POST /api/projects/import", () => {
    it("201でProjectを返し、全エンティティがID再割当されて取り込まれる", async () => {
      const { project } = await createFullProject();
      const bundle = await exportProject(project.id);

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: bundle,
      });
      expect(res.statusCode).toBe(201);
      const imported: Project = res.json();
      expect(imported.id).not.toBe(project.id);
      expect(imported.startDate).toBe("2026-06-10");
      expect(imported.description).toBe("説明文");

      const reExported = await exportProject(imported.id);
      expect(reExported.tasks).toHaveLength(4);
      expect(reExported.dependencies).toHaveLength(2);
      expect(reExported.milestones).toHaveLength(1);
      expect(reExported.risks).toHaveLength(1);
      expect(reExported.stakeholders).toHaveLength(1);
      // IDは元プロジェクトと重複しない
      const originalIds = new Set(bundle.tasks.map((t) => t.id));
      for (const t of reExported.tasks) {
        expect(originalIds.has(t.id)).toBe(false);
        expect(t.projectId).toBe(imported.id);
      }
    });

    it("タスク進捗コメントもインポートされ taskId が再割当される", async () => {
      const { project, design } = await createFullProject();
      await app.inject({
        method: "POST",
        url: `/api/tasks/${design.id}/comments`,
        payload: { body: "設計レビュー待ち" },
      });
      const bundle = await exportProject(project.id);

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: bundle,
      });
      expect(res.statusCode).toBe(201);
      const imported: Project = res.json();

      const reExported = await exportProject(imported.id);
      expect(reExported.taskComments).toHaveLength(1);
      expect(reExported.taskComments[0]?.body).toBe("設計レビュー待ち");
      const designTask = reExported.tasks.find((t) => t.name === "設計");
      expect(reExported.taskComments[0]?.taskId).toBe(designTask?.id);
      expect(reExported.taskComments[0]?.taskId).not.toBe(design.id);
    });

    it("ベースラインもインポートされtaskIdが新IDに再割当される", async () => {
      const { project } = await createFullProject();
      const bundle = await exportProject(project.id);

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: bundle,
      });
      const imported: Project = res.json();

      const baselinesRes = await app.inject({
        method: "GET",
        url: `/api/projects/${imported.id}/baselines`,
      });
      expect(baselinesRes.statusCode).toBe(200);
      const baselines: Baseline[] = baselinesRes.json();
      expect(baselines).toHaveLength(1);
      const importedBaseline = baselines[0] as Baseline;
      const originalBaseline = bundle.baselines[0] as Baseline;
      expect(importedBaseline.label).toBe("初期計画");
      expect(importedBaseline.projectId).toBe(imported.id);
      expect(importedBaseline.createdAt).toBe(originalBaseline.createdAt);
      expect(importedBaseline.projectDuration).toBe(originalBaseline.projectDuration);

      const newTasks: Task[] = (
        await app.inject({ method: "GET", url: `/api/projects/${imported.id}/tasks` })
      ).json();
      const newIdByName = new Map(newTasks.map((t) => [t.name, t.id]));
      const oldIdSet = new Set(bundle.tasks.map((t) => t.id));
      for (const snap of importedBaseline.tasks) {
        // 旧IDは残っておらず、同名タスクの新IDを指す
        expect(oldIdSet.has(snap.taskId)).toBe(false);
        expect(snap.taskId).toBe(newIdByName.get(snap.name));
      }
    });

    it("対応タスクが無いベースラインスナップショット行はそのまま保持される", async () => {
      const { project } = await createFullProject();
      const bundle = await exportProject(project.id);
      (bundle.baselines[0] as Baseline).tasks.push({
        taskId: "ghost-task-id",
        name: "削除済みタスク",
        durationDays: 4,
        earlyStart: 0,
        earlyFinish: 4,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: bundle,
      });
      expect(res.statusCode).toBe(201);
      const imported: Project = res.json();
      const baselines: Baseline[] = (
        await app.inject({ method: "GET", url: `/api/projects/${imported.id}/baselines` })
      ).json();
      const ghost = (baselines[0] as Baseline).tasks.find((t) => t.name === "削除済みタスク");
      expect(ghost).toMatchObject({
        taskId: "ghost-task-id",
        durationDays: 4,
        earlyStart: 0,
        earlyFinish: 4,
      });
    });

    it("プロジェクト名が重複する場合は「(インポート)」サフィックスを付与する", async () => {
      const { project } = await createFullProject("重複名PJ");
      const bundle = await exportProject(project.id);

      const first = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: bundle,
      });
      expect(first.statusCode).toBe(201);
      expect(first.json().name).toBe("重複名PJ (インポート)");

      const second = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: bundle,
      });
      expect(second.statusCode).toBe(201);
      expect(second.json().name).toBe("重複名PJ (インポート 2)");
    });

    it("重複しないプロジェクト名はそのまま使われる", async () => {
      const { project } = await createFullProject("唯一PJ");
      const bundle = await exportProject(project.id);
      await app.inject({ method: "DELETE", url: `/api/projects/${project.id}` });

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: bundle,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe("唯一PJ");
    });

    it("versionが1でないバンドルは400で日本語メッセージ", async () => {
      const { project } = await createFullProject();
      const bundle = await exportProject(project.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: { ...bundle, version: 2 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("入力が不正です");
    });

    it("必須フィールド欠落（projectなし）は400", async () => {
      const { project } = await createFullProject();
      const bundle = await exportProject(project.id);
      const { project: _omit, ...withoutProject } = bundle;
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: withoutProject,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("入力が不正です");
    });

    it("バンドル内でタスクIDが重複する場合は400で日本語メッセージ", async () => {
      const { project } = await createFullProject();
      const bundle = await exportProject(project.id);
      bundle.tasks.push({ ...(bundle.tasks[0] as Task), name: "ID重複" });
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: bundle,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("タスクID");
    });

    it("parentIdがバンドル内に存在しないタスクはルート扱いになる", async () => {
      const { project } = await createFullProject();
      const bundle = await exportProject(project.id);
      const design = bundle.tasks.find((t) => t.name === "設計") as Task;
      design.parentId = "missing-parent-id";

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: bundle,
      });
      expect(res.statusCode).toBe(201);
      const imported: Project = res.json();
      const tasks: Task[] = (
        await app.inject({ method: "GET", url: `/api/projects/${imported.id}/tasks` })
      ).json();
      const importedDesign = tasks.find((t) => t.name === "設計") as Task;
      expect(importedDesign.parentId).toBeNull();
    });

    it("バンドル内で重複する依存関係はスキップされ500にならない", async () => {
      const { project } = await createFullProject();
      const bundle = await exportProject(project.id);
      // export済みの依存をそのまま複製（同一 pred/succ/type → UNIQUE制約対象）
      bundle.dependencies.push({ ...(bundle.dependencies[0] as Dependency), id: "dup-dep" });

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: bundle,
      });
      expect(res.statusCode).toBe(201);
      const reExported = await exportProject(res.json().id);
      expect(reExported.dependencies).toHaveLength(2);
    });

    it("自分自身への依存を含むバンドルは400で日本語メッセージ", async () => {
      const { project, review } = await createFullProject();
      const bundle = await exportProject(project.id);
      bundle.dependencies.push({
        id: "self-dep",
        projectId: project.id,
        predecessorId: review.id,
        successorId: review.id,
        type: "FS",
        lagDays: 0,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: bundle,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("依存関係");
      expect(res.json().error).toContain("循環");
    });

    it("依存関係が循環するバンドルは400で日本語メッセージ", async () => {
      const { project, design, review } = await createFullProject();
      const bundle = await exportProject(project.id);
      // 既存: 設計→実装→レビュー。レビュー→設計を足すと循環する
      bundle.dependencies.push({
        id: "cycle-dep",
        projectId: project.id,
        predecessorId: review.id,
        successorId: design.id,
        type: "FS",
        lagDays: 0,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: bundle,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("依存関係");
      expect(res.json().error).toContain("循環");
    });

    it("親子関係が循環するバンドルは400で日本語メッセージ", async () => {
      const { project } = await createFullProject();
      const bundle = await exportProject(project.id);
      const phase = bundle.tasks.find((t) => t.name === "フェーズ1") as Task;
      const design = bundle.tasks.find((t) => t.name === "設計") as Task;
      // フェーズ1⇄設計の相互参照で循環させる
      phase.parentId = design.id;

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: bundle,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("親子関係");
      expect(res.json().error).toContain("循環");
    });

    it("バンドル内に存在しないタスクを参照する依存はスキップされる", async () => {
      const { project } = await createFullProject();
      const bundle = await exportProject(project.id);
      bundle.dependencies.push({
        id: "dep-x",
        projectId: project.id,
        predecessorId: "missing-task",
        successorId: (bundle.tasks[0] as Task).id,
        type: "FS",
        lagDays: 0,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: bundle,
      });
      expect(res.statusCode).toBe(201);
      const reExported = await exportProject(res.json().id);
      expect(reExported.dependencies).toHaveLength(2);
    });

    it("ラウンドトリップ: export→import→re-exportでタスク数・依存数・階層構造が一致しplanも取得できる", async () => {
      const { project } = await createFullProject();
      const original = await exportProject(project.id);

      const importRes = await app.inject({
        method: "POST",
        url: "/api/projects/import",
        payload: original,
      });
      expect(importRes.statusCode).toBe(201);
      const imported: Project = importRes.json();

      const reExported = await exportProject(imported.id);
      expect(reExported.tasks).toHaveLength(original.tasks.length);
      expect(reExported.dependencies).toHaveLength(original.dependencies.length);
      expect(reExported.baselines).toHaveLength(original.baselines.length);

      // 階層構造（親名→子名の組）が一致する
      function hierarchy(bundle: ExportBundle): string[] {
        const nameById = new Map(bundle.tasks.map((t) => [t.id, t.name]));
        return bundle.tasks
          .map((t) => `${t.parentId ? nameById.get(t.parentId) : "<root>"}>${t.name}`)
          .sort();
      }
      expect(hierarchy(reExported)).toEqual(hierarchy(original));

      // 依存構造（先行名→後続名・type・lag）が一致する
      function depEdges(bundle: ExportBundle): string[] {
        const nameById = new Map(bundle.tasks.map((t) => [t.id, t.name]));
        return bundle.dependencies
          .map(
            (d) =>
              `${nameById.get(d.predecessorId)}>${nameById.get(d.successorId)}:${d.type}:${d.lagDays}`,
          )
          .sort();
      }
      expect(depEdges(reExported)).toEqual(depEdges(original));

      // planが正常に計算できる
      const planRes = await app.inject({
        method: "GET",
        url: `/api/projects/${imported.id}/plan`,
      });
      expect(planRes.statusCode).toBe(200);
      const plan = planRes.json();
      expect(plan.cpm.projectDuration).toBeGreaterThan(0);
      expect(plan.tasks).toHaveLength(original.tasks.length);
      const originalPlan = (
        await app.inject({ method: "GET", url: `/api/projects/${project.id}/plan` })
      ).json();
      expect(plan.cpm.projectDuration).toBe(originalPlan.cpm.projectDuration);
      expect(plan.cpm.criticalPath).toHaveLength(originalPlan.cpm.criticalPath.length);
    });
  });
});
