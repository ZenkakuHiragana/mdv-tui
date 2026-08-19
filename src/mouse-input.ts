import type { Terminal } from "@earendil-works/pi-tui";

/**
 * 横パンの入力変換。
 *
 * - ネイティブ横ホイール(SGR 66/67、X10 98/99): 左=左へ、右=右へ。
 *   トラックパッドの横スワイプや横ホイールが送る信号で、ターミナルは
 *   横取りせず転送する。pi-tui は現在黙殺している。
 * - クリップ中の図の上でのミドルボタンドラッグ: 図を掴んで動かす形の横パン。
 *   押下(SGR 1)か、押下が欠落する端末(herdr 等)では最初のミドル移動(33)を
 *   開始として扱い、`hitTest` が真のときだけドラッグを開始する。移動量は
 *   相対で報告する。それ以外の入力は素通しする。
 *
 * SGR マウス(1006)は pi-tui が有効にする。ボタン値: 1 = ミドル、
 * 32 = 移動ビット、64 = ホイール、方向は下位 2 ビット(2 = 左、3 = 右)。
 */
export interface PanCallbacks {
  /** ネイティブ横ホイール。1 = 右へ、-1 = 左へ。 */
  onWheel: (direction: 1 | -1) => void;
  /** ミドルドラッグの移動量(ピクセル相当の列差分)。押下位置からの相対。 */
  onDragBy: (delta: number) => void;
}

/** 0 基点の画面座標 (x, y) が横パンのドラッグ開始領域(クリップ中の図)かを判定する。 */
export type PanHitTest = (x: number, y: number) => boolean;

export function parseHorizontalWheelDirection(data: string): 1 | -1 | null {
  const sgr = /^\x1b\[<(\d+);(\d+);(\d+)[Mm]$/.exec(data);
  if (sgr) {
    return horizontalWheelDirection(Number.parseInt(sgr[1], 10));
  }
  if (data.length === 6 && data.startsWith("\x1b[M")) {
    return horizontalWheelDirection(data.charCodeAt(3) - 32);
  }
  return null;
}

function horizontalWheelDirection(button: number): 1 | -1 | null {
  if ((button & 64) === 0) {
    return null;
  }
  const direction = button & 3;
  if (direction === 2) {
    return -1; // 左
  }
  if (direction === 3) {
    return 1; // 右
  }
  return null;
}

export interface MousePoint {
  x: number; // 0 基点
  y: number; // 0 基点
}

/** ミドルボタンの押下(SGR)。純粋なボタン値 1 のみ。 */
export function parseMiddlePress(data: string): MousePoint | null {
  const m = /^\x1b\[<1;(\d+);(\d+)M$/.exec(data);
  return m ? { x: Number.parseInt(m[1], 10) - 1, y: Number.parseInt(m[2], 10) - 1 } : null;
}

/** ミドルボタンを押したままの移動(SGR)。 */
export function parseMiddleMove(data: string): MousePoint | null {
  const m = /^\x1b\[<(\d+);(\d+);(\d+)M$/.exec(data);
  if (!m) {
    return null;
  }
  const button = Number.parseInt(m[1], 10);
  if ((button & 32) === 0 || (button & 3) !== 1) {
    return null;
  }
  return { x: Number.parseInt(m[2], 10) - 1, y: Number.parseInt(m[3], 10) - 1 };
}

/** 任意ボタンの解放(SGR、小文字 m)。 */
export function parseMiddleRelease(data: string): boolean {
  return /^\x1b\[<\d+;\d+;\d+m$/.test(data);
}

/**
 * 横パン用の入力変換ラッパー。ネイティブ横ホイールとクリップ中の図の
 * ミドルドラッグだけを横取りし、それ以外の入力を素通しする。
 * pi-tui は変更せず、入力の注入点(`Terminal.start`)で選択的に干渉する。
 */
export function createPanTerminal(
  terminal: Terminal,
  callbacks: PanCallbacks,
  hitTest: PanHitTest,
): Terminal {
  return new Proxy(terminal, {
    get(target, prop) {
      if (prop === "start") {
        return (onInput: (data: string) => void, onResize: () => void): void => {
          let dragging: { lastX: number } | null = null;
          target.start((data) => {
            if (dragging) {
              const move = parseMiddleMove(data);
              if (move) {
                callbacks.onDragBy(dragging.lastX - move.x);
                dragging.lastX = move.x;
                return;
              }
              dragging = null;
              if (parseMiddleRelease(data)) {
                return; // 解放で終了(消費)
              }
              // それ以外(新しい押下・他ボタンなど)は通常経路で処理
            }
            const wheel = parseHorizontalWheelDirection(data);
            if (wheel !== null) {
              callbacks.onWheel(wheel);
              return;
            }
            const press = parseMiddlePress(data);
            if (press) {
              if (hitTest(press.x, press.y)) {
                dragging = { lastX: press.x };
              } else {
                onInput(data);
              }
              return;
            }
            const move = parseMiddleMove(data);
            if (move) {
              // 押下が届かない環境(herdr など)では、押下中移動を開始として扱う
              if (hitTest(move.x, move.y)) {
                dragging = { lastX: move.x };
              } else {
                onInput(data);
              }
              return;
            }
            onInput(data);
          }, onResize);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}