import assert from "node:assert/strict";
import test from "node:test";
import { highlightCode } from "../src/theme.js";

test("コードフェンスの言語指定を端末色へ変換できる", () => {
  const highlighted = highlightCode("const answer = 42;", "javascript").join("\n");

  assert.match(highlighted, /\u001b\[/);
  assert.match(highlighted, /const/);
  assert.match(highlighted, /42/);
});
