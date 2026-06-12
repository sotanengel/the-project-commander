import { describe, expect, it } from "vitest";
import {
  WBS_SHORTCUTS,
  clampProgress,
  resolveWbsKeyAction,
  validateTaskEdit,
} from "./wbsViewModel.js";

describe("validateTaskEdit", () => {
  it("正常な入力は ok:true で正規化された値を返す", () => {
    const result = validateTaskEdit({ name: " 設計 ", duration: "3" });
    expect(result).toEqual({
      ok: true,
      value: { name: "設計", durationDays: 3 },
    });
  });

  it("小数の所要日数（0.5）を許可する", () => {
    const result = validateTaskEdit({ name: "実装", duration: "0.5" });
    expect(result).toEqual({
      ok: true,
      value: { name: "実装", durationDays: 0.5 },
    });
  });

  it("所要日数 0 を許可する（境界値）", () => {
    const result = validateTaskEdit({ name: "確認", duration: "0" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.durationDays).toBe(0);
  });

  it("空のタスク名はエラーになる", () => {
    const result = validateTaskEdit({ name: "", duration: "1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBe("タスク名を入力してください");
  });

  it("空白のみのタスク名はエラーになる", () => {
    const result = validateTaskEdit({ name: "   　", duration: "1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBe("タスク名を入力してください");
  });

  it("負の所要日数はエラーになる", () => {
    const result = validateTaskEdit({ name: "設計", duration: "-1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.duration).toBe("所要日数は0以上の数値で入力してください");
    }
  });

  it("数値でない所要日数はエラーになる", () => {
    const result = validateTaskEdit({ name: "設計", duration: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.duration).toBe("所要日数は0以上の数値で入力してください");
    }
  });

  it("空の所要日数はエラーになる", () => {
    const result = validateTaskEdit({ name: "設計", duration: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.duration).toBe("所要日数は0以上の数値で入力してください");
    }
  });

  it("名前と所要日数の両方が不正なら両方のエラーを返す", () => {
    const result = validateTaskEdit({ name: " ", duration: "-2" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBe("タスク名を入力してください");
      expect(result.errors.duration).toBe("所要日数は0以上の数値で入力してください");
    }
  });

  it("進捗を渡すと 0〜100 にクランプして返す（101 → 100）", () => {
    const result = validateTaskEdit({ name: "実装", duration: "1", progress: "101" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.progress).toBe(100);
  });

  it("負の進捗は 0 にクランプされる", () => {
    const result = validateTaskEdit({ name: "実装", duration: "1", progress: "-10" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.progress).toBe(0);
  });

  it("進捗が数値でない場合は 0 として扱う", () => {
    const result = validateTaskEdit({ name: "実装", duration: "1", progress: "abc" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.progress).toBe(0);
  });

  it("進捗を渡さなければ value に progress を含めない", () => {
    const result = validateTaskEdit({ name: "実装", duration: "1" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.progress).toBeUndefined();
  });
});

describe("clampProgress", () => {
  it("範囲内の値はそのまま返す", () => {
    expect(clampProgress(50)).toBe(50);
  });

  it("0 と 100 の境界値はそのまま返す", () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(100)).toBe(100);
  });

  it("101 は 100 にクランプする", () => {
    expect(clampProgress(101)).toBe(100);
  });

  it("負数は 0 にクランプする", () => {
    expect(clampProgress(-5)).toBe(0);
  });

  it("NaN は 0 にする", () => {
    expect(clampProgress(Number.NaN)).toBe(0);
  });
});

describe("resolveWbsKeyAction", () => {
  it("編集中の Enter は save", () => {
    expect(resolveWbsKeyAction({ key: "Enter", altKey: false, editing: true })).toBe("save");
  });

  it("編集中の Escape は cancel", () => {
    expect(resolveWbsKeyAction({ key: "Escape", altKey: false, editing: true })).toBe("cancel");
  });

  it("編集中でない Enter / Escape は何もしない", () => {
    expect(resolveWbsKeyAction({ key: "Enter", altKey: false, editing: false })).toBeNull();
    expect(resolveWbsKeyAction({ key: "Escape", altKey: false, editing: false })).toBeNull();
  });

  it("Alt+矢印で行操作（編集中でなくても動く）", () => {
    expect(resolveWbsKeyAction({ key: "ArrowUp", altKey: true, editing: false })).toBe("moveUp");
    expect(resolveWbsKeyAction({ key: "ArrowDown", altKey: true, editing: false })).toBe(
      "moveDown",
    );
    expect(resolveWbsKeyAction({ key: "ArrowRight", altKey: true, editing: false })).toBe("indent");
    expect(resolveWbsKeyAction({ key: "ArrowLeft", altKey: true, editing: false })).toBe("outdent");
  });

  it("Alt+矢印は編集中でも行操作になる", () => {
    expect(resolveWbsKeyAction({ key: "ArrowUp", altKey: true, editing: true })).toBe("moveUp");
  });

  it("Alt なしの矢印キーは何もしない", () => {
    expect(resolveWbsKeyAction({ key: "ArrowUp", altKey: false, editing: false })).toBeNull();
    expect(resolveWbsKeyAction({ key: "ArrowDown", altKey: false, editing: true })).toBeNull();
  });

  it("対象外のキーは null", () => {
    expect(resolveWbsKeyAction({ key: "a", altKey: true, editing: true })).toBeNull();
  });
});

describe("WBS_SHORTCUTS", () => {
  it("凡例に必要なショートカットが定義されている", () => {
    const keys = WBS_SHORTCUTS.map((s) => s.keys);
    expect(keys).toContain("Enter");
    expect(keys).toContain("Esc");
    expect(keys).toContain("Alt+↑ / Alt+↓");
    expect(keys).toContain("Alt+→ / Alt+←");
  });
});
