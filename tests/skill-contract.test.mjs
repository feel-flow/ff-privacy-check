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
