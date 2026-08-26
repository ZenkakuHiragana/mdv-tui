import {
  getCapabilities,
  getCellDimensions,
  setCapabilities,
  setCellDimensions,
  type CellDimensions,
  type ImageProtocol,
} from "@earendil-works/pi-tui";

/** Kitty graphics protocol のサポート問い合わせ（1x1 の RGB データを a=q で送る）。 */
const KITTY_GRAPHICS_QUERY = "\u001b_Gi=4242,s=1,v=1,a=q,t=d,f=24;AAAA\u001b\\";
/** セル寸法（画素）の問い合わせ。応答は `CSI 6 ; 高さ ; 幅 t`。 */
const CELL_SIZE_QUERY = "\u001b[16t";
/** 窓の画素サイズの問い合わせ。応答は `CSI 4 ; 高さ ; 幅 t`。セル寸法の逆算に使う。 */
const WINDOW_SIZE_QUERY = "\u001b[14t";
/** 上記を知らない端末でも必ず応答する番兵（Primary Device Attributes）。最後に送る。 */
const DEVICE_ATTRIBUTES_QUERY = "\u001b[c";
const PROBE_TIMEOUT_MS = 300;

export type GraphicsProbeOutcome = "kitty" | "none";

export interface TerminalProbeResult {
  images: GraphicsProbeOutcome;
  /** `CSI 16 t` が報告したセル寸法。 */
  reportedCell?: CellDimensions;
  /** `CSI 14 t` が報告した窓の画素サイズ。 */
  windowPx?: CellDimensions;
  /** 端末から実際に届いた応答（診断表示用）。 */
  raw: string;
}

/**
 * セル寸法として現実にあり得る値か。
 *
 * 端末やその中継が `CSI 16 t` に無意味な値を返すことがある（実測例: `\x1b[6;8;2t`
 * = 2x8 画素）。Kitty graphics は指定セル数へ画像を引き伸ばすため、誤った寸法を
 * 信じると縦横比が崩れる。等幅フォントのグリフ寸法として妥当な範囲だけを受け入れる。
 */
export function isPlausibleCellSize(cell: CellDimensions | undefined): cell is CellDimensions {
  if (!cell) {
    return false;
  }
  const ratio = cell.heightPx / cell.widthPx;
  return cell.widthPx >= 4 && cell.widthPx <= 64
    && cell.heightPx >= 8 && cell.heightPx <= 128
    && ratio >= 1.2 && ratio <= 4;
}

/** 窓の画素サイズと端末のセル数からセル寸法を逆算する。 */
export function deriveCellSize(
  windowPx: CellDimensions | undefined,
  columns: number | undefined,
  rows: number | undefined,
): CellDimensions | undefined {
  if (!windowPx || !columns || !rows) {
    return undefined;
  }
  const cell = {
    widthPx: Math.floor(windowPx.widthPx / columns),
    heightPx: Math.floor(windowPx.heightPx / rows),
  };
  return isPlausibleCellSize(cell) ? cell : undefined;
}

/** 応答に Kitty graphics の APC 応答（`\x1b_G...\x1b\`）が含まれるか。 */
export function hasKittyGraphicsResponse(buffer: string): boolean {
  const start = buffer.indexOf("\u001b_G");
  return start >= 0 && buffer.indexOf("\u001b\\", start) > start;
}

/** 応答に含まれる `CSI <code> ; 高さ ; 幅 t` を寸法として取り出す。 */
function parseWindowOpsResponse(buffer: string, code: 4 | 6): CellDimensions | undefined {
  const match = new RegExp(`\\u001b\\[${code};(\\d+);(\\d+)t`).exec(buffer);
  if (!match) {
    return undefined;
  }
  const heightPx = Number.parseInt(match[1] as string, 10);
  const widthPx = Number.parseInt(match[2] as string, 10);
  if (!(heightPx > 0) || !(widthPx > 0)) {
    return undefined;
  }
  return { widthPx, heightPx };
}

/** 応答に含まれる `CSI 6 ; 高さ ; 幅 t`（セル寸法）を取り出す。 */
export function parseCellSizeResponse(buffer: string): CellDimensions | undefined {
  return parseWindowOpsResponse(buffer, 6);
}

/** 応答に含まれる `CSI 4 ; 高さ ; 幅 t`（窓の画素サイズ）を取り出す。 */
export function parseWindowSizeResponse(buffer: string): CellDimensions | undefined {
  return parseWindowOpsResponse(buffer, 4);
}

