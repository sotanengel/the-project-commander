import type { DependencyCreateInput } from "../types.js";

export interface DependencyImportItem {
  predecessorName: string;
  successorName: string;
  type?: "FS" | "SS" | "FF" | "SF";
  lagDays?: number;
}

export interface ResolvedDependency {
  label: string;
  input: DependencyCreateInput;
}

export interface ImportFailure {
  label: string;
  reason: string;
}

export interface DependencyResolution {
  resolved: ResolvedDependency[];
  failures: ImportFailure[];
}

/**
 * 依存関係のタスク名をタスクIDに解決する。
 * 見つからない名前・同名タスクが複数あって特定できない名前がある依存は
 * 理由付きで failures に入れ、残りの解決は続行する。
 */
export function resolveDependenciesByName(
  dependencies: DependencyImportItem[],
  tasks: { id: string; name: string }[],
): DependencyResolution {
  const byName = new Map<string, string | null>();
  for (const task of tasks) {
    byName.set(task.name, byName.has(task.name) ? null : task.id);
  }
  const resolved: ResolvedDependency[] = [];
  const failures: ImportFailure[] = [];
  for (const dep of dependencies) {
    const label = `${dep.predecessorName} → ${dep.successorName}`;
    const names = [dep.predecessorName, dep.successorName];
    const missing = names.filter((name) => !byName.has(name));
    if (missing.length > 0) {
      failures.push({ label, reason: `タスク名が見つかりません: ${missing.join("、")}` });
      continue;
    }
    const ambiguous = names.filter((name) => byName.get(name) === null);
    if (ambiguous.length > 0) {
      failures.push({
        label,
        reason: `同名のタスクが複数あるため特定できません: ${ambiguous.join("、")}`,
      });
      continue;
    }
    const predecessorId = byName.get(dep.predecessorName) as string;
    const successorId = byName.get(dep.successorName) as string;
    resolved.push({
      label,
      input: { predecessorId, successorId, type: dep.type, lagDays: dep.lagDays },
    });
  }
  return { resolved, failures };
}
