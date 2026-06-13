import { describe, expect, it } from "vitest";
import {
  AiImportError,
  buildExportFileName,
  countTasks,
  extractJson,
  flattenTasks,
  importOneByOne,
  parseAiResponse,
  resolveDependencies,
} from "./importLogic.js";

describe("extractJson", () => {
  it("素のJSONをパースする", () => {
    expect(extractJson('{ "tasks": [] }')).toEqual({ tasks: [] });
  });

  it("```json フェンス付きのJSONをパースする", () => {
    const text = '```json\n{ "tasks": [{ "name": "設計" }] }\n```';
    expect(extractJson(text)).toEqual({ tasks: [{ name: "設計" }] });
  });

  it("``` のみのフェンスでもパースする", () => {
    const text = '```\n{ "risks": [] }\n```';
    expect(extractJson(text)).toEqual({ risks: [] });
  });

  it("前後の説明文を除去してパースする", () => {
    const text = [
      "はい、以下がWBSのドラフトです。",
      "```json",
      '{ "tasks": [{ "name": "要件定義", "children": [{ "name": "ヒアリング" }] }] }',
      "```",
      "ご確認ください。他に必要な調整があればお知らせください。",
    ].join("\n");
    expect(extractJson(text)).toEqual({
      tasks: [{ name: "要件定義", children: [{ name: "ヒアリング" }] }],
    });
  });

  it("文字列中の波括弧やフェンスに惑わされない", () => {
    const text = '結果: { "tasks": [{ "name": "x } y", "description": "a { b" }] } 以上です。';
    expect(extractJson(text)).toEqual({ tasks: [{ name: "x } y", description: "a { b" }] });
  });

  it("文字列中のエスケープされた引用符を正しく扱う", () => {
    const text = '{ "tasks": [{ "name": "say \\"hi\\" {ok}" }] }';
    expect(extractJson(text)).toEqual({ tasks: [{ name: 'say "hi" {ok}' }] });
  });

  it("前置きにJSONでない波括弧があっても後続のJSONを抽出する", () => {
    const text = '手順{1}に従い作成しました。\n```json\n{ "tasks": [{ "name": "設計" }] }\n```';
    expect(extractJson(text)).toEqual({ tasks: [{ name: "設計" }] });
  });

  it("前置きに別のJSON断片があってもフェンス内のJSONを優先する", () => {
    const text = [
      '出力形式 {} に従い、サンプル { "tasks": [] } を参考に作成しました。',
      "```json",
      '{ "tasks": [{ "name": "設計" }] }',
      "```",
    ].join("\n");
    expect(extractJson(text)).toEqual({ tasks: [{ name: "設計" }] });
  });

  it("フェンス内が壊れている場合は全体からの抽出にフォールバックする", () => {
    const text = '```json\n{ 壊れたJSON\n```\n正しくは { "tasks": [] } です。';
    expect(extractJson(text)).toEqual({ tasks: [] });
  });

  it("空入力では日本語エラーを投げる", () => {
    expect(() => extractJson("")).toThrow("入力が空です");
    expect(() => extractJson("   \n  ")).toThrow("入力が空です");
  });

  it("JSONオブジェクトが無い場合は日本語エラーを投げる", () => {
    expect(() => extractJson("ここにはJSONがありません")).toThrow(
      "JSONオブジェクトが見つかりません",
    );
  });

  it("閉じ括弧が不足している場合は日本語エラーを投げる", () => {
    expect(() => extractJson('{ "tasks": [')).toThrow("途中で終わっています");
  });

  it("構文エラーのJSONは解析失敗エラーを投げる", () => {
    expect(() => extractJson('{ "tasks": [}, }')).toThrow("JSONの解析に失敗しました");
  });

  it("失敗の種類をAiImportErrorのkindで区別できる", () => {
    const kindOf = (input: string): string => {
      try {
        extractJson(input);
        return "(no error)";
      } catch (e) {
        return e instanceof AiImportError ? e.kind : "(not AiImportError)";
      }
    };
    expect(kindOf("")).toBe("empty");
    expect(kindOf("ここにはJSONがありません")).toBe("no_json");
    expect(kindOf('{ "tasks": [')).toBe("truncated");
    expect(kindOf('{ "tasks": [}, }')).toBe("parse_failed");
  });
});

