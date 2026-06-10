#!/usr/bin/env bash
set -euo pipefail

# Takumi Guard が正しく設定されていることを確認する。
# @panda-guard/test-malicious は常にブロックリストにあり、403 で拒否されるべき。
# 参照: https://shisho.dev/docs/ja/t/guard/quickstart/npm.md#verify-setup

if pnpm add @panda-guard/test-malicious 2>&1; then
  echo "ERROR: Expected install to fail with 403 Forbidden, but it succeeded." >&2
  exit 1
fi

echo "Takumi Guard verification passed: malicious package was blocked."
