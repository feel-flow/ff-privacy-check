# ff-privacy-check

個人情報流出につながる **システム側の欠陥** を、Claude Code で簡易検査する plugin の公開リポジトリです。
このリポジトリ自体が Claude Code のマーケットプレイスになっています（アクセス権は不要）。
ソースの正本は株式会社フィールフロウの社内リポジトリにあり、ここへ一方向で同期しています（Pull Request はこのリポジトリでは受け付けず、Issue でお知らせください）。

## 導入

```bash
claude plugin marketplace add feel-flow/ff-privacy-check
claude plugin install ff-privacy-check@ff-privacy-check
```

## 使い方

検査したい repo で Claude Code を開き、`/ff-privacy-check:privacy-check` を実行します。
流れ・5 つの欠陥パターン・この検査で見つからないものは [plugins/ff-privacy-check/README.md](plugins/ff-privacy-check/README.md) を参照してください。

## ライセンス

Apache-2.0（[LICENSE](LICENSE)）
