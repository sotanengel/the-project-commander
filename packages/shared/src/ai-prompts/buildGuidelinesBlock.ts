import { DEPENDENCY_GUIDELINES } from "./dependencyGuidelines.js";
import { MILESTONE_GUIDELINES } from "./milestoneGuidelines.js";
import { RISK_GUIDELINES } from "./riskGuidelines.js";
import { STAKEHOLDER_GUIDELINES } from "./stakeholderGuidelines.js";
import { WBS_GUIDELINES } from "./wbsGuidelines.js";

/** フル計画プロンプト用のガイドライン本文 */
export function buildPromptGuidelinesBlock(): string {
  return [
    "【WBS生成ルール】",
    `- ${WBS_GUIDELINES}`,
    "",
    "【依存関係ルール】",
    `- ${DEPENDENCY_GUIDELINES}`,
    "",
    "【マイルストーンルール】",
    `- ${MILESTONE_GUIDELINES}`,
    "",
    "【リスクルール】",
    `- ${RISK_GUIDELINES}`,
    "",
    "【関係者ルール】",
    `- ${STAKEHOLDER_GUIDELINES}`,
  ].join("\n");
}
