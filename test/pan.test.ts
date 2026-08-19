import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { DocumentView } from "../src/document.js";
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

const SMALL = `graph TD
  A[開始] --> B{判定}
  B -->|はい| C[終了]
  B -->|いいえ| A
`;

function joinLines(lines: string[]): string {
  return lines.join("\n");
}

test("パン操作は負方向と過大方向で端にクランプされる", () => {
  const view = new DocumentView();
  view.setDocument([new MermaidDiagram(WIDE)], undefined, undefined);
  const atZero = view.render(40);

  view.panBy(-20);
  assert.deepEqual(view.render(40), atZero);

  view.panBy(1_000_000);
  const atRight = joinLines(view.render(40));
  assert.match(atRight, /Release/);
  assert.doesNotMatch(atRight, /Start/);
});

test("再読込(再 setDocument)で横オフセットが維持される", () => {
  const view = new DocumentView();
  view.setDocument([new MermaidDiagram(WIDE)], undefined, undefined);
  view.panBy(60);
  const before = view.render(40);

  view.setDocument([new MermaidDiagram(WIDE)], undefined, undefined);
  assert.deepEqual(view.render(40), before);
});

test("内容が狭くなった場合は端に丸められる", () => {
  const view = new DocumentView();
  view.setDocument([new MermaidDiagram(WIDE)], undefined, undefined);
  view.panBy(1_000_000);

  view.setDocument([new MermaidDiagram(SMALL)], undefined, undefined);
  const lines = view.render(40);
  for (const line of lines) {
    assert.ok(visibleWidth(line) <= 40);
  }
  assert.match(joinLines(lines), /開始/);
});

test("右端で → を押し続けても内部オフセットが増加しない", () => {
  const view = new DocumentView();
  view.setDocument([new MermaidDiagram(WIDE)], undefined, undefined);
  for (let i = 0; i < 100; i++) {
    view.panBy(4);
    void view.render(40); // 表示時に実効値へ正規化される
  }
  const atRight = view.render(40);
  // 端に達した後の → は表示を変えない
  view.panBy(4);
  void view.render(40);
  assert.deepEqual(view.render(40), atRight);
  // ← 1 回で即座に移動する
  view.panBy(-4);
  assert.notDeepEqual(view.render(40), atRight);
});

test("クリップ領域判定は図の行範囲とクリップ状態で変わる", () => {
  const view = new DocumentView();
  view.setDocument([new MermaidDiagram(SMALL)], undefined, undefined);
  // 幅 40 では SMALL(17 列)はクリップされない
  assert.equal(view.isClippedDiagramAt(0, 40), false);

  view.setDocument([new MermaidDiagram(WIDE)], undefined, undefined);
  const lineCount = view.render(40).length;
  for (let row = 0; row < lineCount; row++) {
    assert.equal(view.isClippedDiagramAt(row, 40), true);
  }
  assert.equal(view.isClippedDiagramAt(lineCount, 40), false);
  assert.equal(view.isClippedDiagramAt(-1, 40), false);
});