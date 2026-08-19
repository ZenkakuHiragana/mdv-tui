import assert from "node:assert/strict";
import test from "node:test";
import { naturalImageLimits } from "../src/image-sizing.js";

test("画像を自然な端末セルサイズへ制限できる", () => {
  assert.deepEqual(naturalImageLimits({ widthPx: 72, heightPx: 30 }), {
    maxWidthCells: 8,
    maxHeightCells: 2,
  });
  assert.deepEqual(naturalImageLimits({ widthPx: 1, heightPx: 1 }), {
    maxWidthCells: 1,
    maxHeightCells: 1,
  });
});
