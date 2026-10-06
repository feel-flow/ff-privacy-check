import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const skillDir = join(root, "skills", "privacy-check");
export const refDir = join(skillDir, "references");
export const read = (path) => readFileSync(path, "utf8");

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
});

test("question bank has Q1..Q10 and the re-run rule", () => {
  const bank = read(join(refDir, "question-bank.md"));
  for (let i = 1; i <= 10; i += 1) {
    assert.match(bank, new RegExp(`^### Q${i}: `, "m"), `Q${i} が無い`);
  }
  assert.doesNotMatch(bank, /^### Q11: /m, "Q11 以降は仕様外");
  assert.match(bank, /^## 下読みによる質問文の具体化$/m);
  assert.match(bank, /^## profile\.md がある場合$/m);
  assert.match(bank, /^## profile\.md の保存形式$/m);
});

test("every pattern reference has the four sections", () => {
  const patterns = readdirSync(refDir)
    .filter((f) => /^pattern-[1-5]-[a-z-]+\.md$/.test(f))
    .sort();
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
    assert.match(body, /```bash/, `${file} に実測コマンドの例が無い`);
    assert.match(
      body,
      /--exclude-dir=\{node_modules,vendor,dist,build,\.git,coverage,\.next,\.astro\}/,
      `${file} の grep に共通の除外指定（brace 展開形式）が無い`
    );
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

  for (const stage of [
    "## 段 0: 下読み",
    "## 段 1: 問診",
    "## 段 1.5: 確認",
    "## 段 2: 実測",
    "## 段 3: 所見",
  ]) {
    assert.match(skill, new RegExp(`^${stage}$`, "m"), `${stage} が無い`);
  }
  for (const word of ["ビルド", "テスト実行", "外部送信", "git"]) {
    assert.match(skill, new RegExp(word), `read-only 規定に「${word}」が無い`);
  }
  assert.match(skill, /node_modules/, "除外ディレクトリの記載が無い");
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
  assert.match(skill, /この検査で見つからないもの/, "固定節への言及が無い");
});
