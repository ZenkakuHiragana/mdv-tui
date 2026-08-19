import assert from "node:assert/strict";
import test from "node:test";
import type { Terminal } from "@earendil-works/pi-tui";
import {
  createPanTerminal,
  parseHorizontalWheelDirection,
  parseMiddleMove,
  parseMiddlePress,
  parseMiddleRelease,
} from "../src/mouse-input.js";

function x10(button: number): string {
  // X10 マウス列: ESC [ M ボタン+32 x+33 y+33
  return "\x1b[M" + String.fromCharCode(button + 32) + String.fromCharCode(33 + 3) + String.fromCharCode(33 + 4);
}

test("ネイティブ横ホイールの方向を解釈する", () => {
  assert.equal(parseHorizontalWheelDirection("\x1b[<66;10;20M"), -1); // 左
  assert.equal(parseHorizontalWheelDirection("\x1b[<67;10;20M"), 1); // 右
  assert.equal(parseHorizontalWheelDirection(x10(66)), -1);
  assert.equal(parseHorizontalWheelDirection(x10(67)), 1);
});

test("垂直ホイール・Shift+ホイール・非ホイールは null", () => {
  assert.equal(parseHorizontalWheelDirection("\x1b[<64;10;20M"), null); // 垂直上
  assert.equal(parseHorizontalWheelDirection("\x1b[<65;10;20M"), null); // 垂直下
  assert.equal(parseHorizontalWheelDirection("\x1b[<68;10;20M"), null); // Shift+ホイール上(撤去)
  assert.equal(parseHorizontalWheelDirection("\x1b[<69;10;20M"), null); // Shift+ホイール下(撤去)
  assert.equal(parseHorizontalWheelDirection("abc"), null);
});

test("ミドルボタンの押下・移動・解放を解釈する", () => {
  assert.deepEqual(parseMiddlePress("\x1b[<1;11;21M"), { x: 10, y: 20 });
  assert.equal(parseMiddlePress("\x1b[<0;11;21M"), null); // 左ボタン
  assert.equal(parseMiddlePress("\x1b[<5;11;21M"), null); // Shift+ミドル
  assert.equal(parseMiddlePress("\x1b[<1;11;21m"), null); // 押下は大文字 M のみ

  assert.deepEqual(parseMiddleMove("\x1b[<33;12;22M"), { x: 11, y: 21 });
  assert.equal(parseMiddleMove("\x1b[<32;12;22M"), null); // 左ボタンの移動
  assert.equal(parseMiddleMove("\x1b[<34;12;22M"), null); // 右ボタンの移動

  assert.equal(parseMiddleRelease("\x1b[<3;12;22m"), true);
  assert.equal(parseMiddleRelease("\x1b[<3;12;22M"), false);
});

function makeWrapped(hitTest: (x: number, y: number) => boolean) {
  const forwarded: string[] = [];
  const wheels: number[] = [];
  const drags: number[] = [];
  let handler: ((data: string) => void) | undefined;
  const fake = {
    start(onInput: (data: string) => void) {
      handler = onInput;
    },
  } as unknown as Terminal;
  const wrapped = createPanTerminal(
    fake,
    { onWheel: (d) => wheels.push(d), onDragBy: (d) => drags.push(d) },
    hitTest,
  );
  wrapped.start((data) => forwarded.push(data), () => undefined);
  return { handler: handler!, forwarded, wheels, drags };
}

test("横ホイールだけを横取りし、垂直ホイールは素通しする", () => {
  const { handler, forwarded, wheels } = makeWrapped(() => false);
  handler("\x1b[<66;10;20M");
  handler("\x1b[<67;10;20M");
  handler("\x1b[<64;10;20M");
  assert.deepEqual(wheels, [-1, 1]);
  assert.deepEqual(forwarded, ["\x1b[<64;10;20M"]);
});

test("クリップ中の図の上でのミドルドラッグだけを横取りする", () => {
  const { handler, forwarded, drags } = makeWrapped((x) => x < 5); // 左 5 列だけ開始領域

  // 開始領域外の押下は素通し
  handler("\x1b[<1;10;10M");
  assert.deepEqual(forwarded, ["\x1b[<1;10;10M"]);

  // 開始領域内の押下でドラッグ開始: 右へ 3 列移動 => delta = 押下x - 移動x = -3
  handler("\x1b[<1;2;2M");
  handler("\x1b[<33;5;2M");
  assert.deepEqual(drags, [-3]);
  assert.deepEqual(forwarded, ["\x1b[<1;10;10M"]);

  // 解放でドラッグ終了。以後、開始領域内の移動は新しいドラッグの開始になる(押下欠落対応)
  handler("\x1b[<3;5;2m");
  handler("\x1b[<33;4;2M"); // 開始領域内(x=3)で新しいドラッグ開始
  handler("\x1b[<33;1;2M"); // lastX=3 → x=0 => delta = 3
  assert.deepEqual(drags, [-3, 3]);
  assert.deepEqual(forwarded, ["\x1b[<1;10;10M"]);
});

test("押下が欠落する環境でも、最初のミドル移動でドラッグを開始する", () => {
  const { handler, forwarded, drags } = makeWrapped((x) => x < 5);
  // 押下(1;M)なしで移動(33)だけが届く herdr 的な挙動
  handler("\x1b[<33;2;2M"); // 開始領域内 -> ドラッグ開始
  handler("\x1b[<33;6;2M"); // lastX=1 から x=5 へ => delta = -4
  handler("\x1b[<3;6;2m"); // 解放
  assert.deepEqual(drags, [-4]);
  assert.deepEqual(forwarded, []);

  // 開始領域外の移動は素通し
  handler("\x1b[<33;20;2M");
  assert.deepEqual(forwarded, ["\x1b[<33;20;2M"]);
});

test("ドラッグ中に他ボタンの押下が来たらドラッグを終え素通しする", () => {
  const { handler, forwarded, drags } = makeWrapped(() => true);
  handler("\x1b[<1;2;2M");
  handler("\x1b[<0;6;2M"); // ドラッグ中の左ボタン押下
  assert.deepEqual(drags, []);
  assert.deepEqual(forwarded, ["\x1b[<0;6;2M"]);
});