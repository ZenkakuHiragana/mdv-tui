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
  let png = await sharp(Buffer.from(svgSource), { density }).png().toBuffer();
  const initialDimensions = getImageDimensions(png.toString("base64"), "image/png");
  if (initialDimensions && initialDimensions.widthPx > maxWidthPx) {
    png = await sharp(png)
      .resize({ width: maxWidthPx, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  }
  return png;
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
  const png = await rasterizeMath(svgSource, maxWidthPx, rasterDensity(cell.heightPx));
  const base64 = png.toString("base64");
  const dimensions: ImageDimensions | null = getImageDimensions(base64, "image/png");
  const imageLimits = dimensions ? naturalImageLimits(dimensions) : {
    maxWidthCells: boundedWidthCells,
    maxHeightCells: 18,
  };

  return new Image(base64, "image/png", imageTheme, {
    ...imageLimits,
    filename: "formula.png",
  }, dimensions ?? undefined);
}
