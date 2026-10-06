# ④ サードパーティ・委託先（サプライチェーン）経由の侵入

外部サービス・OSS ライブラリ・委託先のシステムが侵害され、そこから自社へ連鎖する攻撃。
設計上の欠陥は「依存関係を把握していない（SBOM が無い）」「外部連携に過剰な権限や認証不要の経路がある」。

## 対応する問診

Q9（外部委託先・外部 API の数と権限）。Q9 が「外部連携は無い」でも、下読みで Webhook 受信や外部 API 呼び出しが検出されていれば省かない。

## 実測手順

対象ディレクトリの中で読む。すべての grep に共通の除外指定 `--exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro}` を付ける（brace 展開は bash / zsh の両方で 8 個の引数に展開される）。find は同じ 8 ディレクトリを名前で prune する（深い階層の `node_modules` も除く）。

```bash
# SBOM 生成・依存関係の可視化
grep -rniE "sbom|cyclonedx|spdx|syft" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro} .github/workflows/ package.json Makefile 2>/dev/null | head -10
# インストール時に任意コードが走るスクリプト
grep -nE "\"(pre|post)install\"" package.json 2>/dev/null
# 外部 API 呼び出しと、その認証
grep -rnE "(fetch|axios|got|requests|httpx|http\.get|urllib)\(.*https?://" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro} . | head -40
# Webhook 受信と署名検証
grep -rniE "webhook" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro} -l . | head -20
grep -rniE "signature|hmac|verify|x-hub-signature|stripe-signature" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro} . | head -20
# 内部 API ルートに認証ミドルウェアが掛かっているか（ルート定義の一覧）
find . \( -name node_modules -o -name vendor -o -name dist -o -name build -o -name .git -o -name coverage -o -name .next -o -name .astro \) -prune -o \( -path "*/api/*" -o -path "*/routes/*" \) -name "*.ts" -print 2>/dev/null | head -40
```

読み取ること:

- SBOM を作っているか。無ければ CVE 公表時に影響範囲を特定できない
- Webhook を受けているファイルに署名検証があるか（Webhook ファイル一覧と署名検証の一覧を突き合わせる）
- 外部 API 呼び出しに認証ヘッダが付いているか、キーがコードに直書きされていないか（③と重なる）
- 内部 API ルートのうち、認証ミドルウェアを import していないものがあるか

## 所見の書き方

| 実測 | 問診 | 優先度 |
| --- | --- | --- |
| Webhook 受信あり、署名検証未検出 | どの答えでも | 高 |
| 認証無しの内部 API ルート | Q9 が「4 件以上」または「共通のキー」 | 高 |
| Webhook 受信・外部 API 呼び出しあり | Q9 が「外部連携は無い」 | 食い違い → 段 1.5 で裁定。そのまま進むなら所見に残す |
| SBOM 未検出 | Q9 が「4 件以上」 | 中 |
| SBOM 未検出 | Q9 が「1〜3 件、最小権限」 | 低 |
| postinstall スクリプトあり | どの答えでも | 低（内容の確認を促す） |

## 直し方の方向

- SBOM を CI で生成し、新しい CVE が出たときに影響範囲を自動で特定できるようにする
- 内部通信でも API ゲートウェイで毎回の認証・認可・入力検証を行う（ゼロトラスト）
- 委託先・外部サービスには個別のキーを最小権限で発行し、使っていないものは失効させる
