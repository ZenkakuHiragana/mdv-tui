import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createDocumentComponents } from "../src/document.js";

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
