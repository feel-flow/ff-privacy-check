import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const skillDir = join(root, "skills", "privacy-check");
export const refDir = join(skillDir, "references");
export const read = (path) => readFileSync(path, "utf8");

const COMMAND = "/ff-privacy-check:privacy-check";
const EXCLUDE_DIR = /--exclude-dir=\{node_modules,vendor,dist,build,\.git,coverage,\.next,\.astro,\.venv,venv,__pycache__,\.vercel,\.output,\.nuxt,\.svelte-kit,target\}/;
const EXCLUDE_ENV = /--exclude='\.env\*'/;
// 段 2 は read-only。実測ブロックに紛れてはいけないコマンドの針。
const FORBIDDEN_IN_BASH = [
  /\brm\b/,
  /\bgit (commit|push|stash|checkout|add|reset|clean)\b/,
  /\b(npm|pnpm|yarn|pip|pip3|bundle|cargo) (audit|install|add|update)\b/,
  /\b(curl|wget)\b/,
  /(^|[^2&>])>(?!&)\s*[^ &|]/m, // ファイルへのリダイレクト（2>/dev/null と >& は許す）
];

const bashBlocks = (markdown) =>
  [...markdown.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);

const patternFiles = () =>
  readdirSync(refDir)
    .filter((f) => /^pattern-[1-5]-[a-z-]+\.md$/.test(f))
    .sort();

test("plugin.json declares name / version / license / description", () => {
  const manifestPath = join(root, ".claude-plugin", "plugin.json");
  assert.ok(existsSync(manifestPath), "plugin.json が無い");
  const manifest = JSON.parse(read(manifestPath));
  assert.equal(manifest.name, "ff-privacy-check");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.license, "Apache-2.0");
  assert.ok(manifest.description.length > 20, "description が短すぎる");
  assert.equal(manifest.author?.name, "FeelFlow Inc.");
  assert.equal(
    manifest.repository,
    "https://github.com/feel-flow/ff-privacy-check"
  );
});

test("marketplace.json makes this public repo installable without feelflow-plugins", () => {
  const marketplacePath = join(root, ".claude-plugin", "marketplace.json");
  assert.ok(existsSync(marketplacePath), "marketplace.json が無い（feelflow-plugins は private なので公開読者はここから入れる）");
  const marketplace = JSON.parse(read(marketplacePath));
  assert.equal(marketplace.name, "ff-privacy-check");
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, "ff-privacy-check");
  assert.equal(marketplace.plugins[0].source, "./");
  const readme = read(join(root, "README.md"));
  assert.ok(readme.includes("claude plugin marketplace add feel-flow/ff-privacy-check"), "README の導入が公開 marketplace 経路になっていない");
  assert.ok(readme.includes("claude plugin install ff-privacy-check@ff-privacy-check"), "README の install が公開 marketplace 名になっていない");
});

