/** リスク洗い出しの品質ルール */
export const RISK_GUIDELINES = [
  "プロジェクト概要から具体的なリスクを5件以上列挙する。",
  "title は簡潔に、probability / impact は low|medium|high を指定する。",
  "response（対応方針）は必須。回避・軽減・受容のいずれかを明示する。",
  "スケジュール・コスト・品質・関係者・外部依存の観点をカバーする。",
].join("\n- ");
