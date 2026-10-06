# ③ 認証情報の奪取による正規ユーザー偽装

SSO の認証情報やセッション Cookie を盗み、正規ユーザーとしてログインする攻撃。
設計上の欠陥は「パスワードだけの認証」「MFA をバイパスできる経路」「長すぎる・不変なセッション」。

## 対応する問診

Q4（認証方式と MFA）、Q5（管理者アカウントの共有）。

## 実測手順

対象ディレクトリの中で読む。ブロック先頭の `EX` が共通の除外ディレクトリで、すべての grep に付ける。
秘密情報らしき値が見つかっても、レポートには**パスと行番号だけ**を書き、値を書かない。

```bash
EX='--exclude-dir=node_modules --exclude-dir=vendor --exclude-dir=dist --exclude-dir=build --exclude-dir=.git --exclude-dir=coverage --exclude-dir=.next --exclude-dir=.astro'
# 認証ライブラリ
grep -rniE "next-auth|@auth/core|passport|devise|django\.contrib\.auth|firebase/auth|@supabase/(auth|ssr)|lucia|better-auth|auth0|amazon-cognito|keycloak" --include="package.json" --include="Gemfile" --include="requirements*.txt" --include="pyproject.toml" --include="*.ts" --include="*.py" $EX . | head -20
# MFA の実装
grep -rniE "totp|otpauth|webauthn|fido|passkey|mfa|two[_-]?factor|2fa" $EX . | head -30
# セッション・Cookie の設定
grep -rniE "maxAge|max_age|expires|ttl|SESSION_COOKIE_AGE|httpOnly|sameSite|secure:\s*(true|false)" $EX . | head -40
# パスワードの保存方式
grep -rniE "bcrypt|argon2|scrypt|pbkdf2" $EX . | head -10
grep -rniE "(md5|sha1)\(.*(pass|pwd)" $EX . | head -10
# ハードコードされた秘密情報（.env.example は除く）
grep -rnE "(api[_-]?key|secret|token|password)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}['\"]" $EX --exclude="*.example" --exclude="*.sample" . | head -20
```

読み取ること:

- 自前実装なら、パスワードのハッシュ方式と MFA 実装の有無
- 外部 IdP なら、セッションの有効期限と Cookie 属性（HttpOnly / Secure / SameSite）
- セッションの有効期限が 30 日を超える、または無期限
- 管理画面のルートに認証ミドルウェアが掛かっているか（ルート定義と認証ミドルウェアの import を突き合わせる）

## 所見の書き方

| 実測 | 問診 | 優先度 |
| --- | --- | --- |
| MFA 未検出 | Q4 が「自前、MFA なし」かつ Q5 が「2 人以上で共有」 | 高 |
| MFA 未検出 | Q4 が「MFA あり」 | 食い違い → 段 1.5 で裁定。そのまま進むなら高 |
| セッション TTL が 30 日超または無期限 | どの答えでも | 中 |
| Cookie に HttpOnly / Secure が未検出 | どの答えでも | 中 |
| md5 / sha1 でパスワードをハッシュ | どの答えでも | 高 |
| ハードコードされた秘密情報 | どの答えでも | 高（即時ローテーションを促す） |

## 直し方の方向

- MFA を標準にする（FIDO2 / WebAuthn / パスキーを優先）
- セッションの有効期限を短くし、IP やデバイスに結びつける。Cookie は HttpOnly / Secure / SameSite
- 管理者アカウントは個人ごとに発行し、最小権限（RBAC / ABAC）で絞る
- 秘密情報は環境変数かシークレットマネージャへ移し、漏れたものはローテーションする