test("report template has the fixed sections", () => {
  const template = read(join(refDir, "report-template.md"));
  assert.match(template, /^## サマリ$/m);
  assert.match(template, /^## 段 1\.5 の確認結果$/m);
  assert.match(template, /^## パターン別所見$/m);
  for (const label of [
    "① 管理の隙",
    "② パッチ前侵入",
    "③ アカウント奪取",
    "④ サプライチェーン",
    "⑤ 過剰保持",
  ]) {
    assert.match(
      template,
      new RegExp(`^### ${label}$`, "m"),
      `${label} の小見出しが無い`
    );
  }
  assert.match(template, /^## この検査で見つからないもの$/m);
  assert.match(template, /^## 次の一歩$/m);
  assert.match(template, /未検出/, "下読みで何も読めなかったときの表記が無い");
  assert.ok(template.includes(COMMAND), "再実行コマンドの表記が無い");

  const notFound = template.split("## この検査で見つからないもの")[1].split("## 次の一歩")[0];
  const bullets = notFound.split("\n").filter((line) => line.startsWith("- "));
  assert.equal(bullets.length, 6, "「見つからないもの」は 6 項目を固定で載せる");
});

test("question bank has Q1..Q10, 2-4 options per (sub)question, a 分からない option, and the re-run rule", () => {
  const bank = read(join(refDir, "question-bank.md"));
  const sections = bank.split(/^### /m).slice(1);
  const questions = sections.filter((s) => /^Q\d+: /.test(s));
  assert.equal(questions.length, 10, `Q は 10 問: ${questions.length}`);
  for (let i = 1; i <= 10; i += 1) {
    const section = questions.find((s) => s.startsWith(`Q${i}: `));
    assert.ok(section, `Q${i} が無い`);
    const body = section.split(/^## /m)[0];
    assert.match(body, /^- .*分からない/m, `Q${i} に「分からない」を含む選択肢が無い`);
    // AskUserQuestion は 1 問あたり選択肢 2〜4 件。小問（####）があれば小問ごとに数える
    const chunks = body.split(/^#### /m);
    const optionChunks = chunks.filter((c) => /^- /m.test(c));
    assert.ok(optionChunks.length > 0, `Q${i} に選択肢が無い`);
    for (const chunk of optionChunks) {
      const options = chunk.split("\n").filter((l) => l.startsWith("- ")).length;
      assert.ok(options >= 2 && options <= 4, `Q${i} の選択肢は 2〜4 件（AskUserQuestion の上限）: ${options} 件 — ${chunk.split("\n")[0].slice(0, 40)}`);
    }
  }
  assert.doesNotMatch(bank, /^### Q11: /m, "Q11 以降は仕様外");
  assert.match(bank, /^## 下読みによる質問文の具体化$/m);
  assert.match(bank, /^## profile\.md がある場合$/m);
  assert.match(bank, /^## profile\.md の保存形式$/m);
});

test("every pattern reference has the four sections and read-only commands", () => {
  const patterns = patternFiles();
  assert.equal(patterns.length, 5, `pattern ファイルは 5 本: ${patterns.join(", ")}`);
  for (const file of patterns) {
    const body = read(join(refDir, file));
    for (const heading of [
      "## 対応する問診",
      "## 実測手順",
      "## 所見の書き方",
      "## 直し方の方向",
    ]) {
      assert.match(
        body,
        new RegExp(`^${heading}$`, "m"),
        `${file} に ${heading} が無い`
      );
    }
    const blocks = bashBlocks(body);
    assert.ok(blocks.length > 0, `${file} に実測コマンドの例が無い`);
    for (const block of blocks) {
      for (const line of block.split("\n")) {
        if (line.startsWith("#") || line.trim() === "") continue;
        if (/^grep /.test(line)) {
          assert.match(line, EXCLUDE_DIR, `${file}: grep に除外ディレクトリが無い: ${line.slice(0, 60)}`);
          assert.match(line, EXCLUDE_ENV, `${file}: grep に .env* の除外が無い: ${line.slice(0, 60)}`);
        }
        if (/^grep /.test(line) && !/\s-r?l\S*\s/.test(line) && !/-rli?E? /.test(line)) {
          assert.match(
            line,
            /\| cut -d: -f1,2/,
            `${file}: 一致行を出す grep が path:line に切り詰められていない: ${line.slice(0, 60)}`
          );
        }
        if (/^find /.test(line)) {
          assert.match(line, /-name node_modules .*-name target \\\) -prune/, `${file}: find の prune が不足: ${line.slice(0, 60)}`);
        }
        for (const forbidden of FORBIDDEN_IN_BASH) {
          assert.doesNotMatch(line, forbidden, `${file}: read-only でないコマンド: ${line.slice(0, 80)}`);
        }
      }
    }
  }
});

test("secret-bearing greps print only path:line", () => {
  for (const file of ["pattern-3-account.md", "pattern-4-supply-chain.md"]) {
    const body = read(join(refDir, file));
    const lines = bashBlocks(body).join("\n").split("\n");
    const sensitive = lines.filter((l) => /^grep .*(secret|token|password|https\?:\/\/)/.test(l));
    assert.ok(sensitive.length > 0, `${file}: 秘密情報・URL を探す grep が見つからない`);
    for (const line of sensitive) {
      assert.match(line, /\| cut -d: -f1,2/, `${file}: 値を出力し得る grep が path:line に切り詰められていない: ${line.slice(0, 80)}`);
    }
  }
});

test("SKILL.md has frontmatter, references, stages and read-only rules", () => {
  const skillPath = join(skillDir, "SKILL.md");
  assert.ok(existsSync(skillPath), "SKILL.md が無い");
  const skill = read(skillPath);
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  assert.match(frontmatter, /^name: privacy-check$/m);
  assert.match(frontmatter, /^description: .{40,}/m);

  const refs = [...skill.matchAll(/references\/([\w.-]+\.md)/g)].map((m) => m[1]);
  assert.ok(refs.length >= 7, `references の参照が少ない: ${refs.length}`);
  for (const ref of new Set(refs)) {
    assert.ok(existsSync(join(refDir, ref)), `参照先が無い: references/${ref}`);
  }
  for (const file of patternFiles()) {
    assert.ok(refs.includes(file), `SKILL.md が ${file} を参照していない`);
  }

  for (const stage of [
    "## 段 0: 下読み",
    "## 段 1: 問診",
    "## 段 1.5: 確認",
    "## 段 2: 実測",
    "## 段 3: 所見",
  ]) {
    assert.match(skill, new RegExp(`^${stage}$`, "m"), `${stage} が無い`);
  }
  for (const word of ["ビルド", "テスト実行", "外部送信", "git 書き込み"]) {
    assert.match(skill, new RegExp(word), `read-only 規定に「${word}」が無い`);
  }
  assert.match(skill, EXCLUDE_DIR, "除外ディレクトリの記載が無い");
  assert.match(skill, EXCLUDE_ENV, ".env* を読まない規定が無い");
  assert.match(skill, /値をレポートに書かない/, "秘密情報の値を書かない規定が無い");
  assert.match(skill, /\[\^\\"\]\{16,\}/, "該当行を開くときの伏せ字（任意文字 16 文字以上）の規定が無い");
  assert.match(skill, /password\|passwd\|pwd\|secret\|token\|api\[_-\]\?key/, "キー名に続く値を長さによらず伏せる規定が無い");
  assert.match(skill, /Q1 から/, "profile.md が読めないときの規定が無い");
  assert.match(
    skill,
    /未検出だった場合に限って/,
    "問診の答えだけで検査を省く経路が残っている"
  );
  assert.match(
    skill,
    /段 0 をやり直して/,
    "Q10 で対象が変わったときに下読みをやり直す規定が無い"
  );
  assert.match(skill, /同じもの/, "段 0 の検出語を pattern と揃える規定が無い");
  assert.match(skill, /この検査で見つからないもの/, "固定節への言及が無い");
  assert.match(skill, /段 1\.5 に戻って/, "実測で新たに見つかった食い違いを段 1.5 へ戻す規定が無い");
  assert.match(skill, /上書きしない/, "同日再実行でレポートを上書きしない規定が無い");
});

test("README documents the command, the five stages and ignore targets", () => {
  const readme = read(join(root, "README.md"));
  assert.ok(readme.includes(COMMAND), `README に ${COMMAND} が無い`);
  for (const stage of ["段 0", "段 1 ", "段 1.5", "段 2", "段 3"]) {
    assert.ok(readme.includes(stage), `README の 5 段表に ${stage.trim()} が無い`);
  }
  assert.match(readme, /\.privacy-check\//, "README が profile の置き場に触れていない");
  assert.match(readme, /privacy-check-report-\*\.md/, "README が所見レポートの gitignore に触れていない");
  assert.match(readme, /node --test/, "README の開発コマンドが無い");
});
