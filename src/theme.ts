import { highlight, supportsLanguage, type Theme } from "cli-highlight";
import type { MarkdownTheme } from "@earendil-works/pi-tui";

const ansi = (open: string, close = "\u001b[0m") => (text: string): string => `${open}${text}${close}`;

const syntaxTheme: Theme = {
  default: ansi("\u001b[37m"),
  keyword: ansi("\u001b[35m"),
  built_in: ansi("\u001b[36m"),
  type: ansi("\u001b[36m"),
  literal: ansi("\u001b[35m"),
  number: ansi("\u001b[33m"),
  regexp: ansi("\u001b[31m"),
  string: ansi("\u001b[32m"),
  subst: ansi("\u001b[36m"),
  symbol: ansi("\u001b[36m"),
  class: ansi("\u001b[1;36m"),
  function: ansi("\u001b[33m"),
  title: ansi("\u001b[33m"),
  params: ansi("\u001b[37m"),
  comment: ansi("\u001b[2;32m"),
  doctag: ansi("\u001b[2;32m"),
  meta: ansi("\u001b[2;37m"),
  tag: ansi("\u001b[36m"),
  name: ansi("\u001b[36m"),
  attr: ansi("\u001b[33m"),
  attribute: ansi("\u001b[33m"),
  variable: ansi("\u001b[35m"),
};

function plainCode(code: string): string[] {
  return code.split("\n").map(ansi("\u001b[37m"));
}

export function highlightCode(code: string, lang?: string): string[] {
  const language = lang?.trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (!language || ["text", "plaintext", "txt", "none", "no-highlight"].includes(language) || !supportsLanguage(language)) {
    return plainCode(code);
  }

  try {
    return highlight(code, { language, ignoreIllegals: true, theme: syntaxTheme }).split("\n");
  } catch {
    return plainCode(code);
  }
}

export function createMarkdownTheme(): MarkdownTheme {
  return {
    heading: ansi("\u001b[1;36m"),
    link: ansi("\u001b[34m"),
    linkUrl: ansi("\u001b[2;34m"),
    code: ansi("\u001b[33m"),
    codeBlock: ansi("\u001b[37m"),
    codeBlockBorder: ansi("\u001b[2;37m"),
    quote: ansi("\u001b[2;37m"),
    quoteBorder: ansi("\u001b[2;37m"),
    hr: ansi("\u001b[2;37m"),
    listBullet: ansi("\u001b[36m"),
    bold: ansi("\u001b[1m"),
    italic: ansi("\u001b[3m"),
    strikethrough: ansi("\u001b[9m"),
    underline: ansi("\u001b[4m"),
    highlightCode,
  };
}

export const imageTheme = {
  fallbackColor: ansi("\u001b[33m"),
};
