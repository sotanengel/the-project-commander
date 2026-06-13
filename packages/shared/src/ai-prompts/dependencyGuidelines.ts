/** 依存関係提案の品質ルール */
export const DEPENDENCY_GUIDELINES = [
  "依存関係は葉タスク（ワークパッケージ）の name のみで指定する。フェーズ名は使わない。",
  "基本は FS（完了→開始）。同一フェーズ内の並行作業は SS + lagDays で表現する。",
  "循環しない DAG を構成し、プロジェクト完了に向かうチェーンを必ず含める。",
  "predecessorName / successorName は tasks 内の葉タスク名と完全一致させる。",
  "1タスクあたりの先行は1〜2本程度に抑え、過剰な依存は避ける。",
].join("\n- ");
