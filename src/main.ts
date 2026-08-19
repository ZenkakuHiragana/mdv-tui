import { watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Key, matchesKey, ProcessTerminal, ScrollView, TuiAltScreen, type Component } from "@earendil-works/pi-tui";
import { createDocumentComponents, DocumentView } from "./document.js";

const fileArgument = process.argv[2];
if (!fileArgument) {
  console.error("使い方: mdviewer <Markdownファイル>");
  process.exit(2);
}

const documentPath = resolve(fileArgument);
const terminal = new ProcessTerminal();
const documentView = new DocumentView();
const scrollView = new ScrollView(documentView, {
  primary: true,
  follow: "none",
  scrollbar: "auto",
});
const tui = new TuiAltScreen(terminal, false, undefined, { mouse: true });

tui.setLayoutRoot(scrollView);
tui.addInputListener((data) => {
  if (matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.escape) || matchesKey(data, "q")) {
    tui.stop();
    watcher?.close();
    process.exit(0);
  }
  return undefined;
});

let watcher: FSWatcher | undefined;
let reloadTimer: NodeJS.Timeout | undefined;
let loading = false;
let reloadAgain = false;
let currentComponents: Component[] = [];

async function reload(): Promise<void> {
  if (loading) {
    reloadAgain = true;
    return;
  }
  loading = true;
  try {
    const source = await readFile(documentPath, "utf8");
    const components = await createDocumentComponents(source, documentPath);
    currentComponents = components;
    documentView.setDocument(currentComponents);
    tui.requestRender(true);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    documentView.setDocument(currentComponents, currentComponents.length === 0
      ? `Markdown を読み込めない: ${reason}`
      : `再読込できない: ${reason}`);
    tui.requestRender(true);
  } finally {
    loading = false;
    if (reloadAgain) {
      reloadAgain = false;
      void reload();
    }
  }
}

function scheduleReload(): void {
  if (reloadTimer) {
    clearTimeout(reloadTimer);
  }
  reloadTimer = setTimeout(() => void reload(), 120);
}

await reload();
watcher = watch(documentPath, scheduleReload);
tui.start();

function shutdown(): void {
  watcher?.close();
  tui.stop();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
