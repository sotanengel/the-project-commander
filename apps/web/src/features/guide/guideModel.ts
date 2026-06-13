/**
 * ガイドページの構造化データと純関数。
 * 用語説明はすべて一般的なプロジェクトマネジメント知識に基づく自前の文章。
 */

/** 用語集の1項目 */
export type GlossaryTerm = {
  /** ページ内アンカーに使う一意なID（小文字英数とハイフン） */
  id: string;
  /** 用語名 */
  term: string;
  /** ひとこと定義（平易な日本語） */
  definition: string;
  /** アプリ内のどこで使うか */
  usage: string;
  /** フィルタ用の別名・関連語 */
  keywords: string[];
};

/** PMBOK用語集（初学者向けのひとこと定義つき） */
export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    id: "wbs",
    term: "WBS",
    definition:
      "プロジェクトの成果物や作業を、上位から下位へ階層的に分解した一覧。やるべきことの全体像を漏れなく把握するための土台です。",
    usage: "「WBS」タブでタスクを階層登録します。プロジェクト作成後、最初に取り組む画面です。",
    keywords: ["作業分解構成図", "Work Breakdown Structure", "タスク分解"],
  },
  {
    id: "work-package",
    term: "ワークパッケージ",
    definition:
      "WBSの最下層にある、これ以上分けない作業のまとまり。所要日数や担当を見積もれる大きさまで分解するのが目安です。",
    usage: "「WBS」タブの末端タスクがワークパッケージに相当し、所要日数と進捗率を入力します。",
    keywords: ["Work Package", "最小単位"],
  },
  {
    id: "critical-path",
    term: "クリティカルパス",
    definition:
      "開始から完了までの経路のうち、最も日数がかかる一連のタスク。この経路上のタスクが1日遅れると、プロジェクト全体も1日遅れます。",
    usage: "「ネットワーク図」と「ガント」で赤色で強調表示されます。遅延監視の最優先対象です。",
    keywords: ["Critical Path", "CPM", "最長経路"],
  },
  {
    id: "total-float",
    term: "トータルフロート（TF）",
    definition:
      "プロジェクト全体の完了日を遅らせずに、そのタスクが遅れてもよい余裕日数。TFが0のタスクはクリティカルパス上にあります。",
    usage:
      "「ネットワーク図」の各タスクに TF として表示されます。余裕の少ないタスクから注意します。",
    keywords: ["Total Float", "TF", "余裕日数", "スラック"],
  },
  {
    id: "dependency-types",
    term: "依存タイプ（FS / SS / FF / SF）",
    definition:
      "タスク間の前後関係の型。FS=先行が終わったら開始（最も一般的）、SS=同時に開始、FF=同時に終了、SF=先行が始まったら終了できる、の4種類です。",
    usage:
      "「ネットワーク図」の依存関係エディタでタイプを選択します。迷ったらFSを選べば大丈夫です。",
    keywords: ["FS", "SS", "FF", "SF", "依存関係", "先行", "後続"],
  },
  {
    id: "lag-lead",
    term: "ラグ / リード",
    definition:
      "依存関係に加える待ち時間の調整。ラグは「先行の後に◯日待ってから」、リードは「先行の完了を待たず◯日前倒しで」を表します（リードは負のラグとして指定）。",
    usage:
      "「ネットワーク図」の依存関係エディタで日数を指定します。負の値を入れるとリードになります。",
    keywords: ["Lag", "Lead", "待ち日数", "前倒し"],
  },
  {
    id: "baseline",
    term: "ベースライン",
    definition:
      "承認された時点の計画のスナップショット。実績と比べる「ものさし」になり、どれだけ計画からずれたかを測れます。",
    usage: "「ガント」タブで保存します。保存後は灰色バーで当初計画が表示され、差異が±n日で出ます。",
    keywords: ["Baseline", "基準計画", "スナップショット"],
  },
  {
    id: "pv",
    term: "PV（計画価値）",
    definition:
      "ある時点までに完了している「はず」の作業量をお金や日数で表した値。計画どおりなら今ここまで進んでいる、という基準です。",
    usage: "ダッシュボードの簡易EVM指標の計算に使われます（ベースライン保存後に有効）。",
    keywords: ["PV", "Planned Value", "計画価値", "EVM"],
  },
  {
    id: "ev",
    term: "EV（出来高）",
    definition:
      "実際に完了した作業量を、計画時の価値に換算した値。「ここまで実際に進んだ」を表します。",
    usage: "WBSで入力した進捗率からダッシュボードのEVM指標として自動計算されます。",
    keywords: ["EV", "Earned Value", "出来高", "アーンドバリュー", "EVM"],
  },
  {
    id: "spi",
    term: "SPI（スケジュール効率指数）",
    definition:
      "EV ÷ PV で求めるスケジュールの健全性指標。1.0なら計画どおり、1未満なら遅れ気味、1超なら前倒しです。",
    usage:
      "ダッシュボードの各プロジェクトカードに表示されます。1を下回ったら原因をガントで確認します。",
    keywords: ["SPI", "Schedule Performance Index", "スケジュール効率指数"],
  },
  {
    id: "risk-matrix",
    term: "リスクの確率×影響",
    definition:
      "リスクの大きさを「起こりやすさ（確率）」と「起きたときの痛手（影響）」の掛け算で点数化する方法。点数の高いリスクから対応を考えます。",
    usage:
      "「リスク / 関係者」タブで確率と影響を低・中・高で選ぶと、スコア（1〜9）が自動表示されます。",
    keywords: ["確率×影響", "リスクスコア", "リスクマトリクス", "Probability", "Impact"],
  },
  {
    id: "power-interest-grid",
    term: "権力・関心グリッド",
    definition:
      "ステークホルダー（利害関係者）を「影響力」と「関心度」の2軸で分類し、関わり方（重点管理・満足維持・情報提供・監視）を決める考え方です。",
    usage: "「リスク / 関係者」タブで影響力と関心度を入力すると、関与区分が自動で表示されます。",
    keywords: ["権力・関心グリッド", "Power Interest Grid", "ステークホルダー", "利害関係者"],
  },
  {
    id: "milestone",
    term: "マイルストーン",
    definition:
      "「設計完了」「リリース」など、進捗の節目となる重要なチェックポイント。作業期間を持たない目標日として管理します。",
    usage: "「リスク / 関係者」タブのマイルストーン登録簿で目標日と達成状況を管理します。",
    keywords: ["Milestone", "節目", "チェックポイント"],
  },
];

