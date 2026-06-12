import { addDays } from "@tpc/shared";
import type { Dependency, ExportBundle, Task } from "@tpc/shared";

/**
 * サンプルプロジェクト（ExportBundle形式）。
 * 「サンプルプロジェクトを読み込む」ボタンから POST /api/projects/import に投入する。
 * インポート時にIDは再割当されるため、ここでのIDはバンドル内の参照整合性にのみ使う。
 */

/** サンプルの基準日から開始日をさかのぼる日数。進捗・SPIが計測できる途中時点を再現する */
export const SAMPLE_ELAPSED_DAYS = 10;

const PROJECT_ID = "sample-project";

interface LeafSpec {
  id: string;
  parentId: string;
  name: string;
  description: string;
  durationDays: number;
  progress: number;
  assignee: string;
}

function makeTask(spec: LeafSpec, sortOrder: number): Task {
  return { ...spec, projectId: PROJECT_ID, sortOrder };
}

function makeParent(id: string, name: string, description: string, sortOrder: number): Task {
  return {
    id,
    projectId: PROJECT_ID,
    parentId: null,
    name,
    description,
    durationDays: 0,
    progress: 0,
    assignee: "",
    sortOrder,
  };
}

function makeDep(
  id: string,
  predecessorId: string,
  successorId: string,
  type: Dependency["type"] = "FS",
  lagDays = 0,
): Dependency {
  return { id, projectId: PROJECT_ID, predecessorId, successorId, type, lagDays };
}

/**
 * 小規模なWebサイト制作プロジェクトのサンプルバンドルを組み立てる純粋関数。
 * `today`（YYYY-MM-DD）を基準に、開始日を {@link SAMPLE_ELAPSED_DAYS} 日前へ置くことで
 * 「序盤のタスクは完了・中盤は進行中・終盤は未着手」という進行途中の状態を再現する。
 */
