import type { CpmResult, Task } from "@tpc/shared";
import { describe, expect, it } from "vitest";
import {
  DEPENDENCY_TYPE_OPTIONS,
  LAYOUT_COL_WIDTH,
  LAYOUT_PADDING,
  LAYOUT_ROW_GAP,
  NODE_HEIGHT,
  NODE_MAX_WIDTH,
  NODE_MIN_WIDTH,
  buildEdgePolyline,
  clampNetworkZoom,
  computeFitScale,
  cycleDependencyMessage,
  duplicateDependencyMessage,
  edgeLabel,
  estimateNodeWidth,
  findCyclePath,
  findDuplicateDependency,
  layoutNetworkGraph,
  leafTasksInWbsOrder,
  zoomInScale,
  zoomOutScale,
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

describe("estimateNodeWidth", () => {
  it("短い名称は最小幅", () => {
    expect(estimateNodeWidth("A")).toBe(NODE_MIN_WIDTH);
  });

  it("長い名称は上限まで広がる", () => {
    const longName = "お台場会場候補リストアップ・予算比較";
    expect(estimateNodeWidth(longName)).toBe(NODE_MAX_WIDTH);
  });
});

describe("layoutNetworkGraph", () => {
  const leaves: Task[] = [
    task({ id: "A", name: "タスクA", durationDays: 3, sortOrder: 0 }),
    task({ id: "B", name: "タスクB", durationDays: 2, sortOrder: 1 }),
    task({ id: "C", name: "タスクC", durationDays: 4, sortOrder: 2 }),
  ];

  const cpm: CpmResult = {
    projectDuration: 9,
    criticalPath: ["A", "B", "C"],
    tasks: [
      {
        taskId: "A",
        earlyStart: 0,
        earlyFinish: 3,
        lateStart: 0,
        lateFinish: 3,
        totalFloat: 0,
        freeFloat: 0,
        isCritical: true,
      },
      {
        taskId: "B",
        earlyStart: 0,
        earlyFinish: 2,
        lateStart: 0,
        lateFinish: 2,
        totalFloat: 0,
        freeFloat: 0,
        isCritical: true,
      },
      {
        taskId: "C",
        earlyStart: 3,
        earlyFinish: 7,
        lateStart: 3,
        lateFinish: 7,
        totalFloat: 0,
        freeFloat: 0,
        isCritical: true,
      },
    ],
  };

  it("空なら null", () => {
    expect(layoutNetworkGraph([], cpm, [])).toBeNull();
  });

  it("earlyStart 列で X を配置する", () => {
    const layout = layoutNetworkGraph(leaves, cpm, []);
    expect(layout).not.toBeNull();
    if (!layout) return;
    const nodeA = layout.nodes.find((n) => n.task.id === "A");
    const nodeC = layout.nodes.find((n) => n.task.id === "C");
    expect(nodeA?.x).toBe(LAYOUT_PADDING);
    expect(nodeC?.x).toBe(3 * LAYOUT_COL_WIDTH + LAYOUT_PADDING);
  });

  it("同一 earlyStart 内は縦に積み重ならない", () => {
    const layout = layoutNetworkGraph(leaves, cpm, []);
    expect(layout).not.toBeNull();
    if (!layout) return;
    const nodeA = layout.nodes.find((n) => n.task.id === "A");
    const nodeB = layout.nodes.find((n) => n.task.id === "B");
    expect(nodeB?.y).toBe((nodeA?.y ?? 0) + NODE_HEIGHT + LAYOUT_ROW_GAP);
  });

  it("依存エッジを L 字 polyline で生成する", () => {
    const deps = [
      {
        id: "d1",
        projectId: "p1",
        predecessorId: "A",
        successorId: "C",
        type: "FS" as const,
        lagDays: 0,
      },
    ];
    const layout = layoutNetworkGraph(leaves, cpm, deps);
    expect(layout).not.toBeNull();
    if (!layout) return;
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0]?.points).toMatch(/^\d+,\d+ \d+,\d+ \d+,\d+ \d+,\d+$/);
  });
});

describe("buildEdgePolyline", () => {
  it("4点の L 字 points を返す", () => {
    const from = {
      task: task({ id: "A" }),
      x: 40,
      y: 40,
      width: 120,
      height: 56,
      critical: false,
      float: 0,
      sublabel: "",
    };
    const to = {
      task: task({ id: "B" }),
      x: 300,
      y: 100,
      width: 120,
      height: 56,
      critical: false,
      float: 0,
      sublabel: "",
    };
    const points = buildEdgePolyline(from, to);
    expect(points.split(" ")).toHaveLength(4);
  });
});

describe("computeFitScale", () => {
  it("コンテンツがビューポートより大きい場合は縮小倍率を返す", () => {
    const scale = computeFitScale(500, 400, 1000, 800, 16);
    expect(scale).toBeCloseTo(0.48);
  });

  it("コンテンツがビューポートより小さい場合は拡大倍率を返す", () => {
    const scale = computeFitScale(500, 400, 200, 100, 16);
    expect(scale).toBeCloseTo(2.42);
  });
});

describe("clampNetworkZoom", () => {
  it("下限・上限でクランプする", () => {
    expect(clampNetworkZoom(0.1)).toBe(0.25);
    expect(clampNetworkZoom(5)).toBe(3);
    expect(clampNetworkZoom(1)).toBe(1);
  });
});

describe("zoomInScale / zoomOutScale", () => {
  it("拡大・縮小が step 倍率で変化する", () => {
    expect(zoomInScale(1)).toBeCloseTo(1.25);
    expect(zoomOutScale(1)).toBeCloseTo(0.8);
  });
});
