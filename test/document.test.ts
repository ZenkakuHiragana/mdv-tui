import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { createDocumentAnchors, createDocumentComponents, DocumentView } from "../src/document.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "../fixtures/sample.md");

test("fixture の主要な文書部品を構築できる", async () => {
  const source = await readFile(fixturePath, "utf8");
  const components = await createDocumentComponents(source, fixturePath);
  const rendered = components.flatMap((component) => component.render(100)).join("\n");

  assert.match(rendered, /日本語/);
  assert.match(rendered, /太字/);
  assert.match(rendered, /x²/);
  assert.match(rendered, /┌──────┐/);
  assert.doesNotMatch(rendered, /```mermaid/);
  assert.ok(components.filter((component) => component.constructor.name === "Image").length >= 3);
});

test("GitHub互換の見出しアンカーを表示位置へ解決できる", async () => {
  const source = [
    "# 目次",
    "",
    "## RT0 : Unified Ink Map",
    "",
    "本文",
    "",
    "## レジスタ割り当て",
    "",
    "## レジスタ割り当て",
  ].join("\n");
  const anchors = createDocumentAnchors(source);
  assert.deepEqual(anchors.map((anchor) => anchor.id), [
    "目次",
    "rt0--unified-ink-map",
    "レジスタ割り当て",
    "レジスタ割り当て-1",
  ]);
  assert.deepEqual(createDocumentAnchors("$$\n# TeXの行\n$$\n\n# 実際の見出し").map((anchor) => anchor.id), ["実際の見出し"]);

  const components = await createDocumentComponents(source, "navigation-test.md");
  const documentView = new DocumentView();
  documentView.setDocument(components, undefined, anchors);
  const lines = documentView.render(80);
  const firstHeadingRow = lines.findIndex((line) => stripTerminalSequences(line).trim() === "RT0 : Unified Ink Map");
  const firstDuplicateRow = lines.findIndex((line) => stripTerminalSequences(line).trim() === "レジスタ割り当て");
  const secondDuplicateRow = lines.findIndex((line, index) => index > firstDuplicateRow && stripTerminalSequences(line).trim() === "レジスタ割り当て");

  assert.notEqual(firstHeadingRow, -1);
  assert.equal(documentView.getAnchorOffset("rt0--unified-ink-map", 80), firstHeadingRow);
  assert.equal(documentView.getAnchorOffset("レジスタ割り当て", 80), firstDuplicateRow);
  assert.equal(documentView.getAnchorOffset("レジスタ割り当て-1", 80), secondDuplicateRow);
});

test("深い見出しをPi TUIの表示形式から解決できる", async () => {
  const source = "### 雪\n\n### スライム、ゲル質\n";
  const anchors = createDocumentAnchors(source);
  const components = await createDocumentComponents(source, "subsection-navigation-test.md");
  const documentView = new DocumentView();
  documentView.setDocument(components, undefined, anchors);
  const lines = documentView.render(80);
  const snowRow = lines.findIndex((line) => stripTerminalSequences(line).trim() === "### 雪");
  const slimeRow = lines.findIndex((line) => stripTerminalSequences(line).trim() === "### スライム、ゲル質");

  assert.equal(documentView.getAnchorOffset("雪", 80), snowRow);
  assert.equal(documentView.getAnchorOffset("スライムゲル質", 80), slimeRow);
});