export function buildSampleProjectBundle(today: string): ExportBundle {
  const startDate = addDays(today, -SAMPLE_ELAPSED_DAYS);

  const parents: Task[] = [
    makeParent("t-plan", "企画", "目的とスコープを固めるフェーズ", 0),
    makeParent("t-design", "デザイン", "画面設計とビジュアルデザイン", 1),
    makeParent("t-build", "実装", "コーディングとCMS組み込み", 2),
    makeParent("t-launch", "公開準備", "テストと本番公開", 3),
  ];

  const leaves: LeafSpec[] = [
    {
      id: "t-req",
      parentId: "t-plan",
      name: "要件定義",
      description: "掲載内容・ターゲット・必要機能の整理",
      durationDays: 3,
      progress: 100,
      assignee: "佐藤",
    },
    {
      id: "t-sitemap",
      parentId: "t-plan",
      name: "サイト構成設計",
      description: "サイトマップとページ一覧の作成",
      durationDays: 2,
      progress: 100,
      assignee: "佐藤",
    },
    {
      id: "t-wire",
      parentId: "t-design",
      name: "ワイヤーフレーム作成",
      description: "主要ページのレイアウト設計",
      durationDays: 3,
      progress: 100,
      assignee: "鈴木",
    },
    {
      id: "t-visual",
      parentId: "t-design",
      name: "ビジュアルデザイン",
      description: "トーン&マナーを決めてデザインカンプを作成",
      durationDays: 4,
      progress: 40,
      assignee: "鈴木",
    },
    {
      id: "t-code-top",
      parentId: "t-build",
      name: "トップページコーディング",
      description: "トップページのHTML/CSS実装",
      durationDays: 5,
      progress: 0,
      assignee: "田中",
    },
    {
      id: "t-code-sub",
      parentId: "t-build",
      name: "下層ページコーディング",
      description: "下層ページの実装（トップ着手2日後から並行）",
      durationDays: 4,
      progress: 0,
      assignee: "田中",
    },
    {
      id: "t-test",
      parentId: "t-launch",
      name: "動作テスト",
      description: "主要ブラウザでの表示・動作確認",
      durationDays: 3,
      progress: 0,
      assignee: "佐藤",
    },
    {
      id: "t-release",
      parentId: "t-launch",
      name: "本番公開",
      description: "本番環境への反映と公開後チェック",
      durationDays: 1,
      progress: 0,
      assignee: "田中",
    },
  ];

  const tasks: Task[] = [...parents, ...leaves.map((leaf, index) => makeTask(leaf, index))];

  const dependencies: Dependency[] = [
    makeDep("d-1", "t-req", "t-sitemap"),
    makeDep("d-2", "t-sitemap", "t-wire"),
    makeDep("d-3", "t-wire", "t-visual"),
    makeDep("d-4", "t-visual", "t-code-top"),
    // トップページ着手の2日後から下層ページを並行で進める（SS + ラグ2日）
    makeDep("d-5", "t-code-top", "t-code-sub", "SS", 2),
    makeDep("d-6", "t-code-top", "t-test"),
    makeDep("d-7", "t-code-sub", "t-test"),
    makeDep("d-8", "t-test", "t-release"),
  ];

  return {
    version: 1,
    exportedAt: `${today}T00:00:00.000Z`,
    project: {
      id: PROJECT_ID,
      name: "サンプル: コーポレートサイト制作",
      description:
        "小規模なWebサイト制作のサンプルプロジェクトです。WBS・依存関係・マイルストーン・リスク・関係者の使い方を一通り確認できます。",
      startDate,
      createdAt: `${today}T00:00:00.000Z`,
    },
    tasks,
    dependencies,
    milestones: [
      {
        id: "m-1",
        projectId: PROJECT_ID,
        name: "要件確定",
        dueDate: addDays(startDate, 5),
        status: "done",
      },
      {
        id: "m-2",
        projectId: PROJECT_ID,
        name: "デザイン承認",
        dueDate: addDays(startDate, 12),
        status: "pending",
      },
      {
        id: "m-3",
        projectId: PROJECT_ID,
        name: "サイト公開",
        dueDate: addDays(startDate, 22),
        status: "pending",
      },
    ],
    risks: [
      {
        id: "r-1",
        projectId: PROJECT_ID,
        title: "原稿・写真素材の提供が遅れる",
        probability: "high",
        impact: "medium",
        response: "軽減: 締切の1週間前にリマインドし、代替素材を準備しておく",
        status: "open",
      },
      {
        id: "r-2",
        projectId: PROJECT_ID,
        title: "デザイン承認後の大幅な仕様変更",
        probability: "medium",
        impact: "high",
        response: "回避: 承認時に変更ルール（追加費用・納期影響）を合意する",
        status: "watching",
      },
      {
        id: "r-3",
        projectId: PROJECT_ID,
        title: "公開直前に重大な不具合が見つかる",
        probability: "low",
        impact: "high",
        response: "軽減: 動作テストにバッファを確保し、公開日を金曜にしない",
        status: "open",
      },
    ],
    stakeholders: [
      {
        id: "s-1",
        projectId: PROJECT_ID,
        name: "山田 部長",
        role: "発注元責任者（スポンサー）",
        influence: "high",
        interest: "high",
        note: "週次で進捗を報告し、意思決定を依頼する",
      },
      {
        id: "s-2",
        projectId: PROJECT_ID,
        name: "高橋 さん",
        role: "広報担当（原稿・素材提供）",
        influence: "medium",
        interest: "high",
        note: "素材の提供スケジュールを早めに共有してもらう",
      },
      {
        id: "s-3",
        projectId: PROJECT_ID,
        name: "情報システム部",
        role: "サーバー・ドメイン管理",
        influence: "high",
        interest: "low",
        note: "公開作業の申請が必要。リードタイム2週間を見込む",
      },
    ],
    baselines: [],
  };
}
