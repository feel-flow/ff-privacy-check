# ② 脆弱性パッチ適用前のゼロデイ / N デイ侵入

VPN・BI ツール・フレームワークの既知脆弱性が公表されてから数日以内に突かれる攻撃。
設計上の欠陥は「パッチ適用にダウンタイムや手作業が要る」「境界防御に依存し、内部の横展開を防げない」。

## 対応する問診

Q8（パッチ適用のリードタイム）。

## 実測手順

対象ディレクトリの中で読む。一致行を出力する grep はすべて `| cut -d: -f1,2` で path:line だけを出す（値をツール出力に乗せない）。該当行の中身を確認するときは次の形で開き、引用符で囲まれた 16 文字以上と `=` / `:` の後ろの 20 文字以上を伏せ、さらに password / secret / token / api_key / authorization / cookie / private_key / client_secret などのキー名に続く値は長さによらず伏せる（キー名が JSON のように引用符で囲まれていても効く。`I` フラグで大文字小文字を無視。bash / zsh で実測）: `sed -n "<行番号>p" <path> | sed -E "s/\"[^\"]{16,}\"/\"***\"/g; s/'[^']{16,}'/'***'/g; s/([:=][[:space:]]*)[^[:space:]\"']{20,}/\1***/g; s/((password|passwd|pwd|secret|token|api[_-]?key|apikey|authorization|cookie|private[_-]?key|client[_-]?secret)[A-Za-z0-9_]*[\"']?[[:space:]]*[:=][[:space:]]*)(\"[^\"]*\"|'[^']*'|[^,;]+)/\1***/Ig"`。すべての grep に共通の除外指定（brace 展開の `--exclude-dir` 16 ディレクトリと、`.env*` / minified / lock ファイルの `--exclude`）を付ける。brace 展開は bash / zsh の両方で効く。`.env*` は値が入っているので一致行を出さない。

```bash
# 依存関係の自動更新（repo ルートと各アプリのディレクトリ）
find . \( -name node_modules -o -name vendor -o -name dist -o -name build -o -name .git -o -name coverage -o -name .next -o -name .astro -o -name .venv -o -name venv -o -name __pycache__ -o -name .vercel -o -name .output -o -name .nuxt -o -name .svelte-kit -o -name target \) -prune -o \( -name dependabot.yml -o -name dependabot.yaml -o -name renovate.json -o -name .renovaterc -o -name .renovaterc.json -o -name renovate.json5 \) -print 2>/dev/null | head -10
# lock ファイルの有無（再現可能なビルドか。サブディレクトリのアプリも拾う）
find . \( -name node_modules -o -name vendor -o -name dist -o -name build -o -name .git -o -name coverage -o -name .next -o -name .astro -o -name .venv -o -name venv -o -name __pycache__ -o -name .vercel -o -name .output -o -name .nuxt -o -name .svelte-kit -o -name target \) -prune -o \( -name package-lock.json -o -name pnpm-lock.yaml -o -name yarn.lock -o -name poetry.lock -o -name Pipfile.lock -o -name Gemfile.lock -o -name go.sum -o -name Cargo.lock \) -print 2>/dev/null | head -20
# マニフェストの所在（lock と対にして「lock の無いアプリ」を特定する）
find . \( -name node_modules -o -name vendor -o -name dist -o -name build -o -name .git -o -name coverage -o -name .next -o -name .astro -o -name .venv -o -name venv -o -name __pycache__ -o -name .vercel -o -name .output -o -name .nuxt -o -name .svelte-kit -o -name target \) -prune -o \( -name package.json -o -name pyproject.toml -o -name requirements.txt -o -name Gemfile -o -name go.mod -o -name Cargo.toml \) -print 2>/dev/null | head -20
# CI で監査・更新を回しているか
grep -rniE "audit|snyk|trivy|grype|osv-scanner|dependabot|renovate" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' .github/workflows/ .gitlab-ci.yml 2>/dev/null | cut -d: -f1,2 | head -20
# コンテナのベースイメージの固定（:latest は追従も再現もできない）
grep -rnE "^FROM " --include="Dockerfile*" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -20
# デプロイの自動化（手動デプロイはパッチ適用を遅らせる）。CI のほか、git 連携デプロイのプラットフォーム設定も自動化と数える
grep -rliE "deploy|release" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' .github/workflows/ .gitlab-ci.yml 2>/dev/null | head -10
find . \( -name node_modules -o -name vendor -o -name dist -o -name build -o -name .git -o -name coverage -o -name .next -o -name .astro -o -name .venv -o -name venv -o -name __pycache__ -o -name .vercel -o -name .output -o -name .nuxt -o -name .svelte-kit -o -name target \) -prune -o \( -name vercel.json -o -name netlify.toml -o -name fly.toml -o -name render.yaml -o -name app.yaml -o -name Procfile -o -name wrangler.toml -o -name amplify.yml \) -print 2>/dev/null | head -10
```

読み取ること:

- 自動更新の設定があるか。あってもマージされているかは問診（Q8）で補う
- lock ファイルが無いと、脆弱性のある版が入っているかどうかを特定できない。マニフェストの一覧と突き合わせ、lock の無いアプリ（ディレクトリ）を名指しする。段 0 で見つけたアプリのパスを引き継ぐ
- `FROM image:latest` は「どの版が動いているか分からない」ことを意味する
- `vercel.json` / `netlify.toml` / `fly.toml` などの git 連携デプロイ設定は自動デプロイとみなす。CI ワークフローが無いだけで「手動デプロイ」と書かない
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