/** 番兵の DA1 応答（`CSI ? ... c`）が届いたか。届けば以前の問い合わせも全て応答済み。 */
export function hasDeviceAttributesResponse(buffer: string): boolean {
  return /\u001b\[\?[\d;]*c/.test(buffer);
}

/** `MDV_IMAGE_PROTOCOL` による明示指定を読む。未指定・不正値は `undefined`。 */
export function parseImageProtocolOverride(value: string | undefined): ImageProtocol | undefined {
  switch (value?.trim().toLowerCase()) {
    case "kitty":
      return "kitty";
    case "iterm2":
      return "iterm2";
    case "none":
    case "off":
      return null;
    default:
      return undefined;
  }
}

/** `MDV_CELL_SIZE=幅x高さ`（画素）による明示指定を読む。 */
export function parseCellSizeOverride(value: string | undefined): CellDimensions | undefined {
  const match = /^\s*(\d+)\s*[x*,]\s*(\d+)\s*$/i.exec(value ?? "");
  if (!match) {
    return undefined;
  }
  const widthPx = Number.parseInt(match[1] as string, 10);
  const heightPx = Number.parseInt(match[2] as string, 10);
  if (!(widthPx > 0) || !(heightPx > 0)) {
    return undefined;
  }
  return { widthPx, heightPx };
}

export function isMultiplexed(): boolean {
  const term = process.env.TERM?.toLowerCase() ?? "";
  return Boolean(process.env.TMUX) || term.startsWith("tmux") || term.startsWith("screen");
}

/**
 * 端末へ問い合わせて Kitty graphics 対応とセル寸法を実測する。
 * stdin を一時的に raw モードにし、番兵応答か時間切れで必ず解決する。
 */
export async function probeTerminal(): Promise<TerminalProbeResult> {
  const stdin = process.stdin;
  const stdout = process.stdout;
  if (!stdin.isTTY || !stdout.isTTY) {
    return { images: "none", raw: "" };
  }

  const wasRaw = stdin.isRaw;
  const wasPaused = stdin.isPaused();
  return await new Promise<TerminalProbeResult>((resolvePromise) => {
    let buffer = "";
    let timer: NodeJS.Timeout | undefined;

    const finish = (): void => {
      if (timer) {
        clearTimeout(timer);
      }
      stdin.off("data", onData);
      if (!wasRaw && stdin.setRawMode) {
        stdin.setRawMode(false);
      }
      if (wasPaused) {
        stdin.pause();
      }
      const reportedCell = parseCellSizeResponse(buffer);
      const windowPx = parseWindowSizeResponse(buffer);
      resolvePromise({
        images: hasKittyGraphicsResponse(buffer) ? "kitty" : "none",
        ...(reportedCell ? { reportedCell } : {}),
        ...(windowPx ? { windowPx } : {}),
        raw: buffer,
      });
    };

    const onData = (chunk: Buffer | string): void => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("latin1");
      if (hasDeviceAttributesResponse(buffer)) {
        finish();
      }
    };

    if (!wasRaw && stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    stdin.on("data", onData);
    stdin.resume();
    timer = setTimeout(finish, PROBE_TIMEOUT_MS);
    stdout.write(KITTY_GRAPHICS_QUERY + WINDOW_SIZE_QUERY + CELL_SIZE_QUERY + DEVICE_ATTRIBUTES_QUERY);
  });
}

/** セル寸法をどこから得たか。 */
export type CellSizeSource = "override" | "reported" | "derived" | "default";

export interface ResolvedTerminalCapabilities {
  images: ImageProtocol;
  cell: CellDimensions;
  cellSource: CellSizeSource;
  probe?: TerminalProbeResult;
}

/**
 * 問い合わせ結果と明示指定から、採用するセル寸法とその出所を決める。
 *
 * `CSI 16 t` の報告値を最優先するが、あり得ない値を返す端末・中継があるため
 * 妥当性を検査し、失格なら `CSI 14 t` の窓画素サイズとセル数から逆算する。
 * どちらも使えなければ pi-tui の既定値を保つ。
 */
export function chooseCellSize(input: {
  override?: CellDimensions | undefined;
  reported?: CellDimensions | undefined;
  windowPx?: CellDimensions | undefined;
  columns?: number | undefined;
  rows?: number | undefined;
  fallback: CellDimensions;
}): { cell: CellDimensions; source: CellSizeSource } {
  if (input.override) {
    return { cell: input.override, source: "override" };
  }
  if (isPlausibleCellSize(input.reported)) {
    return { cell: input.reported, source: "reported" };
  }
  const derived = deriveCellSize(input.windowPx, input.columns, input.rows);
  if (derived) {
    return { cell: derived, source: "derived" };
  }
  return { cell: input.fallback, source: "default" };
}

/**
 * 画像プロトコルとセル寸法を確定させる。
 *
 * pi-tui の既定判定は環境変数だけを見るため、SSH 越しなど `TERM_PROGRAM` や
 * `WEZTERM_PANE` が伝わらない環境では対応端末でも `images: null` になる。
 * また Kitty graphics は `c`/`r` で指定したセル数へ画像を引き伸ばすため、
 * セル寸法が既定値（9x18 画素）のままだと縦横比が崩れる。どちらも最初の
 * 描画より前に端末へ問い合わせて確定させる。
 */
export async function resolveTerminalCapabilities(): Promise<ResolvedTerminalCapabilities> {
  const capabilities = getCapabilities();
  const protocolOverride = parseImageProtocolOverride(process.env.MDV_IMAGE_PROTOCOL);
  const cellOverride = parseCellSizeOverride(process.env.MDV_CELL_SIZE);

  let images = protocolOverride === undefined ? capabilities.images : protocolOverride;
  let probe: TerminalProbeResult | undefined;

  const needsProbe = (images === null && protocolOverride === undefined && !isMultiplexed())
    || (images !== null && cellOverride === undefined);
  if (needsProbe) {
    probe = await probeTerminal();
    if (images === null && probe.images === "kitty") {
      images = "kitty";
    }
    if (probe.windowPx) {
      lastWindowPx = probe.windowPx;
    }
  }

  const { cell, source } = chooseCellSize({
    override: cellOverride,
    reported: probe?.reportedCell,
    windowPx: probe?.windowPx,
    columns: process.stdout.columns,
    rows: process.stdout.rows,
    fallback: getCellDimensions(),
  });
  setCellDimensions(cell);

  if (images !== capabilities.images) {
    setCapabilities({ ...capabilities, images, trueColor: images ? true : capabilities.trueColor });
  }

  return {
    images,
    cell,
    cellSource: source,
    ...(probe ? { probe } : {}),
  };
}

/** 直近に端末が報告した窓の画素サイズ。セル寸法の逆算に使う。 */
let lastWindowPx: CellDimensions | undefined;

/**
 * 実行中に届いた `CSI 4 ; ... t` / `CSI 6 ; ... t` を検査してセル寸法へ反映する。
 * 反映したときだけ `true` を返す。`MDV_CELL_SIZE` 指定時は常に無視する。
 */
export function applyWindowOpsResponses(data: string): boolean {
  if (parseCellSizeOverride(process.env.MDV_CELL_SIZE)) {
    return false;
  }
  const windowPx = parseWindowSizeResponse(data);
  if (windowPx) {
    lastWindowPx = windowPx;
  }
  const { cell, source } = chooseCellSize({
    reported: parseCellSizeResponse(data),
    windowPx: lastWindowPx,
    columns: process.stdout.columns,
    rows: process.stdout.rows,
    fallback: getCellDimensions(),
  });
  if (source === "default") {
    return false;
  }
  const current = getCellDimensions();
  if (current.widthPx === cell.widthPx && current.heightPx === cell.heightPx) {
    return false;
  }
  setCellDimensions(cell);
  return true;
}

const CELL_SOURCE_LABEL: Record<CellSizeSource, string> = {
  override: "MDV_CELL_SIZE による明示指定",
  reported: "端末の報告値",
  derived: "窓の画素サイズから逆算",
  default: "既定値",
};

function formatDimensions(value: CellDimensions | undefined): string {
  return value ? `${value.widthPx}x${value.heightPx} 画素` : "(応答なし)";
}

/** `--diagnose-terminal` 用の人間可読な診断結果。 */
export function formatTerminalDiagnostics(resolved: ResolvedTerminalCapabilities): string {
  const escaped = (resolved.probe?.raw ?? "").replace(/\u001b/g, "\\e").replace(/[\u0000-\u001f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
  return [
    `TERM=${process.env.TERM ?? "(未設定)"} COLORTERM=${process.env.COLORTERM ?? "(未設定)"} TERM_PROGRAM=${process.env.TERM_PROGRAM ?? "(未設定)"}`,
    `多重化(tmux/screen): ${isMultiplexed() ? "あり" : "なし"}`,
    `画像プロトコル: ${resolved.images ?? "なし"}`,
    `セル寸法: ${resolved.cell.widthPx}x${resolved.cell.heightPx} 画素 (${CELL_SOURCE_LABEL[resolved.cellSource]})`,
    `端末の報告値(CSI 16 t): ${formatDimensions(resolved.probe?.reportedCell)}${resolved.probe?.reportedCell && !isPlausibleCellSize(resolved.probe.reportedCell) ? " ← あり得ない値のため不採用" : ""}`,
    `窓の画素サイズ(CSI 14 t): ${formatDimensions(resolved.probe?.windowPx)}`,
    `端末サイズ: ${process.stdout.columns ?? "?"}x${process.stdout.rows ?? "?"} セル`,
    `端末応答: ${escaped || "(なし)"}`,
  ].join("\n");
}
