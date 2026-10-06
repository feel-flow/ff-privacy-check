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
