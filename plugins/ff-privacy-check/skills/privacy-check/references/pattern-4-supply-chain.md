# ④ サードパーティ・委託先（サプライチェーン）経由の侵入

外部サービス・OSS ライブラリ・委託先のシステムが侵害され、そこから自社へ連鎖する攻撃。
設計上の欠陥は「依存関係を把握していない（SBOM が無い）」「外部連携に過剰な権限や認証不要の経路がある」。

## 対応する問診

Q9（外部委託先・外部 API の数と権限）。Q9 が「外部連携は無い」でも、下読みで Webhook 受信や外部 API 呼び出しが検出されていれば省かない。

## 実測手順

対象ディレクトリの中で読む。一致行を出力する grep はすべて `| cut -d: -f1,2` で path:line だけを出す（値をツール出力に乗せない）。該当行の中身を確認するときは次の形で開き、引用符で囲まれた 16 文字以上と `=` / `:` の後ろの 20 文字以上を伏せ、さらに password / secret / token / api_key / authorization / cookie / private_key / client_secret などのキー名に続く値は長さによらず伏せる（キー名が JSON のように引用符で囲まれていても効く。`I` フラグで大文字小文字を無視。bash / zsh で実測）: `sed -n "<行番号>p" <path> | sed -E "s/\"[^\"]{16,}\"/\"***\"/g; s/'[^']{16,}'/'***'/g; s/([:=][[:space:]]*)[^[:space:]\"']{20,}/\1***/g; s/((password|passwd|pwd|secret|token|api[_-]?key|apikey|authorization|cookie|private[_-]?key|client[_-]?secret)[A-Za-z0-9_]*[\"']?[[:space:]]*[:=][[:space:]]*)(\"[^\"]*\"|'[^']*'|[^,;]+)/\1***/Ig"`。すべての grep に共通の除外指定（brace 展開の `--exclude-dir` 16 ディレクトリと、`.env*` / minified / lock ファイルの `--exclude`）を付ける。brace 展開は bash / zsh の両方で効く。`.env*` は値が入っているので一致行を出さない。find は同じ 16 ディレクトリを名前で prune する（深い階層の `node_modules` も除く）。

```bash
# SBOM 生成・依存関係の可視化
grep -rniE "sbom|cyclonedx|spdx|syft" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' .github/workflows/ package.json Makefile 2>/dev/null | cut -d: -f1,2 | head -10
# インストール時に任意コードが走るスクリプト（サブディレクトリの package.json も含む）
grep -rnE "\"(pre|post)install\"" --include=package.json --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -20
# 外部 API 呼び出しの所在（URL にキーが埋め込まれていても値を出さないよう path:line だけ出し、該当行は個別に開いて確認する）
grep -rnE "(fetch|axios|got|requests|httpx|http\.get|urllib)\(.*https?://" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -40
# Webhook 受信と署名検証
grep -rniE "webhook" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' -l . | head -20
grep -rniE "signature|hmac|verify|x-hub-signature|stripe-signature" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -20
# 内部 API ルートに認証ミドルウェアが掛かっているか（ルート定義の一覧）
find . \( -name node_modules -o -name vendor -o -name dist -o -name build -o -name .git -o -name coverage -o -name .next -o -name .astro -o -name .venv -o -name venv -o -name __pycache__ -o -name .vercel -o -name .output -o -name .nuxt -o -name .svelte-kit -o -name target \) -prune -o \( -path "*/api/*" -o -path "*/routes/*" \) \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.rb" -o -name "*.go" -o -name "*.php" \) -print 2>/dev/null | head -40
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
