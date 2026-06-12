import { describe, expect, it } from "vitest";
import {
  CHECKLIST_STEPS,
  FOCUS_AREAS,
  GLOSSARY_TERMS,
  type GlossaryTerm,
  filterTerms,
} from "./guideModel.js";

describe("GLOSSARY_TERMS", () => {
  it("必須フィールド（id/term/definition/usage）がすべて空でない", () => {
    for (const t of GLOSSARY_TERMS) {
      expect(t.id.trim(), `id が空: ${JSON.stringify(t)}`).not.toBe("");
      expect(t.term.trim(), `term が空: ${t.id}`).not.toBe("");
      expect(t.definition.trim(), `definition が空: ${t.id}`).not.toBe("");
      expect(t.usage.trim(), `usage が空: ${t.id}`).not.toBe("");
    }
  });

  it("id はアンカーとして使える形式（小文字英数とハイフン）で一意", () => {
    const ids = GLOSSARY_TERMS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("Issue #37 で要求された用語をすべて含む", () => {
    const all = GLOSSARY_TERMS.map((t) => [t.term, ...t.keywords].join(" ")).join(" ");
    const required = [
      "WBS",
      "ワークパッケージ",
      "クリティカルパス",
      "トータルフロート",
      "FS",
      "SS",
      "FF",
      "SF",
      "ラグ",
      "リード",
      "ベースライン",
      "PV",
      "EV",
      "SPI",
      "確率×影響",
      "権力・関心グリッド",
      "マイルストーン",
    ];
    for (const word of required) {
      expect(all, `用語集に「${word}」が見つからない`).toContain(word);
    }
  });
});

describe("FOCUS_AREAS", () => {
  it("PMBOK の5領域を立ち上げ→終結の順で持つ", () => {
    expect(FOCUS_AREAS.map((a) => a.name)).toEqual([
      "立ち上げ",
      "計画",
      "実行",
      "監視・コントロール",
      "終結",
    ]);
  });

  it("各領域に説明と1つ以上のアプリ操作がある", () => {
    for (const a of FOCUS_AREAS) {
      expect(a.id.trim()).not.toBe("");
      expect(a.description.trim()).not.toBe("");
      expect(a.appActions.length).toBeGreaterThan(0);
      for (const action of a.appActions) {
        expect(action.trim()).not.toBe("");
      }
    }
  });
});

describe("CHECKLIST_STEPS", () => {
  it("1〜5の連番で、タイトル・説明・画面案内を持つ", () => {
    expect(CHECKLIST_STEPS.map((s) => s.step)).toEqual([1, 2, 3, 4, 5]);
    for (const s of CHECKLIST_STEPS) {
      expect(s.title.trim()).not.toBe("");
      expect(s.description.trim()).not.toBe("");
      expect(s.location.trim()).not.toBe("");
    }
  });

  it("推奨フロー（作成→WBS→依存→ベースライン→進捗）の順になっている", () => {
    const titles = CHECKLIST_STEPS.map((s) => s.title).join(" ");
    const order = ["プロジェクト", "WBS", "依存", "ベースライン", "進捗"];
    let lastIndex = -1;
    for (const word of order) {
      const i = titles.indexOf(word);
      expect(i, `チェックリストに「${word}」が順序どおり現れない`).toBeGreaterThan(lastIndex);
      lastIndex = i;
    }
  });
});

describe("filterTerms", () => {
  const terms: GlossaryTerm[] = [
    {
      id: "wbs",
      term: "WBS",
      definition: "作業を分解した階層図",
      usage: "WBSタブ",
      keywords: ["作業分解構成図"],
    },
    {
      id: "spi",
      term: "SPI",
      definition: "スケジュール効率の指標",
      usage: "ダッシュボード",
      keywords: ["スケジュール効率指数"],
    },
  ];

  it("空文字・空白のみのクエリでは全件を返す", () => {
    expect(filterTerms(terms, "")).toEqual(terms);
    expect(filterTerms(terms, "   ")).toEqual(terms);
  });

  it("用語名に部分一致する（大文字小文字を無視）", () => {
    expect(filterTerms(terms, "wbs").map((t) => t.id)).toEqual(["wbs"]);
    expect(filterTerms(terms, "Spi").map((t) => t.id)).toEqual(["spi"]);
  });

  it("定義・キーワードにも一致する", () => {
    expect(filterTerms(terms, "階層図").map((t) => t.id)).toEqual(["wbs"]);
    expect(filterTerms(terms, "効率指数").map((t) => t.id)).toEqual(["spi"]);
  });

  it("一致がなければ空配列を返し、元配列は変更しない", () => {
    const before = [...terms];
    expect(filterTerms(terms, "存在しない語")).toEqual([]);
    expect(terms).toEqual(before);
  });

  it("実データに対しても代表的な検索語でヒットする", () => {
    expect(filterTerms(GLOSSARY_TERMS, "クリティカル").length).toBeGreaterThan(0);
    expect(filterTerms(GLOSSARY_TERMS, "tf").length).toBeGreaterThan(0);
    expect(filterTerms(GLOSSARY_TERMS, "ev").length).toBeGreaterThan(0);
  });
});
