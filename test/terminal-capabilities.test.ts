import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseCellSize,
  deriveCellSize,
  hasDeviceAttributesResponse,
  hasKittyGraphicsResponse,
  isPlausibleCellSize,
  parseCellSizeOverride,
  parseCellSizeResponse,
  parseImageProtocolOverride,
  parseWindowSizeResponse,
} from "../src/terminal-capabilities.js";

test("Kitty graphics の応答を検出する", () => {
  assert.equal(hasKittyGraphicsResponse("\u001b_Gi=4242;OK\u001b\\"), true);
  assert.equal(hasKittyGraphicsResponse("\u001b_Gi=4242;EBADF:bad\u001b\\"), true);
  assert.equal(hasKittyGraphicsResponse("\u001b[?62;1;6c"), false);
  assert.equal(hasKittyGraphicsResponse("\u001b_Gi=4242;OK"), false);
});

test("番兵の DA1 応答を検出する", () => {
  assert.equal(hasDeviceAttributesResponse("\u001b[?62;1;6c"), true);
  assert.equal(hasDeviceAttributesResponse("\u001b[6;34;15t"), false);
});

test("セル寸法の応答を幅と高さへ分解する", () => {
  assert.deepEqual(parseCellSizeResponse("\u001b[6;34;15t\u001b[?62c"), { widthPx: 15, heightPx: 34 });
  assert.equal(parseCellSizeResponse("\u001b[6;0;0t"), undefined);
  assert.equal(parseCellSizeResponse("\u001b[?62c"), undefined);
});

test("窓の画素サイズの応答を分解する", () => {
  assert.deepEqual(parseWindowSizeResponse("\u001b[4;1045;927t"), { widthPx: 927, heightPx: 1045 });
  assert.equal(parseWindowSizeResponse("\u001b[6;34;15t"), undefined);
});

test("セル寸法としてあり得ない値を拒否する", () => {
  assert.equal(isPlausibleCellSize({ widthPx: 9, heightPx: 19 }), true);
  assert.equal(isPlausibleCellSize({ widthPx: 2, heightPx: 8 }), false); // 実測された誤報告
  assert.equal(isPlausibleCellSize({ widthPx: 9, heightPx: 9 }), false); // 縦横比が小さすぎる
  assert.equal(isPlausibleCellSize({ widthPx: 100, heightPx: 200 }), false);
  assert.equal(isPlausibleCellSize(undefined), false);
});

test("窓の画素サイズとセル数からセル寸法を逆算する", () => {
  assert.deepEqual(deriveCellSize({ widthPx: 927, heightPx: 1045 }, 103, 55), { widthPx: 9, heightPx: 19 });
  assert.equal(deriveCellSize({ widthPx: 206, heightPx: 440 }, 103, 55), undefined); // 逆算値も不当
  assert.equal(deriveCellSize(undefined, 103, 55), undefined);
  assert.equal(deriveCellSize({ widthPx: 927, heightPx: 1045 }, undefined, 55), undefined);
});

test("誤報告されたセル寸法より逆算値を優先する", () => {
  const fallback = { widthPx: 9, heightPx: 18 };
  assert.deepEqual(
    chooseCellSize({ reported: { widthPx: 2, heightPx: 8 }, windowPx: { widthPx: 927, heightPx: 1045 }, columns: 103, rows: 55, fallback }),
    { cell: { widthPx: 9, heightPx: 19 }, source: "derived" },
  );
  assert.deepEqual(
    chooseCellSize({ reported: { widthPx: 8, heightPx: 17 }, windowPx: { widthPx: 927, heightPx: 1045 }, columns: 103, rows: 55, fallback }),
    { cell: { widthPx: 8, heightPx: 17 }, source: "reported" },
  );
  assert.deepEqual(
    chooseCellSize({ override: { widthPx: 7, heightPx: 15 }, reported: { widthPx: 8, heightPx: 17 }, fallback }),
    { cell: { widthPx: 7, heightPx: 15 }, source: "override" },
  );
  assert.deepEqual(
    chooseCellSize({ reported: { widthPx: 2, heightPx: 8 }, fallback }),
    { cell: fallback, source: "default" },
  );
});

test("環境変数による画像プロトコルの明示指定を解釈する", () => {
  assert.equal(parseImageProtocolOverride("kitty"), "kitty");
  assert.equal(parseImageProtocolOverride(" ITERM2 "), "iterm2");
  assert.equal(parseImageProtocolOverride("none"), null);
  assert.equal(parseImageProtocolOverride("off"), null);
  assert.equal(parseImageProtocolOverride(undefined), undefined);
  assert.equal(parseImageProtocolOverride("yes"), undefined);
});

test("環境変数によるセル寸法の明示指定を解釈する", () => {
  assert.deepEqual(parseCellSizeOverride("8x17"), { widthPx: 8, heightPx: 17 });
  assert.deepEqual(parseCellSizeOverride(" 10 X 22 "), { widthPx: 10, heightPx: 22 });
  assert.equal(parseCellSizeOverride("0x17"), undefined);
  assert.equal(parseCellSizeOverride("8"), undefined);
  assert.equal(parseCellSizeOverride(undefined), undefined);
});

test("端末が応答すれば Kitty 対応とセル寸法を実測する", async () => {
  const { EventEmitter } = await import("node:events");
  const stdin = new EventEmitter() as unknown as NodeJS.ReadStream & { isTTY: boolean };
  Object.assign(stdin, {
    isTTY: true,
    isRaw: false,
    setRawMode: () => stdin,
    isPaused: () => false,
    resume: () => stdin,
    pause: () => stdin,
  });
  const written: string[] = [];
  const stdout = {
    isTTY: true,
    write: (data: string) => {
      written.push(data);
      setImmediate(() => stdin.emit("data", Buffer.from("\u001b_Gi=4242;OK\u001b\\\u001b[4;1045;927t\u001b[6;34;15t\u001b[?62;c")));
      return true;
    },
  } as unknown as NodeJS.WriteStream;

  const originalStdin = Object.getOwnPropertyDescriptor(process, "stdin");
  const originalStdout = Object.getOwnPropertyDescriptor(process, "stdout");
  Object.defineProperty(process, "stdin", { value: stdin, configurable: true });
  Object.defineProperty(process, "stdout", { value: stdout, configurable: true });
  try {
    const { probeTerminal } = await import("../src/terminal-capabilities.js");
    const result = await probeTerminal();
    assert.equal(result.images, "kitty");
    assert.deepEqual(result.reportedCell, { widthPx: 15, heightPx: 34 });
    assert.deepEqual(result.windowPx, { widthPx: 927, heightPx: 1045 });
    assert.match(written.join(""), /\u001b_Gi=4242,.*a=q.*\u001b\[14t\u001b\[16t\u001b\[c$/);
  } finally {
    if (originalStdin) Object.defineProperty(process, "stdin", originalStdin);
    if (originalStdout) Object.defineProperty(process, "stdout", originalStdout);
  }
});