/** PMBOK の Focus Area（プロセス群）1件 */
export type FocusArea = {
  /** ページ内アンカーに使う一意なID */
  id: string;
  /** 領域名 */
  name: string;
  /** この領域で何をするかの平易な説明 */
  description: string;
  /** このアプリでの対応する操作 */
  appActions: string[];
};

/** PMBOK の5つの Focus Areas とアプリ操作の対応 */
export const FOCUS_AREAS: FocusArea[] = [
  {
    id: "initiating",
    name: "立ち上げ",
    description: "プロジェクトの目的を定め、正式にスタートさせる段階。",
    appActions: ["ダッシュボードでプロジェクトを作成（名前・開始日・概要を登録）"],
  },
  {
    id: "planning",
    name: "計画",
    description: "やるべき作業・順序・スケジュールを具体化し、計画として固める段階。",
    appActions: [
      "「WBS」タブでタスクを階層分解し、所要日数を見積もる",
      "「ネットワーク図」で依存関係（FS/SS/FF/SF・ラグ）を設定し、クリティカルパスを確認",
      "「ガント」で計画を俯瞰し、固まったらベースラインを保存",
      "「リスク / 関係者」でリスク・ステークホルダー・マイルストーンを登録",
    ],
  },
  {
    id: "executing",
    name: "実行",
    description: "計画に沿って実際に作業を進める段階。",
    appActions: ["「WBS」タブで各タスクの進捗率を入力して実績を記録"],
  },
  {
    id: "monitoring",
    name: "監視・コントロール",
    description: "計画と実績のずれを早めに見つけ、軌道修正する段階。",
    appActions: [
      "「ガント」でベースラインとの差異（±n日）を確認",
      "ダッシュボードで SPI をチェックし、1未満なら遅延の兆候を調査",
      "「リスク / 関係者」でリスクの状態（対応中・監視中・完了）を更新",
    ],
  },
  {
    id: "closing",
    name: "終結",
    description: "成果を確認してプロジェクトを締めくくり、記録を残す段階。",
    appActions: ["プロジェクトデータをエクスポートして記録を保管（教訓の振り返りに活用）"],
  },
];

/** はじめかたチェックリストの1ステップ */
export type ChecklistStep = {
  /** 手順番号（1始まりの連番） */
  step: number;
  /** ステップ名 */
  title: string;
  /** 何をするかの説明 */
  description: string;
  /** 該当する画面（タブ）の案内 */
  location: string;
};

/** はじめかたチェックリスト（推奨フロー） */
export const CHECKLIST_STEPS: ChecklistStep[] = [
  {
    step: 1,
    title: "プロジェクトを作成する",
    description:
      "「新規プロジェクト」から名前・概要・開始日を入力して登録します。作成後、AIでタスクを生成するプロンプトが表示されます。",
    location: "ダッシュボード（トップページ）→ セットアップ画面",
  },
  {
    step: 2,
    title: "WBSでタスクを分解する",
    description:
      "成果物や作業を大きい順に階層分解し、見積もれる大きさ（ワークパッケージ）まで細かくして所要日数を入力します。",
    location: "プロジェクトを開いて「WBS」タブ",
  },
  {
    step: 3,
    title: "依存関係を設定する",
    description:
      "タスクの前後関係（基本はFS）を結び、クリティカルパスとトータルフロートを確認します。",
    location: "「ネットワーク図」タブの依存関係エディタ",
  },
  {
    step: 4,
    title: "ベースラインを保存する",
    description:
      "計画が固まったらスナップショットを保存します。以降の差異やSPIはこれを基準に計算されます。",
    location: "「ガント」タブのベースライン保存ボタン",
  },
  {
    step: 5,
    title: "進捗を入力して監視する",
    description:
      "実行中はWBSで進捗率を更新し、ガントの差異とダッシュボードのSPIで遅れの兆候を早期に発見します。",
    location: "「WBS」タブで入力、「ガント」とダッシュボードで監視",
  },
];

/**
 * 用語集をクエリで絞り込む純関数。
 * 用語名・定義・使いどころ・キーワードに対する部分一致（大文字小文字を無視）。
 * 空（または空白のみ）のクエリでは全件のコピーを返す。元配列は変更しない。
 */
export function filterTerms(terms: readonly GlossaryTerm[], query: string): GlossaryTerm[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...terms];
  return terms.filter((t) =>
    [t.term, t.definition, t.usage, ...t.keywords].some((text) => text.toLowerCase().includes(q)),
  );
}
