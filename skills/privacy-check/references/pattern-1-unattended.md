# ① 管理の隙を突かれたランサム感染・データ暗号化

夏季休暇や夜間など、管理者が手薄な時間帯に侵入し、バックアップごと暗号化する攻撃。
設計上の欠陥は「異常を検知して自動で止める仕組みが無い」「バックアップが同じ場所にあり一緒に暗号化される」。

## 対応する問診

Q6（夜間・休日の体制）、Q7（復旧テスト）。

## 実測手順

対象ディレクトリの中で読む。一致行を出力する grep はすべて `| cut -d: -f1,2` で path:line だけを出す（値をツール出力に乗せない）。該当行の中身を確認するときは次の形で開き、引用符で囲まれた 16 文字以上と `=` / `:` の後ろの 20 文字以上を伏せる: `sed -n "<行番号>p" <path> | sed -E "s/\"[^\"]{16,}\"/\"***\"/g; s/'[^']{16,}'/'***'/g; s/([:=][[:space:]]*)[^[:space:]\"']{20,}/\1***/g"`。すべての grep に共通の除外指定（brace 展開の `--exclude-dir` 16 ディレクトリと、`.env*` / minified / lock ファイルの `--exclude`）を付ける。brace 展開は bash / zsh の両方で効く。`.env*` は値が入っているので一致行を出さない。

```bash
# バックアップの定義（IaC・compose・CI・スクリプト）
grep -rniE "backup|snapshot|pg_dump|mysqldump|mongodump" --include="*.tf" --include="*.yml" --include="*.yaml" --include="*.sh" --include="*.mjs" --include="*.ts" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -50
# バックアップ先の分離（別アカウント・別リージョン・オブジェクトロック・バージョニング）
grep -rniE "object_lock|immutab|versioning|cross[_-]region|replica|retention_in_days|lifecycle" --include="*.tf" --include="*.yml" --include="*.yaml" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -30
# 異常検知・レート制限・自動遮断
grep -rniE "rate[_-]?limit|anomal|threshold|alert\(|lockout|too_many|status.{0,12}429" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -50
# 監視 SDK
grep -rliE "@sentry|datadog|newrelic|cloudwatch|opentelemetry" --include="*.json" --include="*.ts" --include="*.js" --include="*.py" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | head -20
```

読み取ること:

- バックアップ定義があるか。あるなら保存先が本番と同じアカウント・同じネットワークか
- 大量ダウンロード・大量削除・短時間の大量ログイン失敗に対する検知やレート制限があるか
- 監視 SDK があっても「しきい値」や「通知先」が設定されているか（SDK の存在だけでは検知にならない）

## 所見の書き方

| 実測 | 問診 | 優先度 |
| --- | --- | --- |
| バックアップ定義が無い、または本番と同じ場所 | Q7 が「1 年より前 / していない」 | 高 |
| バックアップ定義あり、分離は未検出 | Q7 が「1 年以内」 | 中 |
| 検知・レート制限が未検出 | Q6 が「何も無い」 | 高 |
| 検知・レート制限が未検出 | Q6 が「アラート通知のみ」 | 中 |
| 監視 SDK あり、しきい値未検出 | どの答えでも | 低（しきい値の確認を促す） |

事実にはパスと行番号を添える。「バックアップがあるから安全」とは書かない。復旧テスト未実施なら「復旧できる保証が無い」と明記する。

## 直し方の方向

- バックアップは別アカウント・別リージョンの追加専用（オブジェクトロック / イミュータブル）ストレージへ
- 休日・夜間の大量ダウンロード・大量削除を検知し、API レート制限と自動アカウントロックで止める
- 復旧テストを定期化し、所要時間を記録する
