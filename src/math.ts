import { createRequire } from "node:module";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { getCellDimensions, getImageDimensions, Image, type Component, type ImageDimensions } from "@earendil-works/pi-tui";
import MathJax from "mathjax";
import sharp from "sharp";
import { imageTheme } from "./theme.js";
import { naturalImageLimits } from "./image-sizing.js";

const require = createRequire(import.meta.url);
const mathJaxFontRoot = dirname(require.resolve("@mathjax/mathjax-newcm-font/svg.js"));
const BLACKER = 18;

type MathJaxInstance = {
  tex2svg: (source: string, options: Record<string, unknown>) => unknown;
  svgStylesheet: () => unknown;
  startup: {
    adaptor: {
      innerHTML: (node: unknown) => string;
      outerHTML: (node: unknown) => string;
    };
  };
};

function loadMathJaxModule(file: string): Promise<unknown> {
  return import(file.startsWith("file:") ? file : pathToFileURL(file).href);
}

const mathJaxReady: Promise<MathJaxInstance> = MathJax.init({
  loader: {
    load: ["input/tex", "output/svg"],
    paths: { "mathjax-newcm": mathJaxFontRoot },
    require: loadMathJaxModule,
  },
  tex: {
    packages: { "[+]": ["ams", "autoload"] },
  },
  svg: {
    fontCache: "none",
    blacker: BLACKER,
  },
}).then((instance: unknown) => instance as MathJaxInstance);

const DEFAULT_MAX_WIDTH_CELLS = 100;
const REFERENCE_CELL_HEIGHT_PX = 18;
const REFERENCE_DENSITY = 135;

function rasterDensity(cellHeightPx: number): number {
  return Math.max(1, REFERENCE_DENSITY * cellHeightPx / REFERENCE_CELL_HEIGHT_PX);
}

function embedBlackerStyles(svgSource: string, stylesheet: string): string {
  const rule = stylesheet.match(
    /mjx-container\[jax="SVG"\] path\[data-c\], mjx-container\[jax="SVG"\] use\[data-c\] \{[\s\S]*?\}/,
  )?.[0];
  if (!rule) {
    return svgSource;
  }

  const standaloneRule = rule.replaceAll('mjx-container[jax="SVG"] ', "");
  return svgSource.replace("</svg>", `<style>${standaloneRule}</style></svg>`);
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
  const mathJax = await mathJaxReady;
  const node = mathJax.tex2svg(source, {
    display: true,
    em: cell.heightPx,
    ex: cell.heightPx / 2,
    containerWidth: maxWidthPx,
  });
  const adaptor = mathJax.startup.adaptor;
  const svgSource = embedBlackerStyles(
    adaptor.innerHTML(node).replaceAll("currentColor", "#e6edf3"),
    adaptor.outerHTML(mathJax.svgStylesheet()),
  );
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
