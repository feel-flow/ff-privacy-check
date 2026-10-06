# ⑤ 一度の侵入による大量かつ過剰な機密情報の漏洩

侵入自体は 1 回でも、不要な過去データや本人確認書類の画像が同じ DB に平文で残っていたために被害が桁違いになるケース。
設計上の欠陥は「データ最小化の原則が守られていない」「高機密データが一般データと同じ場所に平文で長期保存されている」。

## 対応する問診

Q1（個人情報の種類）、Q2（本人確認書類の画像）、Q3（保持期間と削除）。Q1 が「個人情報は扱っていない」でも、下読みで個人情報カラムやアップロード処理が検出されていれば省かない。

## 実測手順

対象ディレクトリの中で読む。ブロック先頭の `EX` が共通の除外ディレクトリで、すべての grep に付ける。
`.env` の中身は読まない（追跡されているかどうかだけを見る）。

```bash
EX='--exclude-dir=node_modules --exclude-dir=vendor --exclude-dir=dist --exclude-dir=build --exclude-dir=.git --exclude-dir=coverage --exclude-dir=.next --exclude-dir=.astro'
# スキーマ・モデルに含まれる個人情報カラム
grep -rniE "email|phone|tel|address|zip|postal|birth|dob|gender|my_?number|mynumber|license|passport|ssn|credit|card_number" --include="*.prisma" --include="*.sql" --include="schema*.rb" --include="models.py" --include="*.entity.ts" --include="*schema*.ts" $EX . | head -60
# ログへの個人情報の出力
grep -rnE "(logger|log|console)\.(log|info|debug|warn|error)\(.*(email|phone|address|birth|password|token|card)" $EX . | head -40
# アプリ層の暗号化
grep -rniE "encrypt|cipher|kms|pgcrypto|crypto\.(createCipher|subtle)" $EX . | head -20
# 画像アップロードと保存先
grep -rniE "multer|formidable|busboy|putObject|upload\(|storage\.(from|bucket)|createWriteStream" $EX . | head -30
grep -rniE "kyc|identity|id_card|license|passport" $EX -l . | head -20
# 保持期限・削除・匿名化のジョブ
grep -rniE "retention|purge|anonymi[sz]e|pseudonymi[sz]e|delete.*(older|before|expired)|cron|schedule" $EX . | head -40
# .env が追跡対象になっていないか
grep -nE "^\.env" .gitignore 2>/dev/null; git ls-files | grep -E "^\.env($|\.)" | grep -vE "\.(example|sample)$"
```

読み取ること:

- 個人情報カラムが「一般ユーザー情報」と同じテーブル・同じ DB にあるか。高機密（決済・本人確認・要配慮）が分離されているか
- ログに個人情報が渡っている行があるか（1 行でも高）
- 画像アップロード処理があるのに Q2 が「保管していない」なら食い違い
- 削除・匿名化のジョブがあるか。Q3 が「自動で削除」なのに未検出なら食い違い
- `.env` 実体が git に追跡されていれば高（③と重なる）

## 所見の書き方

| 実測 | 問診 | 優先度 |
| --- | --- | --- |
| ログに個人情報の出力 | どの答えでも | 高 |
| 本人確認画像の保存処理あり、削除ジョブ未検出 | Q2 が「保管している」 | 高 |
| 本人確認画像の保存処理あり | Q2 が「保管していない」 | 食い違い → 段 1.5 で裁定。そのまま進むなら高 |
| 高機密カラムが一般情報と同居、暗号化未検出 | Q1 に決済・本人確認・要配慮を含む | 高 |
| 削除ジョブ未検出 | Q3 が「方針が無い」 | 中 |
| 削除ジョブ未検出 | Q3 が「自動で削除」 | 食い違い → 段 1.5 で裁定 |
| `.env` 実体が追跡対象 | どの答えでも | 高 |

## 直し方の方向

- 保持期間を決め、期限切れデータの自動削除・匿名化バッチを実装する。本人確認書類は確認後に消す
- 一般ユーザー情報と高機密データ（画像・決済）を物理的・論理的に分離し、保存時とアプリ層で暗号化する
- ログには個人情報を書かない。必要なら ID だけにし、マスキングを通す
- アクセスログ・操作ログは追加専用ストレージや SIEM へ即時転送し、改ざんされない形で残す
