import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { MermaidDiagram } from "../src/mermaid.js";

const WIDE = `flowchart LR
  A[Start] --> B[Initialize] --> C[Download package]
  C --> D{Size OK?}
  D -- yes --> E[Install]
  D -- no  --> F[Warn user] --> G[Abort]
  E --> H2[Update lockfile] --> I[Run tests]
  I --> J{Done?}
  J -- yes --> K[Release]
  J -- no --> H3[Fix] --> I
`;

function joined(component: MermaidDiagram, width: number): string {
  return component.render(width).join("\n");
}

test("幅超過の図をスライスし、折り返し破損しない", () => {
  const diagram = new MermaidDiagram(WIDE);
  assert.ok(diagram.naturalWidth > 100);
  const lines = diagram.render(40);
  assert.ok(lines.length >= 3);
  for (const line of lines) {
    assert.ok(visibleWidth(line) <= 40, `line too wide: ${visibleWidth(line)}`);
  }
  // 左端では開始ノードが見え、右端の Release は見えない
  assert.match(joined(diagram, 40), /Start/);
  assert.doesNotMatch(joined(diagram, 40), /Release/);
});

test("横オフセットで切り出し位置が変わり、左右端で止まる", () => {
  const diagram = new MermaidDiagram(WIDE);
  const atZero = diagram.render(40);

  diagram.setHorizontalOffset(-10); // 負値は左端へクランプ
  assert.deepEqual(diagram.render(40), atZero);

  diagram.setHorizontalOffset(40);
  assert.notDeepEqual(diagram.render(40), atZero);

  // 過大オフセットは最大値(naturalWidth - contentWidth)へクランプされる
  const maxOffset = diagram.naturalWidth - 38; // contentWidth = 40 - 2
  diagram.setHorizontalOffset(maxOffset);
  const atMax = diagram.render(40);
  diagram.setHorizontalOffset(1_000_000);
  assert.deepEqual(diagram.render(40), atMax);

  const atRight = joined(diagram, 40);
  assert.match(atRight, /Release/);
  assert.doesNotMatch(atRight, /Start/);
});

test("幅が足りる図は現状どおり全体を表示する", () => {
  const diagram = new MermaidDiagram(WIDE);
  const lines = diagram.render(200);
  const text = joined(diagram, 200);
  assert.match(text, /Start/);
  assert.match(text, /Release/);
  for (const line of lines) {
    assert.ok(visibleWidth(line) <= 200);
  }
});

test("描画できないソースは折り返して表示する", () => {
  const diagram = new MermaidDiagram("これは図ではないテキスト");
  assert.equal(diagram.naturalWidth, 0);
  const lines = diagram.render(20);
  for (const line of lines) {
    assert.ok(visibleWidth(line) <= 20);
  }
  assert.match(lines.join("").replace(/\s/g, ""), /これは図ではないテキスト/);
});