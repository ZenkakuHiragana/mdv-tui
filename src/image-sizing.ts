import { getCellDimensions, type ImageDimensions } from "@earendil-works/pi-tui";

export function naturalImageLimits(dimensions: ImageDimensions): {
  maxWidthCells: number;
  maxHeightCells: number;
} {
  const cell = getCellDimensions();
  return {
    maxWidthCells: Math.max(1, Math.ceil(dimensions.widthPx / cell.widthPx)),
    maxHeightCells: Math.max(1, Math.ceil(dimensions.heightPx / cell.heightPx)),
  };
}
