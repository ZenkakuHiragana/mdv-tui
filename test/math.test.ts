import assert from "node:assert/strict";
import sharp from "sharp";
import { getCellDimensions, getImageDimensions, setCellDimensions } from "@earendil-works/pi-tui";
import test from "node:test";
import { renderDisplayMath } from "../src/math.js";

type ImageComponentData = {
  base64Data: string;
  options: {
    maxWidthCells?: number;
    maxHeightCells?: number;
  };
};

async function renderPng(source: string, maxWidthCells: number) {
  const component = await renderDisplayMath(source, maxWidthCells);
  const { base64Data, options } = component as unknown as ImageComponentData;
  const dimensions = getImageDimensions(base64Data, "image/png");
  assert.ok(dimensions);
  return {
    buffer: Buffer.from(base64Data, "base64"),
    dimensions,
    options,
  };
}

async function visibleBounds(png: Buffer): Promise<{ width: number; height: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] > 0) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return {
    width: right >= left ? right - left + 1 : 0,
    height: bottom >= top ? bottom - top + 1 : 0,
  };
}

test("display math follows terminal cell height in visible glyph size", async () => {
  const original = getCellDimensions();
  try {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const normal = await renderPng(String.raw`x^2 + y^2 = z^2`, 100);
    setCellDimensions({ widthPx: 9, heightPx: 36 });
    const large = await renderPng(String.raw`x^2 + y^2 = z^2`, 100);

    const normalBounds = await visibleBounds(normal.buffer);
    const largeBounds = await visibleBounds(large.buffer);
    assert.ok(largeBounds.height > normalBounds.height);
    assert.ok(largeBounds.height / normalBounds.height > 1.5);
  } finally {
    setCellDimensions(original);
  }
});

test("display math fits the terminal width without changing its aspect ratio", async () => {
  const original = getCellDimensions();
  try {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const source = String.raw`\\frac{a+b+c+d+e+f+g+h+i+j+k+l}{x+y+z} + \\sum_{i=1}^{n} i`;
    const natural = await renderPng(source, 1000);
    const fitted = await renderPng(source, 10);

    assert.ok(natural.dimensions.widthPx > 90);
    assert.ok(fitted.dimensions.widthPx <= 90);
    assert.equal(natural.dimensions.widthPx % 9, 0);
    assert.equal(natural.dimensions.heightPx % 18, 0);
    assert.equal(fitted.dimensions.widthPx % 9, 0);
    assert.equal(fitted.dimensions.heightPx % 18, 0);
    assert.equal(fitted.options.maxWidthCells, fitted.dimensions.widthPx / 9);
    assert.equal(fitted.options.maxHeightCells, fitted.dimensions.heightPx / 18);
    const { data: fittedPixels } = await sharp(fitted.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(fittedPixels[fittedPixels.length - 1], 0);
    const naturalBounds = await visibleBounds(natural.buffer);
    const fittedBounds = await visibleBounds(fitted.buffer);
    const naturalRatio = naturalBounds.width / naturalBounds.height;
    const fittedRatio = fittedBounds.width / fittedBounds.height;
    assert.ok(Math.abs(fittedRatio / naturalRatio - 1) < 0.05);
  } finally {
    setCellDimensions(original);
  }
});
