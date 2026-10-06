# ff-privacy-check 設計

原本は社内の設計 spec（非公開）。ここには plugin に関わる「5 つの欠陥パターン」「第 1 節」「第 2 節」を写している。

**配布構成（現行）**: ソースの正本は株式会社フィールフロウの社内リポジトリ（非公開）の `plugins/ff-privacy-check/` にあり、公開リポジトリ feel-flow/ff-privacy-check は一方向同期のミラー（公開側は `plugins/ff-privacy-check/` + ルート `.claude-plugin/marketplace.json`、source は `./plugins/ff-privacy-check`）。公開側を直接編集しても次回の同期で消える。

実装（`skills/privacy-check/SKILL.md` と `references/`）は、公開前のレビューで次を spec より厳しくしている: 段 1.5 の表は裁定列つきの 5 列、`未検出` は「無い」ではなく「読めなかった」、問診の答えだけで検査を省かない（段 0 で未検出の場合のみ）、Q10 で対象が変わったら段 0 をやり直す、段 2 で新たに見つかった食い違いは段 1.5 へ戻す、除外ディレクトリは 16 個と `.env*` / minified / lock、一致行を出す grep は path:line のみ出力し該当行は伏せ字 sed を通して開く、問診の選択肢は AskUserQuestion の上限（2〜4 件）に合わせて小問に分ける、repo 内の保存済みプロファイルを段 0 で探索する。spec と実装が食い違うときは実装を正とする。

## 5 つの欠陥パターン（共通の軸）

| # | パターン | 実測で読めること | 問診でしか分からないこと |
| --- | --- | --- | --- |
| ① | 管理の隙を突かれたランサム感染 | バックアップ先の設定、異常検知ロジックの有無 | 夜間・休日の監視体制、復旧テストの実施 |
| ② | パッチ適用前のゼロデイ / N デイ侵入 | 自動更新設定（Dependabot / Renovate）、lock ファイル、ベースイメージの固定、デプロイ自動化の度合い（CVE 照合は外部送信を伴うため対象外） | パッチ適用の実リードタイム |
| ③ | 認証情報奪取による正規ユーザー偽装 | MFA 実装、セッション TTL、Cookie 属性 | IdP / SSO の提供元、管理者アカウントの運用 |
| ④ | サプライチェーン経由の侵入 | SBOM の有無、外部 API 呼び出しの認証 | 委託先の数と権限範囲 |
| ⑤ | 一度の侵入での過剰な漏洩（過剰保持） | ログへの PII 出力、平文カラム、削除バッチ | 保持期間の方針、本人確認書類の保管場所 |

問診は右列だけを聞く。左列は skill が読む。両方を並べて食い違いを人に
裁定してもらう段 1.5 が、汎用の `/security-review` に無い本 plugin の核。

## 第 1 節: `/privacy-check` の設計

### 段 0: 下読み

問診の前に repo の輪郭だけ読む。判定はしない。

- 言語とフレームワーク、パッケージマニフェスト
- ORM / スキーマ定義、マイグレーションの場所
- 認証ライブラリ、セッション管理の実装箇所
- ログライブラリと出力箇所
- CI 設定、スケジュールジョブ、バックアップ定義

### 段 1: 問診（Q1〜Q10）

AskUserQuestion で 1 問ずつ。下読みの結果で質問文を具体化する
（例: 「`next-auth` が見つかりました。MFA は有効にしていますか」）。

| # | 質問 | 使い道 |
| --- | --- | --- |
| Q1 | 扱う個人情報の種類（氏名・連絡先 / 決済 / 本人確認書類 / 要配慮） | ⑤の検査深度と所見の重み |
| Q2 | 本人確認書類などの画像を保管しているか、どこに | ⑤画像系チェックの ON / OFF |
| Q3 | 保持期間の方針と、削除が自動か手動か | ⑤削除バッチ探索の期待値 |
| Q4 | 認証方式（自前 / 外部 IdP / SSO）と MFA の有無 | ③の検査対象の切り替え |
| Q5 | 管理者アカウントの共有人数 | ③の所見の重み |
| Q6 | 夜間・休日の監視体制（人 / アラートのみ / なし） | ①の所見の重み |
| Q7 | バックアップ復旧テストの直近実施時期 | ①の所見 |
| Q8 | 脆弱性パッチ適用のリードタイム（日数） | ②の所見の重み |
| Q9 | 外部委託先・外部 API の数と権限の渡し方 | ④の検査範囲 |
| Q10 | 検査対象ディレクトリ（既定はカレント repo） | 実測の範囲 |

`.privacy-check/profile.md` が存在する場合は、Q1〜Q10 の代わりに
「前回の答えを使う / 更新する」の 1 問だけを出す。

### 段 1.5: 確認

Q10 の後、次の表を 1 枚出し「この理解で検査に進んでよいか」を 1 問で聞く。

| パターン | 問診の答え | コードから読めたこと | 食い違い |
| --- | --- | --- | --- |
| ③ | 自前実装、MFA あり | `passport-local` 使用、TOTP / WebAuthn の実装は未検出 | あり |
| ⑤ | 本人確認画像は保管なし | `kyc/upload.ts` に免許証画像の保存処理あり | あり |
| ① | 夜間はアラートのみ | Sentry 設定あり、しきい値は未検出 | なし |
| ③ | 外部 IdP、MFA あり | MFA 設定は未検出（IdP 側の設定で repo には現れない） | なし（要確認として所見に残す） |
| ⑤ | 本人確認画像は保管なし | `uploads/avatar.ts` に一般画像の保存処理あり | なし（本人確認書類と結びつかない） |

