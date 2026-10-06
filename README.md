# ff-privacy-check

個人情報流出につながる **システム側の欠陥** を、Claude Code で簡易検査する plugin です。
人にしか分からないこと（運用体制・保持方針）を問診し、コードから読めること（MFA・TTL・ログ出力・削除ジョブ）を実測し、
両者を突き合わせて 5 つの欠陥パターンごとに優先度つきの所見を出します。

## 導入

このリポジトリ自体が公開マーケットプレイスです（アクセス権は不要）。

```bash
claude plugin marketplace add feel-flow/ff-privacy-check
claude plugin install ff-privacy-check@ff-privacy-check
```

Codex CLI は `codex plugin marketplace add feel-flow/ff-privacy-check` と `codex plugin add ff-privacy-check@ff-privacy-check`（問診は対話で 1 問ずつ進みます）。

フィールフロウ社内の `feelflow-plugins` marketplace（private）にも登録しているので、そちらを使っている人は `claude plugin install ff-privacy-check@feelflow-plugins` でも導入できます。

## 使い方

検査したい repo で Claude Code を開き、次を実行します。

```text
/ff-privacy-check:privacy-check
```

流れは 5 段です。

| 段 | 内容 |
| --- | --- |
| 段 0 | 下読み。言語・認証ライブラリ・ログ・CI・ジョブの場所だけ押さえる |
| 段 1 | 問診。コードから読めないことを最大 10 問（2 回目以降は 1 問） |
| 段 1.5 | 確認。問診の答えとコードから読めたことを並べ、食い違いを裁定 |
| 段 2 | 実測。read-only で grep と設定読み取りだけ |
| 段 3 | 所見。`privacy-check-report-YYYYMMDD.md` を出力（同日 2 回目以降は `-2` `-3` と連番） |

問診の答えは検査対象ディレクトリ直下の `.privacy-check/profile.md` に、所見は同じ場所の `privacy-check-report-*.md` に保存されます。
所見にはファイルパスと行番号が入るので、どちらも `.gitignore` への追加をおすすめします。

```gitignore
.privacy-check/
privacy-check-report-*.md
```

## 5 つの欠陥パターン

| # | パターン | 問診で聞くこと | 実測で読むこと |
| --- | --- | --- | --- |
| ① | 管理の隙を突かれたランサム感染 | 夜間・休日の体制、復旧テスト | バックアップ定義、異常検知 |
| ② | パッチ適用前の侵入 | パッチ適用のリードタイム | 自動更新設定、lock、ベースイメージ、デプロイ自動化 |
| ③ | 認証情報奪取による偽装 | 認証方式、管理者の共有 | MFA、セッション TTL、Cookie 属性 |
| ④ | サプライチェーン経由の侵入 | 委託先の数と権限 | SBOM、Webhook 署名、外部 API 認証 |
| ⑤ | 過剰保持による大量漏洩 | 情報の種類、保持方針 | ログの PII、平文カラム、削除ジョブ |

## この検査で見つからないもの

- ペネトレーションテストや動的検査で初めて分かる脆弱性
- 運用手順が実際に守られているか
- クラウド側の IAM・ネットワーク・WAF など repo の外にある設定
- 既知脆弱性（CVE）との照合（外部送信を伴うため実行しません。`pnpm audit` などを自分で実行してください）

## 開発

```bash
node --test
```

設計は [docs/design.md](docs/design.md) を参照してください。

## ライセンス

Apache-2.0
