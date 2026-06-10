# 使い方ガイド

## 基本フロー

1. ダッシュボードでプロジェクトを作成
2. **WBS** タブでタスクを階層登録（所要日数・進捗）
3. 依存関係は API または **AIアシスト** / MCP で設定
4. **ネットワーク図** でクリティカルパスを確認
5. **ガント** でスケジュールを俯瞰
6. **リスク / 関係者** で登録簿を管理

## Docker 起動

```bash
export TG_AUTH_TOKEN=tg_anon_xxxxxxxx
docker compose up --build
```

ブラウザで http://localhost:3000 を開きます。データは `/data` ボリュームに永続化されます。

## 開発モード

```bash
pnpm dev
```

- API + ビルド済み SPA: http://localhost:3000
- Vite 開発サーバー: http://localhost:5173（API は 3000 にプロキシ）

## MCP 接続（生成AIクライアント）

Streamable HTTP エンドポイント: `http://localhost:3000/mcp`

利用可能ツール（9個）:

| ツール | 説明 |
|--------|------|
| `list_projects` | プロジェクト一覧 |
| `create_project` | プロジェクト作成 |
| `get_project_plan` | 計画全体（CPM含む） |
| `add_tasks` | 階層タスク一括登録 |
| `update_task` | タスク更新 |
| `delete_task` | タスク削除 |
| `set_dependencies` | 依存一括登録 |
| `get_critical_path` | クリティカルパス |
| `add_risks` | リスク一括登録 |

### 動作確認（curl）

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}},"id":1}'
```

Cursor / Claude Desktop 等では MCP 設定に上記 URL を Streamable HTTP として登録してください。

## AIアシスト（プロンプト方式）

MCP 非対応の ChatGPT 等向け:

1. プロジェクト画面の **AIアシスト** タブを開く
2. 目的（WBSドラフト / タスク分解 / リスク / 依存）を選択
3. **プロンプトをコピー** して AI に貼り付け
4. 返ってきた JSON を貼り付けて **取り込む**

JSON は Zod で検証され、不正な場合はエラーメッセージが表示されます。
