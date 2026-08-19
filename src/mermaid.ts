import { Text, sliceByColumn, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { render } from "grok-mermaid";

const PADDING = 1;

/**
 * Mermaid 図を折り返さず表示するコンポーネント。
 * 図の自然幅(`art.width`)を所有し、表示幅より広いときは横オフセットで
 * 切り出して表示する。図 1 行 = 表示 1 行を保つため、幅超過行を出さない。
 */
export class MermaidDiagram implements Component {
  /** 図の自然幅(列)。表示幅との比較に使う。 */
  readonly naturalWidth: number;

  private readonly fallback: Text;
  private readonly lines: string[];
  private offset = 0;
  private cachedLines?: string[];
  private cachedWidth?: number;

  constructor(source: string) {
    this.fallback = new Text(source, PADDING, 0);
    let art: ReturnType<typeof render> = null;
    try {
      art = render(source);
    } catch {
      art = null;
    }
    if (art) {
      this.lines = art.plain;
      this.naturalWidth = art.width;
    } else {
      this.lines = [];
      this.naturalWidth = 0;
    }
  }

  setHorizontalOffset(offset: number): void {
    const next = Math.max(0, Math.floor(offset));
    if (next === this.offset) {
      return;
    }
    this.offset = next;
    this.invalidate();
  }

  invalidate(): void {
    this.cachedLines = undefined;
    this.cachedWidth = undefined;
    this.fallback.invalidate();
  }

  render(width: number): string[] {
    if (this.lines.length === 0) {
      return this.fallback.render(width);
    }
    if (this.cachedWidth === width && this.cachedLines) {
      return this.cachedLines;
    }
    const contentWidth = Math.max(1, Math.floor(width) - PADDING * 2);
    const maxOffset = this.maxOffsetForWidth(width);
    const offset = Math.min(this.offset, maxOffset);
    const lines = this.lines.map((line) => this.renderLine(line, offset, contentWidth));
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  /** この図が表示幅で示せる横オフセットの最大値(0以上)。表示時に実効値へ正規化するために使う。 */
  maxOffsetForWidth(width: number): number {
    if (this.lines.length === 0) {
      return 0;
    }
    const contentWidth = Math.max(1, Math.floor(width) - PADDING * 2);
    return Math.max(0, this.naturalWidth - contentWidth);
  }

  private renderLine(line: string, offset: number, contentWidth: number): string {
    const slice = sliceByColumn(line, offset, contentWidth, true);
    const pad = Math.max(0, contentWidth - visibleWidth(slice));
    return " ".repeat(PADDING) + slice + " ".repeat(pad) + " ".repeat(PADDING);
  }
}