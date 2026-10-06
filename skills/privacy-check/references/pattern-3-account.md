# ③ 認証情報の奪取による正規ユーザー偽装

SSO の認証情報やセッション Cookie を盗み、正規ユーザーとしてログインする攻撃。
設計上の欠陥は「パスワードだけの認証」「MFA をバイパスできる経路」「長すぎる・不変なセッション」。

## 対応する問診

Q4（認証方式と MFA）、Q5（管理者アカウントの共有）。

## 実測手順

対象ディレクトリの中で読む。一致行を出力する grep はすべて `| cut -d: -f1,2` で path:line だけを出す（値をツール出力に乗せない）。該当行の中身を確認するときは次の形で開き、引用符で囲まれた 16 文字以上と `=` / `:` の後ろの 20 文字以上を伏せ、さらに password / secret / token / api_key / authorization / cookie / private_key / client_secret などのキー名に続く値は長さによらず伏せる（キー名が JSON のように引用符で囲まれていても効く。`I` フラグで大文字小文字を無視。bash / zsh で実測）: `sed -n "<行番号>p" <path> | sed -E "s/\"[^\"]{16,}\"/\"***\"/g; s/'[^']{16,}'/'***'/g; s/([:=][[:space:]]*)[^[:space:]\"']{20,}/\1***/g; s/((password|passwd|pwd|secret|token|api[_-]?key|apikey|authorization|cookie|private[_-]?key|client[_-]?secret)[A-Za-z0-9_]*[\"']?[[:space:]]*[:=][[:space:]]*)(\"[^\"]*\"|'[^']*'|[^,;]+)/\1***/Ig"`。すべての grep に共通の除外指定（brace 展開の `--exclude-dir` 16 ディレクトリと、`.env*` / minified / lock ファイルの `--exclude`）を付ける。brace 展開は bash / zsh の両方で効く。`.env*` は値が入っているので一致行を出さない。
秘密情報らしき値が見つかっても、レポートには**パスと行番号だけ**を書き、値を書かない。すべての grep は `cut -d: -f1,2` で path:line に切り詰めてから出力し、一致行の中身をツール出力に出さない。

```bash
# 認証ライブラリ
grep -rniE "next-auth|@auth/core|passport|devise|django\.contrib\.auth|firebase/auth|@supabase/(auth|ssr)|lucia|better-auth|auth0|amazon-cognito|keycloak" --include="package.json" --include="Gemfile" --include="requirements*.txt" --include="pyproject.toml" --include="*.ts" --include="*.py" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -20
# MFA の実装
grep -rniE "totp|otpauth|webauthn|fido|passkey|mfa|two[_-]?factor|2fa" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -30
# セッション・Cookie の設定
grep -rniE "maxAge|max_age|expires(In|_in)?\b|\bttl\b|SESSION_COOKIE_AGE|httpOnly|sameSite|secure:\s*(true|false)" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -40
# パスワードの保存方式
grep -rniE "bcrypt|argon2|scrypt|pbkdf2" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -10
grep -rniE "(md5|sha1)\(.*(pass|pwd)" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' . | cut -d: -f1,2 | head -10
# ハードコードされた秘密情報（.env.example は除く。-i で SECRET_KEY / apiKey も拾い、cut で path:line だけ出す）
grep -rniE "(api[_-]?key|secret|token|password)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}['\"]" --exclude-dir={node_modules,vendor,dist,build,.git,coverage,.next,.astro,.venv,venv,__pycache__,.vercel,.output,.nuxt,.svelte-kit,target} --exclude='.env*' --exclude='*.min.js' --exclude='*.map' --exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' --exclude="*.example" --exclude="*.sample" . | cut -d: -f1,2 | head -20
```

読み取ること:

- 自前実装なら、パスワードのハッシュ方式と MFA 実装の有無
- 外部 IdP なら、セッションの有効期限と Cookie 属性（HttpOnly / Secure / SameSite）
- セッションの有効期限が 30 日を超える、または無期限
- 管理画面のルートに認証ミドルウェアが掛かっているか（ルート定義と認証ミドルウェアの import を突き合わせる）

## 所見の書き方

| 実測 | 問診 | 優先度 |
| --- | --- | --- |
| MFA 未検出 | Q4 が「自前実装のパスワード認証、MFA なし」かつ Q5 が「2〜3 人で共有」または「4 人以上で共有」 | 高 |
| MFA 未検出 | Q4 が「自前実装、MFA あり」 | 食い違い → 段 1.5 で裁定。そのまま進むなら高 |
| MFA 未検出 | Q4 が「外部 IdP / SSO、MFA あり」 | 要確認（MFA は IdP 側の設定で repo には現れない。高にするには IdP を迂回するログイン経路など実測の事実が要る） |
| セッション TTL が 30 日超または無期限 | どの答えでも | 中 |
| Cookie に HttpOnly / Secure が未検出 | どの答えでも | 中 |
| md5 / sha1 でパスワードをハッシュ | どの答えでも | 高 |
| ハードコードされた秘密情報 | どの答えでも | 高（即時ローテーションを促す） |

## 直し方の方向

- MFA を標準にする（FIDO2 / WebAuthn / パスキーを優先）
- セッションの有効期限を短くし、IP やデバイスに結びつける。Cookie は HttpOnly / Secure / SameSite
- 管理者アカウントは個人ごとに発行し、最小権限（RBAC / ABAC）で絞る
- 秘密情報は環境変数かシークレットマネージャへ移し、漏れたものはローテーションする
