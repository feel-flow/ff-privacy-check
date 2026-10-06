# ② 脆弱性パッチ適用前のゼロデイ / N デイ侵入

VPN・BI ツール・フレームワークの既知脆弱性が公表されてから数日以内に突かれる攻撃。
設計上の欠陥は「パッチ適用にダウンタイムや手作業が要る」「境界防御に依存し、内部の横展開を防げない」。

## 対応する問診

Q8（パッチ適用のリードタイム）。

## 実測手順

対象ディレクトリの中で読む。ブロック先頭の `EX` が共通の除外ディレクトリで、すべての grep に付ける。

```bash
EX='--exclude-dir=node_modules --exclude-dir=vendor --exclude-dir=dist --exclude-dir=build --exclude-dir=.git --exclude-dir=coverage --exclude-dir=.next --exclude-dir=.astro'
# 依存関係の自動更新
ls .github/dependabot.yml .github/dependabot.yaml renovate.json .renovaterc .renovaterc.json 2>/dev/null
# lock ファイルの有無（再現可能なビルドか）
ls package-lock.json pnpm-lock.yaml yarn.lock poetry.lock Pipfile.lock Gemfile.lock go.sum Cargo.lock 2>/dev/null
# CI で監査・更新を回しているか
grep -rniE "audit|snyk|trivy|grype|osv-scanner|dependabot|renovate" $EX .github/workflows/ .gitlab-ci.yml 2>/dev/null | head -20
# コンテナのベースイメージの固定（:latest は追従も再現もできない）
grep -rnE "^FROM " --include="Dockerfile*" $EX . | head -20
# デプロイの自動化（手動デプロイはパッチ適用を遅らせる）
grep -rliE "deploy|release" $EX .github/workflows/ 2>/dev/null | head -10
```

読み取ること:

- 自動更新の設定があるか。あってもマージされているかは問診（Q8）で補う
- lock ファイルが無いと、脆弱性のある版が入っているかどうかを特定できない
- `FROM image:latest` は「どの版が動いているか分からない」ことを意味する
- CVE との照合は外部送信を伴うのでこの検査では行わない。所見で `pnpm audit` / `npm audit` / `pip-audit` / `bundle audit` の自己実行を促す

## 所見の書き方

| 実測 | 問診 | 優先度 |
| --- | --- | --- |
| 自動更新未検出、lock 無し | Q8 が「1 か月以上 / 決まっていない」 | 高 |
| 自動更新未検出、lock あり | Q8 が「1 か月以上」 | 中 |
| 自動更新あり | Q8 が「2 週間以内」 | 低 |
| `:latest` のベースイメージ | どの答えでも | 中 |
| デプロイ自動化が未検出 | Q8 が「1 か月以上」 | 中 |

## 直し方の方向

- Dependabot / Renovate を入れ、マージまでの SLA（例: critical は 3 日）を決める
- コンテナ化と CI/CD で、脆弱性対応の再デプロイを数時間以内にできる構造にする
- フロントや VPN が侵害されてもコア DB に直接届かないよう、ネットワークを分離する（マイクロセグメンテーション）
