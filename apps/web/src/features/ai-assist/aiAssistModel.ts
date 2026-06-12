import { AiImportError } from "./importLogic.js";

// ---- ステップ定義 ----

export interface StepDefinition {
  /** 表示用のステップ番号（①〜⑤） */
  number: number;
  title: string;
  description: string;
}

/** AIアシストの5ステップ（①目的→②コピー→③貼り付け→④プレビュー→⑤取り込み） */
export const AI_ASSIST_STEPS: readonly StepDefinition[] = [
  {
    number: 1,
    title: "目的を選ぶ",
    description: "AIに何を手伝ってもらうかを選びます。選ぶとプロンプトが自動で作られます。",
  },
  {
    number: 2,
    title: "プロンプトをコピー",
    description: "作られたプロンプトをコピーして、ChatGPT等のAIに貼り付けて送信します。",
  },
  {
    number: 3,
    title: "AIの返答を貼り付け",
    description: "AIが返したメッセージ全体を、そのまま下の欄に貼り付けます。",
  },
  {
    number: 4,
    title: "プレビュー確認",
    description: "取り込まれる内容を事前に確認します。この時点ではまだ反映されません。",
  },
  {
    number: 5,
    title: "取り込み",
    description: "プレビューの内容で良ければ取り込みます。結果はここに表示されます。",
  },
];

// ---- ステップ状態の判定 ----

export type StepStatus = "done" | "current" | "upcoming";

export interface StepFlags {
  /** 目的が選択されているか */
  purposeSelected: boolean;
  /** プロンプトをコピーしたか */
  promptCopied: boolean;
  /** AIの返答が貼り付けられているか */
  responsePasted: boolean;
  /** プレビューが表示されているか */
  previewReady: boolean;
  /** 取り込みを実行したか */
  imported: boolean;
}

/**
 * 各ステップの進行状態を導出する。
 * - 完了フラグが立っているステップは "done"
 * - 未完了のうち最初のステップが "current"（現在地）
 * - それ以外の未完了は "upcoming"
 * 順番を飛ばして完了したステップも "done" のまま表示する（操作は強制しない）。
 */
export function deriveStepStates(flags: StepFlags): StepStatus[] {
  const doneFlags = [
    flags.purposeSelected,
    flags.promptCopied,
    flags.responsePasted,
    flags.previewReady,
    flags.imported,
  ];
  const currentIndex = doneFlags.indexOf(false);
  return doneFlags.map((done, index) => {
    if (done) return "done";
    return index === currentIndex ? "current" : "upcoming";
  });
}

// ---- 失敗理由の平易化 ----

/**
 * 取り込み失敗のエラーを、原因と次にすべきことが分かる日本語に変換する。
 * AiImportError の kind に応じて変換し、それ以外のErrorはメッセージをそのまま使う。
 */
export function formatImportError(error: unknown): string {
  if (error instanceof AiImportError) {
    switch (error.kind) {
      case "empty":
        return "AIの返答が貼り付けられていません。AIの返答全体を貼り付けてください。";
      case "no_json":
        return "AIの返答からJSONを見つけられませんでした。返答全体を貼り付けているか確認してください。";
      case "truncated":
        return "AIの返答のJSONが途中で終わっています。返答の最後までコピーして貼り付けているか確認してください。";
      case "parse_failed":
        return "AIの返答のJSONを読み取れませんでした。返答全体をそのまま貼り付けているか確認してください。";
      case "schema_mismatch": {
        const detail =
          error.missing.length > 0
            ? `（不足項目: ${error.missing.join("、")}）`
            : error.details
              ? `（${error.details}）`
              : "";
        return `JSONの形式が想定と異なります${detail}。プロンプトを変えずにそのまま使ったか確認してください。`;
      }
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "JSONの検証に失敗しました。貼り付けた内容を確認してください。";
}