食い違いがある行は「問診の答えを直す / コードの読みが違う / そのまま進む」
から選べる。外部 IdP の MFA のように repo に現れない設定は食い違いにせず「要確認」として所見に残す。一般の画像アップロードは本人確認書類と結びつく（kyc / identity / id_card / license / passport と同じファイルやパス）場合だけ食い違いにする。確定した表を `profile.md` に保存し、以後の実測はこれを前提に走る。
「そのまま進む」とした行は段 3 の所見に必ず残す。自己申告と実装の不一致は
それ自体が②③の典型要因だからである。

### 段 2: 実測

パターンごとに `references/pattern-N-*.md` を読み、そこに書かれた手順で
調べる。read-only を厳守する。

- 許可: grep、ファイル読み取り、パッケージマニフェストと lock の読み取り
- 禁止: ビルド、テスト実行、外部送信、ファイル作成（所見レポートと
  `profile.md` を除く）、git 書き込み

実測の例（⑤）: ログ出力行に PII らしきフィールド名（email / phone /
address / birth など）が渡っていないか。ORM スキーマに平文の機微カラムが
無いか。保持期限つきの削除ジョブが存在するか。

### 段 3: 所見

`privacy-check-report-YYYYMMDD.md` を対象ディレクトリ（Q10 で確定した場所）の直下に出力する（同日 2 回目以降は `-2` `-3` の連番。`.privacy-check/profile.md` も同じ場所）。

1. サマリ 3 行（最重要の所見、全体の優先度、次の一歩）
2. パターン①〜⑤ごとに「問診の答え / 実測で見つかった事実 / 所見と優先度
   （高・中・低）/ 直し方の方向」
3. **この検査で見つからないもの**（固定節）: ペネトレーションテスト、
   運用手順の実地確認、インフラ側設定、権限の実運用、コードに現れない委託先
   の管理
4. 次の一歩（定期実行、ff-dev-toolkit との併用）

優先度は「問診の重み × 実測の事実」で決める。実測で見つかっていないことを
推測で所見にしない（genai-consultant の diagnose と同じ事実ベース原則）。
「直し方の方向」は素材ドキュメント §3 の設計方針（MFA 標準化、セッション
厳格化、無停止デプロイ、データ最小化、追加専用ログ、SBOM）を要約して使う。

## 第 2 節: repo と配布

### 新 repo `feel-flow/ff-privacy-check`

public、Apache-2.0。layout は ff-dev-toolkit と同じ `plugins/ff-privacy-check/` + ルート
`.claude-plugin/marketplace.json`（source `./plugins/ff-privacy-check`。公開ルートの marketplace.json は社内リポジトリ側では `oss/ff-privacy-check/` にあり、plugin ディレクトリの中には置かない）。下の構成は plugin ディレクトリの中身。

```text
ff-privacy-check/
  .claude-plugin/plugin.json      name / version（現行の値はファイルを正とする）/ description / license
  LICENSE
  README.md                        導入 3 行 + 使い方 + 見つからないものの明記
  docs/
    design.md                      本 spec の第 1 節・第 2 節を写したもの
  skills/
    privacy-check/
      SKILL.md                     段 0〜3 の手順（段 1.5 を含む）
      references/
        question-bank.md           Q1〜Q10 と質問文の具体化ルール
        pattern-1-unattended.md    ① 管理の隙
        pattern-2-unpatched.md     ② パッチ前侵入
        pattern-3-account.md       ③ アカウント奪取
        pattern-4-supply-chain.md  ④ サプライチェーン
        pattern-5-retention.md     ⑤ 過剰保持
        report-template.md         所見レポートの雛形（固定節を含む）
  tests/
    skill-contract.test.mjs        frontmatter、references の参照切れ、雛形の必須節
```

**ソースの正本は社内リポジトリ（非公開）の `plugins/ff-privacy-check/`**（2026-10-07 に方針変更）。
公開 repo はミラーで、ff-dev-toolkit と同じ `scripts/sync-*-to-public.sh` の一方向同期（git HEAD の allowlist を
staging に展開 → 禁止パターン・到達不能参照の検査 → `--delete` ミラー）で更新する。公開 repo へ直接コミットしない。
公開対象には非公開リポジトリ名など禁止パターンに当たる文字列を書かない（同期の検査で fail-closed に止まる）。
初版（v0.1.0〜v0.1.8）は公開 repo 直書きで公開し、v0.2.0 から SSOT 同期へ移行する（plugin.json の version を 0.2.0 に上げた変更が最初の同期）。

### 配布

1. 公開 repo 自身が公開 marketplace（社内 marketplace は private なので、公開読者の導入経路はこちら）
2. 社内の marketplace にも登録する（社内利用者向けの補足経路）
3. 導入コマンド（記事 B に転記する。公開経路）

```bash
claude plugin marketplace add feel-flow/ff-privacy-check
claude plugin install ff-privacy-check@ff-privacy-check
```

Codex CLI は同じ marketplace を読めるため、記事 B では 1 行の補足に留める。

### 動作確認

公開前に自社サイトの repo を検査対象にして 1 周回し、所見レポートを
記事 B の実行例に使う。所見や食い違いが出ても隠さず載せる。

### テスト

`tests/skill-contract.test.mjs`（node:test）で次を固定する。

- SKILL.md の frontmatter に `name` と `description` がある
- SKILL.md が参照する `references/*.md` がすべて存在する
- `report-template.md` に「この検査で見つからないもの」見出しがある
- 各 `pattern-N-*.md` に「実測手順」「所見の書き方」の見出しがある
