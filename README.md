# the-project-commander
プロジェクトマネージャーのマネジメントをアシストするツールです。

PMBOK第8版を参考に、WBS・クリティカルパス・ガントチャート・リスク登録簿などの必須ツールをブラウザで提供します。生成AI向けMCPサーバーと、対話型AI（ChatGPT等）向けのプロンプト生成機能を備えます。

## 主な機能

- **WBS**: タスクの階層登録（所要日数・進捗）
- **依存関係エディタ**: ネットワーク図上で先行/後続・タイプ（FS/SS/FF/SF）・ラグを設定
- **クリティカルパス**: CPM による自動計算とネットワーク図表示
- **ガント + スケジュールベースライン**: ベースライン保存→灰色オーバーレイ表示、終了差異（±n日）と進捗塗りつぶし
- **簡易EVM**: 日数ベースの PV/EV/SPI を算出し、ダッシュボードに SPI バッジを表示
- **登録簿**: リスク（確率×影響のスコアバッジ）/ ステークホルダー（権力・関心グリッド）
- **JSONエクスポート/インポート**: プロジェクト一式のバックアップ・移行
- **MCPサーバー**: 生成AIクライアント向けに14ツールを提供
- **AIアシスト**: MCP非対応AI向けのプロンプト生成と JSON 取り込み（プレビュー付き）

## 開発クイックスタート

```bash
cp .env.example .env
export TG_AUTH_TOKEN=tg_anon_xxxxxxxx  # Takumi Guard メール認証トークン
pnpm install
pip install pre-commit && pre-commit install
pnpm dev          # server(:3000) + web(:5173) を起動
pnpm test         # 全パッケージのテスト
pnpm verify:guard # Takumi Guard 403 確認
pnpm typecheck
pnpm lint
```

詳細（TDD フロー・pre-commit・Guard 設定）は [docs/development.md](docs/development.md) を参照してください。

## Dockerでの起動

```bash
TG_AUTH_TOKEN=<トークン> docker compose up --build
# → http://localhost:3000
```

## ドキュメント

- [使い方・MCP・プロンプト](docs/usage.md)
- [開発ガイド（TDD / CI / Guard）](docs/development.md)

