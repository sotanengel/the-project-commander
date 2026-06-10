# the-project-commander
プロジェクトマネージャーのマネジメントをアシストするツールです。

PMBOK第8版を参考に、WBS・クリティカルパス・ガントチャート・リスク登録簿などの必須ツールをブラウザで提供します。生成AI向けMCPサーバーと、対話型AI（ChatGPT等）向けのプロンプト生成機能を備えます。

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

