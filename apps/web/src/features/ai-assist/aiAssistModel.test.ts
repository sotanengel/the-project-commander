import { describe, expect, it } from "vitest";
import {
  AI_ASSIST_STEPS,
  type StepFlags,
  deriveStepStates,
  formatImportError,
} from "./aiAssistModel.js";
import { AiImportError } from "./importLogic.js";

const baseFlags: StepFlags = {
  purposeSelected: false,
  promptCopied: false,
  responsePasted: false,
  previewReady: false,
  imported: false,
};

describe("AI_ASSIST_STEPS", () => {
  it("①〜⑤の5ステップのタイトルを定義する", () => {
    expect(AI_ASSIST_STEPS).toHaveLength(5);
    expect(AI_ASSIST_STEPS.map((s) => s.title)).toEqual([
      "目的を選ぶ",
      "プロンプトをコピー",
      "AIの返答を貼り付け",
      "プレビュー確認",
      "取り込み",
    ]);
  });
});

describe("deriveStepStates", () => {
  it("何も進んでいないときはステップ1が現在地", () => {
    expect(deriveStepStates(baseFlags)).toEqual([
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("目的選択済みならステップ2が現在地", () => {
    expect(deriveStepStates({ ...baseFlags, purposeSelected: true })).toEqual([
      "done",
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("コピー済みならステップ3が現在地", () => {
    expect(deriveStepStates({ ...baseFlags, purposeSelected: true, promptCopied: true })).toEqual([
      "done",
      "done",
      "current",
      "upcoming",
      "upcoming",
    ]);
  });

  it("貼り付け済みならステップ4が現在地", () => {
    expect(
      deriveStepStates({
        ...baseFlags,
        purposeSelected: true,
        promptCopied: true,
        responsePasted: true,
      }),
    ).toEqual(["done", "done", "done", "current", "upcoming"]);
  });

  it("プレビュー済みならステップ5が現在地", () => {
    expect(
      deriveStepStates({
        ...baseFlags,
        purposeSelected: true,
        promptCopied: true,
        responsePasted: true,
        previewReady: true,
      }),
    ).toEqual(["done", "done", "done", "done", "current"]);
  });

  it("すべて完了したら現在地は無くすべて完了表示", () => {
    expect(
      deriveStepStates({
        purposeSelected: true,
        promptCopied: true,
        responsePasted: true,
        previewReady: true,
        imported: true,
      }),
    ).toEqual(["done", "done", "done", "done", "done"]);
  });

  it("順番を飛ばしても完了したステップは完了として表示する", () => {
    // コピーせずに貼り付けた場合（上級者の操作）
    expect(deriveStepStates({ ...baseFlags, purposeSelected: true, responsePasted: true })).toEqual(
      ["done", "current", "done", "upcoming", "upcoming"],
    );
  });

  it("取り込み完了後に入力がクリアされてもステップ5は完了のまま", () => {
    expect(
      deriveStepStates({
        ...baseFlags,
        purposeSelected: true,
        promptCopied: true,
        imported: true,
      }),
    ).toEqual(["done", "done", "current", "upcoming", "done"]);
  });
});

describe("formatImportError", () => {
  it("入力が空のとき: 貼り付けを促す", () => {
    const error = new AiImportError("empty", "入力が空です。");
    expect(formatImportError(error)).toBe(
      "AIの返答が貼り付けられていません。AIの返答全体を貼り付けてください。",
    );
  });

  it("JSON未検出のとき: 返答全体の貼り付け確認を促す", () => {
    const error = new AiImportError("no_json", "JSONオブジェクトが見つかりません。");
    expect(formatImportError(error)).toBe(
      "AIの返答からJSONを見つけられませんでした。返答全体を貼り付けているか確認してください。",
    );
  });

  it("JSONが途中で切れているとき: コピー漏れの確認を促す", () => {
    const error = new AiImportError("truncated", "JSONが途中で終わっています。");
    expect(formatImportError(error)).toBe(
      "AIの返答のJSONが途中で終わっています。返答の最後までコピーして貼り付けているか確認してください。",
    );
  });

  it("JSON解析失敗のとき: 返答全体の貼り付け確認を促す", () => {
    const error = new AiImportError("parse_failed", "JSONの解析に失敗しました: x");
    expect(formatImportError(error)).toBe(
      "AIの返答のJSONを読み取れませんでした。返答全体をそのまま貼り付けているか確認してください。",
    );
  });

  it("スキーマ不一致のとき: 不足項目を添えて案内する", () => {
    const error = new AiImportError("schema_mismatch", "JSONの形式が正しくありません", {
      missing: ["tasks.0.name", "tasks.1.name"],
    });
    expect(formatImportError(error)).toBe(
      "JSONの形式が想定と異なります（不足項目: tasks.0.name、tasks.1.name）。プロンプトを変えずにそのまま使ったか確認してください。",
    );
  });

  it("スキーマ不一致で不足項目が特定できないとき: 詳細を添えて案内する", () => {
    const error = new AiImportError("schema_mismatch", "JSONの形式が正しくありません", {
      details: "tasks.0.name: Expected string, received number",
    });
    expect(formatImportError(error)).toBe(
      "JSONの形式が想定と異なります（tasks.0.name: Expected string, received number）。プロンプトを変えずにそのまま使ったか確認してください。",
    );
  });

  it("スキーマ不一致で詳細が無いとき: 案内のみ表示する", () => {
    const error = new AiImportError("schema_mismatch", "JSONの形式が正しくありません");
    expect(formatImportError(error)).toBe(
      "JSONの形式が想定と異なります。プロンプトを変えずにそのまま使ったか確認してください。",
    );
  });

  it("通常のErrorはそのままメッセージを返す", () => {
    expect(formatImportError(new Error("ネットワークエラー"))).toBe("ネットワークエラー");
  });

  it("Error以外は汎用メッセージを返す", () => {
    expect(formatImportError("oops")).toBe(
      "JSONの検証に失敗しました。貼り付けた内容を確認してください。",
    );
  });
});
