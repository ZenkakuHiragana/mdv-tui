import { Image, getImageDimensions, type Component } from "@earendil-works/pi-tui";
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

export async function renderDisplayMath(source: string): Promise<Component> {
  const node = mathDocument.convert(source, { display: true });
  const svgSource = adaptor.innerHTML(node).replaceAll("currentColor", "#e6edf3");
  const png = await sharp(Buffer.from(svgSource)).png().toBuffer();
  const base64 = png.toString("base64");
  const dimensions = getImageDimensions(base64, "image/png");
  const imageLimits = dimensions ? naturalImageLimits(dimensions) : { maxWidthCells: 100, maxHeightCells: 18 };

  return new Image(base64, "image/png", imageTheme, {
    ...imageLimits,
    filename: "formula.png",
  }, dimensions ?? undefined);
}
