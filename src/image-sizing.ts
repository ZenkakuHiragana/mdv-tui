import { getCellDimensions, type ImageDimensions } from "@earendil-works/pi-tui";

export function naturalImageLimits(dimensions: ImageDimensions, cell = getCellDimensions()): {
  maxWidthCells: number;
  maxHeightCells: number;
} {
  return {
    maxWidthCells: Math.max(1, Math.ceil(dimensions.widthPx / cell.widthPx)),
    maxHeightCells: Math.max(1, Math.ceil(dimensions.heightPx / cell.heightPx)),
  };
}