describe("parseAiResponse", () => {
  it("wbs_draft: 階層タスクをパースする", () => {
    const text = '```json\n{ "tasks": [{ "name": "P1", "children": [{ "name": "WP1" }] }] }\n```';
    const result = parseAiResponse(text, "wbs_draft");
    expect(result).toEqual({
      kind: "tasks",
      tasks: [{ name: "P1", children: [{ name: "WP1" }] }],
    });
  });

  it("task_breakdown: タスク配列をパースする", () => {
    const result = parseAiResponse(
      '{ "tasks": [{ "name": "A", "durationDays": 2 }] }',
      "task_breakdown",
    );
    expect(result).toEqual({ kind: "tasks", tasks: [{ name: "A", durationDays: 2 }] });
  });

  it("risk_identify: リスク配列をパースする", () => {
    const result = parseAiResponse(
      '{ "risks": [{ "title": "遅延", "probability": "high", "impact": "medium", "response": "バッファを確保" }] }',
      "risk_identify",
    );
    expect(result).toEqual({
      kind: "risks",
      risks: [{ title: "遅延", probability: "high", impact: "medium", response: "バッファを確保" }],
    });
  });

  it("milestones: マイルストーン配列をパースする", () => {
    const result = parseAiResponse(
      '{ "milestones": [{ "name": "要件確定", "dueDate": "2027-06-01", "status": "pending" }] }',
      "milestones",
    );
    expect(result).toEqual({
      kind: "milestones",
      milestones: [{ name: "要件確定", dueDate: "2027-06-01", status: "pending" }],
    });
  });

  it("stakeholders: 関係者配列をパースする", () => {
    const result = parseAiResponse(
      '{ "stakeholders": [{ "name": "山田", "role": "スポンサー", "influence": "high", "interest": "high" }] }',
      "stakeholders",
    );
    expect(result).toEqual({
      kind: "stakeholders",
      stakeholders: [{ name: "山田", role: "スポンサー", influence: "high", interest: "high" }],
    });
  });

  it("dependencies: 依存配列をパースする", () => {
    const result = parseAiResponse(
      '{ "dependencies": [{ "predecessorName": "A", "successorName": "B", "type": "FS" }] }',
      "dependencies",
    );
    expect(result).toEqual({
      kind: "dependencies",
      dependencies: [{ predecessorName: "A", successorName: "B", type: "FS" }],
    });
  });

  it("スキーマ不一致は項目パス付きの日本語エラーを投げる", () => {
    expect(() => parseAiResponse('{ "tasks": [{ "name": 123 }] }', "wbs_draft")).toThrow(
      /JSONの形式が正しくありません/,
    );
    expect(() => parseAiResponse('{ "risks": "oops" }', "risk_identify")).toThrow(
      /JSONの形式が正しくありません/,
    );
  });

  it("スキーマ不一致はAiImportError(schema_mismatch)として不足項目を持つ", () => {
    const errorOf = (input: string, purpose: Parameters<typeof parseAiResponse>[1]) => {
      try {
        parseAiResponse(input, purpose);
        return null;
      } catch (e) {
        return e instanceof AiImportError ? e : null;
      }
    };

    // 必須キー自体が無い
    const missingRoot = errorOf('{ "risks": [] }', "wbs_draft");
    expect(missingRoot?.kind).toBe("schema_mismatch");
    expect(missingRoot?.missing).toEqual(["tasks"]);

    // 配列要素の必須項目が無い
    const missingName = errorOf('{ "tasks": [{ "durationDays": 3 }] }', "wbs_draft");
    expect(missingName?.kind).toBe("schema_mismatch");
    expect(missingName?.missing).toEqual(["tasks.0.name"]);

    // 型違い（不足ではない）の場合は missing は空で details に内容が入る
    const wrongType = errorOf('{ "tasks": [{ "name": 123 }] }', "wbs_draft");
    expect(wrongType?.kind).toBe("schema_mismatch");
    expect(wrongType?.missing).toEqual([]);
    expect(wrongType?.details).toContain("tasks.0.name");
  });
});

