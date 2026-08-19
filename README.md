# mdv-tui

Pi TUI を使って Markdown ファイルを端末へ表示する viewer である。

## インストール

```sh
npm install -g @zenorg/mdv-tui
```

## 起動

```sh
mdv "Markdownファイル"
```

終了は `q` または `Esc`、`Ctrl-C`。上下移動、PageUp、PageDown、マウスホイールで文書をスクロールできる。

ターミナル幅より広い Mermaid 図は折り返さず表示し、切り出し領域を横パンで移動できる。操作は `←` / `→` キー、ネイティブ横ホイール(トラックパッドの横スワイプなど)、またはクリップ中の図の上でのミドルボタン(ホイールクリック)ドラッグ。再読込後も横位置は維持される。

対応する表示経路:

- 通常の Markdown と日本語: Pi TUI `Markdown`
- コードフェンス: `cli-highlight`
- Mermaid: `grok-mermaid`(幅超過時は折り返さず横スクロールで図のまま表示)
- ローカル相対画像と `data URI`: Pi TUI `Image`
- インライン LaTeX: Pi TUI の Unicode renderer
- 表示 LaTeX: MathJax で SVG 組版し、PNG に変換して端末画像として表示
