import { getCellDimensions, getImageDimensions, Image, type Component, type ImageDimensions } from "@earendil-works/pi-tui";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import sharp from "sharp";
import { imageTheme } from "./theme.js";
import { naturalImageLimits } from "./image-sizing.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const tex = new TeX({ packages: AllPackages });
const svg = new SVG({ fontCache: "none" });
const mathDocument = mathjax.document("", { InputJax: tex, OutputJax: svg });

const DEFAULT_MAX_WIDTH_CELLS = 100;
const REFERENCE_CELL_HEIGHT_PX = 18;
const REFERENCE_DENSITY = 108;

function rasterDensity(cellHeightPx: number): number {
  return Math.max(1, REFERENCE_DENSITY * cellHeightPx / REFERENCE_CELL_HEIGHT_PX);
}

async function rasterizeMath(svgSource: string, maxWidthPx: number, density: number): Promise<Buffer> {
  const png = await sharp(Buffer.from(svgSource), { density }).png().toBuffer();
  const dimensions = getImageDimensions(png.toString("base64"), "image/png");
  if (!dimensions || dimensions.widthPx <= maxWidthPx) {
    return png;
  }

  return sharp(png)
    .png()
    .toBuffer();
}

async function alignToCellCanvas(png: Buffer, cell: { widthPx: number; heightPx: number }): Promise<Buffer> {
  const dimensions = getImageDimensions(png.toString("base64"), "image/png");
  if (!dimensions) {
    return png;
  }

  const columns = Math.max(1, Math.ceil(dimensions.widthPx / cell.widthPx));
  const rows = Math.max(1, Math.ceil(dimensions.heightPx / cell.heightPx));
  const targetWidthPx = columns * cell.widthPx;
  const targetHeightPx = rows * cell.heightPx;
  const right = targetWidthPx - dimensions.widthPx;
  const bottom = targetHeightPx - dimensions.heightPx;
  if (right === 0 && bottom === 0) {
    return png;
  }

  return sharp(png)
    .extend({
      top: 0,
      bottom,
      left: 0,
      right,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

export async function renderDisplayMath(
  source: string,
  maxWidthCells = DEFAULT_MAX_WIDTH_CELLS,
): Promise<Component> {
  const cell = getCellDimensions();
  const boundedWidthCells = Math.max(1, Math.floor(maxWidthCells));
  const maxWidthPx = Math.max(1, Math.floor(boundedWidthCells * cell.widthPx));
  const node = mathDocument.convert(source, {
    display: true,
    em: cell.heightPx,
    ex: cell.heightPx / 2,
    containerWidth: maxWidthPx,
  });
  const svgSource = adaptor.innerHTML(node).replaceAll("currentColor", "#e6edf3");
  const rasterized = await rasterizeMath(svgSource, maxWidthPx, rasterDensity(cell.heightPx));
  const png = await alignToCellCanvas(rasterized, cell);
  const base64 = png.toString("base64");
  const dimensions: ImageDimensions | null = getImageDimensions(base64, "image/png");
  const imageLimits = dimensions ? naturalImageLimits(dimensions, cell) : {
    maxWidthCells: boundedWidthCells,
    maxHeightCells: 18,
  };

  return new Image(base64, "image/png", imageTheme, {
    ...imageLimits,
    filename: "formula.png",
  }, dimensions ?? undefined);
}
