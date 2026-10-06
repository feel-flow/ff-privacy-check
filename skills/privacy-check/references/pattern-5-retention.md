# ⑤ 一度の侵入による大量かつ過剰な機密情報の漏洩

侵入自体は 1 回でも、不要な過去データや本人確認書類の画像が同じ DB に平文で残っていたために被害が桁違いになるケース。
設計上の欠陥は「データ最小化の原則が守られていない」「高機密データが一般データと同じ場所に平文で長期保存されている」。

## 対応する問診

Q1（個人情報の種類）、Q2（本人確認書類の画像）、Q3（保持期間と削除）。Q1 が「個人情報は扱っていない」でも、下読みで個人情報カラムやアップロード処理が検出されていれば省かない。

## 実測手順

対象ディレクトリの中で読む。一致行を出力する grep はすべて `| cut -d: -f1,2` で path:line だけを出す（値をツール出力に乗せない）。該当行の中身を確認するときは次の形で開き、引用符で囲まれた 16 文字以上と `=` / `:` の後ろの 20 文字以上を伏せ、さらに password / secret / token / api_key / authorization / cookie / private_key / client_secret などのキー名に続く値は長さによらず伏せる（`I` フラグで大文字小文字を無視。bash / zsh で実測）: `sed -n "<行番号>p" <path> | sed -E "s/\"[^\"]{16,}\"/\"***\"/g; s/'[^']{16,}'/'***'/g; s/([:=][[:space:]]*)[^[:space:]\"']{20,}/\1***/g; s/((password|passwd|pwd|secret|token|api[_-]?key|apikey|authorization|cookie|private[_-]?key|client[_-]?secret)[A-Za-z0-9_]*[[:space:]]*[:=][[:space:]]*)(\"[^\"]*\"|'[^']*'|[^[:space:],;]+)/\1***/Ig"`。すべての grep に共通の除外指定（brace 展開の `--exclude-dir` 16 ディレクトリと、`.env*` / minified / lock ファイルの `--exclude`）を付ける。brace 展開は bash / zsh の両方で効く。`.env*` は値が入っているので一致行を出さない。
`.env*` の中身は読まない（追跡されているかどうかだけを `git ls-files` で見る。全 grep が `--exclude='.env*'` で除外する）。

```bash
# スキーマ・モデルに含まれる個人情報カラム
grep -rniE "email|phone|tel|address|zip|postal|birth|dob|gender|my_?number|mynumber|license|passport|ssn|credit|card_number" --include="*.prisma" --include="*.sql" --include="schema*.rb" --include="models.py" --include="*.entity.ts" --include="*schema*.ts" --include="*.model.ts" --include="*model*.js" --include="*.go" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -60
# ログへの個人情報の出力
grep -rniE "(logger|log|console)\.(log|info|debug|warn|error)\(.*(email|phone|address|birth|password|token|card)" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -40
# アプリ層の暗号化
grep -rniE "encrypt|cipher|kms|pgcrypto|crypto\.(createCipher|subtle)" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -20
# 画像アップロードと保存先
grep -rniE "multer|formidable|busboy|putObject|upload\(|storage\.(from|bucket)|createWriteStream" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -30
grep -rniE "kyc|identity|id_card|license|passport" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' -l . | head -20
# 保持期限・削除・匿名化のジョブ
grep -rniE "retention|purge|anonymi[sz]e|pseudonymi[sz]e|delete.*(older|before|expired)|cron|schedule" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -40
# .env の実体が git に追跡されていないか（サブディレクトリも含む。中身は読まない）
git ls-files 2>/dev/null | grep -E "(^|/)\.env($|\.)" | grep -vE "\.(example|sample)$"
```

読み取ること:

- 個人情報カラムが「一般ユーザー情報」と同じテーブル・同じ DB にあるか。高機密（決済・本人確認・要配慮）が分離されているか
- ログに個人情報が渡っている行があるか（1 行でも高）
- 画像アップロード処理が本人確認書類と結びついている（同じファイルやパスに kyc / identity / id_card / license / passport が現れる）のに Q2 が「保管していない」なら食い違い。商品画像やアバターなど一般の画像アップロードだけでは食い違いにしない
- 削除・匿名化のジョブがあるか。Q3 が「自動で削除」なのに未検出なら食い違い
- `.env` 実体が git に追跡されていれば高（③と重なる）

## 所見の書き方

| 実測 | 問診 | 優先度 |
| --- | --- | --- |
| ログに個人情報の出力 | どの答えでも | 高 |
| 本人確認画像の保存処理あり、削除ジョブ未検出 | Q2 が「保管している」 | 高 |
| 本人確認書類と結びつく保存処理あり（kyc / identity / id_card / license / passport と同じファイルやパス） | Q2 が「保管していない」 | 食い違い → 段 1.5 で裁定。そのまま進むなら高 |
| 本人確認書類と結びつく保存処理あり | Q2 が「外部の本人確認サービスに預けている」 | 食い違い → 段 1.5 で裁定（自社側にも残っている可能性） |
| 一般の画像アップロード処理のみ | Q2 が「保管していない」 | 食い違いにしない（所見にも書かない） |
| 高機密カラムが一般情報と同居、暗号化未検出 | Q1 に決済・本人確認・要配慮を含む | 高 |
| 削除ジョブ未検出 | Q3 が「方針が無い」 | 中 |
| 削除ジョブ未検出 | Q3 が「自動で削除」 | 食い違い → 段 1.5 で裁定 |
| `.env` 実体が追跡対象 | どの答えでも | 高 |

## 直し方の方向

- 保持期間を決め、期限切れデータの自動削除・匿名化バッチを実装する。本人確認書類は確認後に消す
- 一般ユーザー情報と高機密データ（画像・決済）を物理的・論理的に分離し、保存時とアプリ層で暗号化する
- ログには個人情報を書かない。必要なら ID だけにし、マスキングを通す
- アクセスログ・操作ログは追加専用ストレージや SIEM へ即時転送し、改ざんされない形で残す
