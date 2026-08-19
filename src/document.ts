import GithubSlugger from "github-slugger";
import { Marked, Markdown, Text, VStack, stripTerminalSequences, type Component, type Token, type Tokens } from "@earendil-works/pi-tui";
import { createImageComponent } from "./images.js";
import { renderDisplayMath } from "./math.js";
import { createMermaidComponent } from "./mermaid.js";
import { createMarkdownTheme } from "./theme.js";

const markdownParser = new Marked();
const markdownTheme = createMarkdownTheme();

export interface DocumentAnchor {
  readonly id: string;
  readonly text: string;
  readonly depth: number;
}

function getInlineText(token: Token): string {
  if ("tokens" in token && Array.isArray(token.tokens)) {
    return token.tokens.map(getInlineText).join("");
  }
  if ("text" in token && typeof token.text === "string") {
    return token.text;
  }
  return "";
}

export function createDocumentAnchors(source: string): DocumentAnchor[] {
  const slugger = new GithubSlugger();
  const anchors: DocumentAnchor[] = [];

  for (const part of splitDisplayMath(source)) {
    if (part.kind !== "markdown") {
      continue;
    }
    for (const token of markdownParser.lexer(part.source)) {
      if (token.type !== "heading") {
        continue;
      }
      const heading = token as Tokens.Heading;
      const text = (heading.tokens ?? []).map(getInlineText).join("");
      anchors.push({ id: slugger.slug(text), text, depth: heading.depth });
    }
  }

  return anchors;
}

type DocumentPart =
  | { kind: "markdown"; source: string }
  | { kind: "math"; source: string };

function isFence(line: string): boolean {
  return /^\s*(`{3,}|~{3,})/.test(line);
}

function splitDisplayMath(source: string): DocumentPart[] {
  const lines = source.match(/[^\n]*\n|[^\n]+/g) ?? [];
  const parts: DocumentPart[] = [];
  let markdown = "";
  let math: string[] | undefined;
  let delimiter: "$$" | "\\[" | undefined;
  let inFence = false;

  const flushMarkdown = () => {
    if (markdown) {
      parts.push({ kind: "markdown", source: markdown });
      markdown = "";
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!math && isFence(line)) {
      inFence = !inFence;
      markdown += line;
      continue;
    }

    if (!math && !inFence) {
      const inline = trimmed.match(/^\$\$(.+)\$\$$/s);
      if (inline) {
        flushMarkdown();
        parts.push({ kind: "math", source: inline[1] });
        continue;
      }
      if (trimmed === "$$" || trimmed === "\\[") {
        flushMarkdown();
        math = [];
        delimiter = trimmed === "$$" ? "$$" : "\\[";
        continue;
      }
    }

    if (math && ((delimiter === "$$" && trimmed === "$$") || (delimiter === "\\[" && trimmed === "\\]"))) {
      parts.push({ kind: "math", source: math.join("") });
      math = undefined;
      delimiter = undefined;
      continue;
    }

    if (math) {
      math.push(line);
    } else {
      markdown += line;
    }
  }

  if (math) {
    markdown += `${delimiter}\n${math.join("")}`;
  }
  flushMarkdown();
  return parts;
}

function isImageToken(token: Token): token is Tokens.Image {
  return token.type === "image";
}

async function createParagraphComponent(token: Tokens.Paragraph, documentPath: string): Promise<Component> {
  const inlineTokens = token.tokens ?? [];
  if (!inlineTokens.some(isImageToken)) {
    return new Markdown(token.raw, 0, 0, markdownTheme);
  }

  const children: Component[] = [];
  let text = "";
  const flushText = () => {
    if (text) {
      children.push(new Markdown(text, 0, 0, markdownTheme));
      text = "";
    }
  };

  for (const inlineToken of inlineTokens) {
    if (isImageToken(inlineToken)) {
      flushText();
      children.push(await createImageComponent(inlineToken.href, documentPath, inlineToken.text));
    } else {
      text += inlineToken.raw;
    }
  }
  flushText();

  if (children.length === 1) {
    return children[0];
  }
  return new VStack(children, { gap: 0, align: "start" });
}

async function createMarkdownComponents(source: string, documentPath: string): Promise<Component[]> {
  const components: Component[] = [];
  let markdown = "";
  const flushMarkdown = () => {
    if (markdown.trim()) {
      components.push(new Markdown(markdown, 0, 0, markdownTheme));
    }
    markdown = "";
  };

  for (const token of markdownParser.lexer(source)) {
    if (token.type === "code" && token.lang?.trim().split(/\s+/, 1)[0]?.toLowerCase() === "mermaid") {
      flushMarkdown();
      components.push(createMermaidComponent(token.text));
      continue;
    }

    if (token.type === "paragraph" && token.tokens?.some(isImageToken)) {
      flushMarkdown();
      components.push(await createParagraphComponent(token as Tokens.Paragraph, documentPath));
      continue;
    }

    markdown += token.raw;
  }

  flushMarkdown();
  return components;
}

export async function createDocumentComponents(
  source: string,
  documentPath: string,
  maxMathWidthCells = 100,
): Promise<Component[]> {
  const components: Component[] = [];
  for (const part of splitDisplayMath(source)) {
    if (part.kind === "math") {
      components.push(await renderDisplayMath(part.source, maxMathWidthCells));
    } else {
      components.push(...await createMarkdownComponents(part.source, documentPath));
    }
  }
  return components;
}

export class DocumentView extends VStack {
  private status?: Text;
  private anchors: readonly DocumentAnchor[] = [];
  private anchorOffsets = new Map<string, number>();
  private anchorOffsetWidth?: number;

  constructor() {
    super([], { gap: 1, align: "start" });
  }

  setDocument(components: Component[], status?: string, anchors?: readonly DocumentAnchor[]): void {
    this.clear();
    if (status) {
      this.status = new Text(status, 1, 0);
      this.addChild(this.status);
    } else {
      this.status = undefined;
    }
    for (const component of components) {
      this.addChild(component);
    }
    if (anchors) {
      this.anchors = anchors;
    }
    this.anchorOffsets.clear();
    this.anchorOffsetWidth = undefined;
    this.invalidate();
  }

  getAnchorOffset(fragment: string, width: number): number | undefined {
    const safeWidth = Math.max(1, Math.floor(width));
    if (this.anchorOffsetWidth !== safeWidth) {
      const offsets = new Map<string, number>();
      const lines = this.render(safeWidth);
      let searchFrom = 0;

      for (const anchor of this.anchors) {
        const target = anchor.text.trim();
        const headingWithMarker = `${"#".repeat(anchor.depth)} ${target}`;
        const row = lines.findIndex((line, index) => {
          if (index < searchFrom) {
            return false;
          }
          const visibleLine = stripTerminalSequences(line).trim();
          return visibleLine === target || visibleLine === headingWithMarker;
        });
        if (row !== -1) {
          offsets.set(anchor.id, row);
          searchFrom = row + 1;
        }
      }

      this.anchorOffsets = offsets;
      this.anchorOffsetWidth = safeWidth;
    }
    return this.anchorOffsets.get(fragment);
  }
}
