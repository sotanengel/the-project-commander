# 開発ガイド

## 前提

- Node.js 22
- pnpm 10（Corepack 経由）
- Python 3（pre-commit 用）

## Takumi Guard

このリポジトリは npm レジストリに [Takumi Guard](https://shisho.dev/docs/ja/t/guard/quickstart/index.md) を利用します。

1. [メール登録](https://shisho.dev/docs/ja/t/guard/features/token-management.md#email-register)で `tg_anon_` プレフィックスのトークンを取得
2. 環境変数に設定（`.env.example` を参照）

```bash
export TG_AUTH_TOKEN=tg_anon_xxxxxxxx
pnpm install
```

Guard が正しく動作しているか確認:

```bash
pnpm verify:guard
```

`@panda-guard/test-malicious` のインストールが 403 で拒否されれば成功です。

## 初回セットアップ

```bash
cp .env.example .env   # TG_AUTH_TOKEN を編集
export TG_AUTH_TOKEN=...  # または .env を source
pnpm install
pip install pre-commit
pre-commit install
```

## 日常の開発

```bash
pnpm dev          # server + web(:5173)。3000 使用中は API を空きポートに自動割当
pnpm test         # 全パッケージの Vitest + shell スクリプトテスト
pnpm test:scripts # docker-up-open.sh のみ
pnpm typecheck
pnpm lint
pnpm lint:fix
```

パッケージ単位でテストする例:

```bash
pnpm --filter @tpc/server test
pnpm --filter @tpc/web test
pnpm --filter @tpc/shared test
```

## TDD（テスト駆動開発）

新機能・バグ修正では次の順序で進めます。

1. **Red** — 仕様を表すテストを先に書き、失敗を確認する
2. **Green** — テストが通る最小実装を行う
3. **Refactor** — 重複を整理し、テストが Green のままであることを確認する

テスト配置:

| パッケージ | 配置 |
|-----------|------|
| `@tpc/shared` | `packages/shared/src/**/*.test.ts` |
| `@tpc/server` | `apps/server/src/**/*.test.ts` |
| `@tpc/web` | `apps/web/src/**/*.test.ts` |

## コミット前チェック（pre-commit）

`git commit` 時に以下が自動実行されます。

1. Biome（lint + format）
2. TypeScript 型チェック
3. Vitest（全パッケージ）

手動実行:

```bash
pre-commit run --all-files
```

CI でも同じ pre-commit 設定が `pre-commit run --all-files` で検証されます。
