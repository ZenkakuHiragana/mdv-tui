import { Marked, Markdown, Text, VStack, type Component, type Token, type Tokens } from "@earendil-works/pi-tui";
import { createImageComponent } from "./images.js";
import { renderDisplayMath } from "./math.js";
import { createMermaidComponent } from "./mermaid.js";
import { createMarkdownTheme } from "./theme.js";

const markdownParser = new Marked();
const markdownTheme = createMarkdownTheme();

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

  constructor() {
    super([], { gap: 1, align: "start" });
  }

  setDocument(components: Component[], status?: string): void {
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
    this.invalidate();
  }
}
