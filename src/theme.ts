import type { MarkdownTheme } from "@earendil-works/pi-tui";

const ansi = (open: string, close = "\u001b[0m") => (text: string): string => `${open}${text}${close}`;

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
    highlightCode: (code: string) => code.split("\n").map(ansi("\u001b[37m")),
  };
}

export const imageTheme = {
  fallbackColor: ansi("\u001b[33m"),
};
