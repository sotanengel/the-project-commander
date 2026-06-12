import type { Task } from "@tpc/shared";
import { describe, expect, it } from "vitest";
import {
  DEPENDENCY_TYPE_OPTIONS,
  cycleDependencyMessage,
  duplicateDependencyMessage,
  edgeLabel,
  findCyclePath,
  findDuplicateDependency,
  leafTasksInWbsOrder,
} from "./networkModel.js";

describe("edgeLabel", () => {
  it("FSかつラグ0はラベルなし（null）", () => {
    expect(edgeLabel("FS", 0)).toBeNull();
  });

  it("FS以外のタイプはラグ0でもタイプのみ表示する", () => {
    expect(edgeLabel("SS", 0)).toBe("SS");
    expect(edgeLabel("FF", 0)).toBe("FF");
    expect(edgeLabel("SF", 0)).toBe("SF");
  });

  it("正のラグは「タイプ+ラグ」形式", () => {
    expect(edgeLabel("SS", 2)).toBe("SS+2");
    expect(edgeLabel("FF", 10)).toBe("FF+10");
  });

  it("負のラグ（リード）は「タイプ-ラグ」形式", () => {
    expect(edgeLabel("FS", -1)).toBe("FS-1");
    expect(edgeLabel("SF", -3)).toBe("SF-3");
  });

  it("FSでもラグがあればラベルを表示する", () => {
    expect(edgeLabel("FS", 5)).toBe("FS+5");
  });
});

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    projectId: "p1",
    parentId: null,
    name: partial.id,
    description: "",
    durationDays: 1,
    progress: 0,
    assignee: "",
    sortOrder: 0,
    ...partial,
  };
}

describe("leafTasksInWbsOrder", () => {
  it("葉タスク（子を持たないタスク）のみをWBS順（深さ優先・sortOrder順）で返す", () => {
    const tasks: Task[] = [
      task({ id: "B", sortOrder: 1 }),
      task({ id: "A", sortOrder: 0 }),
      task({ id: "A2", parentId: "A", sortOrder: 1 }),
      task({ id: "A1", parentId: "A", sortOrder: 0 }),
      task({ id: "B1", parentId: "B", sortOrder: 0 }),
    ];
    expect(leafTasksInWbsOrder(tasks).map((t) => t.id)).toEqual(["A1", "A2", "B1"]);
  });

  it("サマリタスク（子を持つタスク）は含まれない", () => {
    const tasks: Task[] = [
      task({ id: "root", sortOrder: 0 }),
      task({ id: "child", parentId: "root", sortOrder: 0 }),
    ];
    const leaves = leafTasksInWbsOrder(tasks);
    expect(leaves.map((t) => t.id)).toEqual(["child"]);
  });

  it("空配列なら空配列を返す", () => {
    expect(leafTasksInWbsOrder([])).toEqual([]);
  });
});

/** テスト用の依存関係を作る（重複・循環判定に必要なフィールドのみ） */
function dep(predecessorId: string, successorId: string) {
  return { predecessorId, successorId };
}

describe("DEPENDENCY_TYPE_OPTIONS のタイプ選択ガイド", () => {
  it("4タイプすべてに平易なガイド文（guide）がある", () => {
    expect(DEPENDENCY_TYPE_OPTIONS).toHaveLength(4);
    for (const opt of DEPENDENCY_TYPE_OPTIONS) {
      expect(opt.guide.length).toBeGreaterThan(0);
    }
  });

  it("FSのガイドには「迷ったらこれ」と推奨が分かる文言が入っている", () => {
    const fs = DEPENDENCY_TYPE_OPTIONS.find((o) => o.value === "FS");
    expect(fs?.guide).toContain("迷ったらこれ");
    expect(fs?.guide).toContain("最も一般的");
  });

  it("SFのガイドには稀である旨が入っている", () => {
    const sf = DEPENDENCY_TYPE_OPTIONS.find((o) => o.value === "SF");
    expect(sf?.guide).toContain("稀");
  });
});

describe("findDuplicateDependency", () => {
  it("同じ（先行,後続）ペアの既存依存を返す", () => {
    const deps = [dep("A", "B"), dep("B", "C")];
    expect(findDuplicateDependency(deps, "A", "B")).toBe(deps[0]);
  });

  it("既存にないペアなら null を返す", () => {
    expect(findDuplicateDependency([dep("A", "B")], "A", "C")).toBeNull();
  });

  it("逆向きのペア（B→A）は重複とみなさない", () => {
    expect(findDuplicateDependency([dep("A", "B")], "B", "A")).toBeNull();
  });

  it("依存が空なら null を返す", () => {
    expect(findDuplicateDependency([], "A", "B")).toBeNull();
  });
});

describe("findCyclePath", () => {
  it("直接の逆向き依存（B→A があるとき A→B 追加）で循環経路を返す", () => {
    expect(findCyclePath([dep("B", "A")], "A", "B")).toEqual(["B", "A"]);
  });

  it("間接的な循環（B→C→A があるとき A→B 追加）で経路を返す", () => {
    expect(findCyclePath([dep("B", "C"), dep("C", "A")], "A", "B")).toEqual(["B", "C", "A"]);
  });

  it("循環しない依存なら null を返す", () => {
    expect(findCyclePath([dep("A", "B")], "B", "C")).toBeNull();
    expect(findCyclePath([], "A", "B")).toBeNull();
  });

  it("分岐があっても先行タスクへ到達する経路を見つける", () => {
    const deps = [dep("B", "X"), dep("B", "C"), dep("C", "A")];
    expect(findCyclePath(deps, "A", "B")).toEqual(["B", "C", "A"]);
  });

  it("自己ループ（先行=後続）は経路 [同一ID] を返す", () => {
    expect(findCyclePath([], "A", "A")).toEqual(["A"]);
  });
});

describe("duplicateDependencyMessage", () => {
  it("タスク名入りで既に登録済みであることを伝える", () => {
    const msg = duplicateDependencyMessage("設計", "実装");
    expect(msg).toContain("設計");
    expect(msg).toContain("実装");
    expect(msg).toContain("既に登録されています");
  });
});

describe("cycleDependencyMessage", () => {
  it("追加しようとした依存のタスク名と解決ヒントを含む", () => {
    const msg = cycleDependencyMessage("設計", "実装");
    expect(msg).toContain("設計 → 実装");
    expect(msg).toContain("ループ");
    expect(msg).toContain("逆向きの依存を削除");
  });

  it("循環経路（タスク名の並び）があれば既存の経路も表示する", () => {
    const msg = cycleDependencyMessage("A", "B", ["B", "C", "A"]);
    expect(msg).toContain("A → B");
    expect(msg).toContain("B → C → A");
  });
});