describe("flattenTasks / countTasks", () => {
  const tasks = [
    {
      name: "フェーズ1",
      children: [
        { name: "WP1", durationDays: 3 },
        { name: "WP2", children: [{ name: "WP2-1" }] },
      ],
    },
    { name: "フェーズ2" },
  ];

  it("階層を深さ付きでフラット化する", () => {
    expect(flattenTasks(tasks)).toEqual([
      { name: "フェーズ1", depth: 0, durationDays: undefined },
      { name: "WP1", depth: 1, durationDays: 3 },
      { name: "WP2", depth: 1, durationDays: undefined },
      { name: "WP2-1", depth: 2, durationDays: undefined },
      { name: "フェーズ2", depth: 0, durationDays: undefined },
    ]);
  });

  it("子孫を含めた総数を数える", () => {
    expect(countTasks(tasks)).toBe(5);
    expect(countTasks([])).toBe(0);
  });
});

describe("resolveDependencies", () => {
  const tasks = [
    { id: "t1", name: "設計" },
    { id: "t2", name: "実装" },
  ];

  it("タスク名をIDに解決する", () => {
    const result = resolveDependencies(
      [{ predecessorName: "設計", successorName: "実装", type: "FS" as const, lagDays: 1 }],
      tasks,
    );
    expect(result.resolved).toEqual([
      {
        label: "設計 → 実装",
        input: { predecessorId: "t1", successorId: "t2", type: "FS", lagDays: 1 },
      },
    ]);
    expect(result.failures).toEqual([]);
  });

  it("名前が見つからない依存は理由付きで失敗にする（他は続行）", () => {
    const result = resolveDependencies(
      [
        { predecessorName: "設計", successorName: "テスト" },
        { predecessorName: "実装", successorName: "設計" },
        { predecessorName: "謎", successorName: "謎2" },
      ],
      tasks,
    );
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]?.label).toBe("実装 → 設計");
    expect(result.failures).toEqual([
      { label: "設計 → テスト", reason: "タスク名が見つかりません: テスト" },
      { label: "謎 → 謎2", reason: "タスク名が見つかりません: 謎、謎2" },
    ]);
  });

  it("同名タスクが複数ある場合は曖昧として失敗にする", () => {
    const duplicated = [
      { id: "t1", name: "設計" },
      { id: "t2", name: "実装" },
      { id: "t3", name: "実装" },
    ];
    const result = resolveDependencies(
      [{ predecessorName: "設計", successorName: "実装" }],
      duplicated,
    );
    expect(result.resolved).toEqual([]);
    expect(result.failures).toEqual([
      { label: "設計 → 実装", reason: "同名のタスクが複数あるため特定できません: 実装" },
    ]);
  });
});

describe("importOneByOne", () => {
  it("成功・失敗を集計し、失敗してもスキップして続行する", async () => {
    const calls: string[] = [];
    const result = await importOneByOne(
      ["A", "B", "C"],
      (item) => item,
      async (item) => {
        calls.push(item);
        if (item === "B") throw new Error("409: 循環依存になります");
      },
    );
    expect(calls).toEqual(["A", "B", "C"]);
    expect(result).toEqual({
      succeeded: 2,
      failed: 1,
      failures: [{ label: "B", reason: "409: 循環依存になります" }],
    });
  });

  it("事前失敗（名前解決エラー等）を集計に含める", async () => {
    const result = await importOneByOne(
      ["A"],
      (item) => item,
      async () => undefined,
      [{ label: "X → Y", reason: "タスク名が見つかりません: X" }],
    );
    expect(result).toEqual({
      succeeded: 1,
      failed: 1,
      failures: [{ label: "X → Y", reason: "タスク名が見つかりません: X" }],
    });
  });

  it("Error以外のthrowは不明なエラーとして扱う", async () => {
    const result = await importOneByOne(
      ["A"],
      (item) => item,
      async () => {
        throw "oops";
      },
    );
    expect(result).toEqual({
      succeeded: 0,
      failed: 1,
      failures: [{ label: "A", reason: "不明なエラー" }],
    });
  });
});

describe("buildExportFileName", () => {
  it("プロジェクト名.json を返す", () => {
    expect(buildExportFileName("新サービス開発")).toBe("新サービス開発.json");
  });

  it("ファイル名に使えない文字を置換する", () => {
    expect(buildExportFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("a_b_c_d_e_f_g_h_i_j.json");
  });

  it("空名はデフォルト名にする", () => {
    expect(buildExportFileName("  ")).toBe("project.json");
  });
});
