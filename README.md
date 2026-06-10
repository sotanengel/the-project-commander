# the-project-commander
プロジェクトマネージャーのマネジメントをアシストするツールです。

PMBOK第8版を参考に、WBS・クリティカルパス・ガントチャート・リスク登録簿などの必須ツールをブラウザで提供します。生成AI向けMCPサーバーと、対話型AI（ChatGPT等）向けのプロンプト生成機能を備えます。

## 開発クイックスタート

```bash
export TG_AUTH_TOKEN=<Takumi Guardのトークン>  # .npmrcのレジストリ認証に必要
pnpm install
pnpm dev          # server(:3000) + web(:5173) を起動
pnpm test         # 全パッケージのテスト
pnpm typecheck
pnpm lint
```

## Dockerでの起動

```bash
TG_AUTH_TOKEN=<トークン> docker compose up --build
# → http://localhost:3000
```

詳細な使い方は今後 `docs/` に追加予定です。
