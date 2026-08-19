# mdviewer

Pi TUI を使って Markdown ファイルを端末へ表示する viewer である。

## 起動

```sh
npm install
npm run build
node dist/main.js fixtures/sample.md
```

終了は `q` または `Esc`、`Ctrl-C`。上下移動、PageUp、PageDown、マウスホイールで文書をスクロールできる。

対応する表示経路:

- 通常の Markdown と日本語: Pi TUI `Markdown`
- Mermaid: `grok-mermaid`
- ローカル相対画像と `data URI`: Pi TUI `Image`
- インライン LaTeX: Pi TUI の Unicode renderer
- 表示 LaTeX: MathJax で SVG 組版し、PNG に変換して端末画像として表示

第一版では遠隔 URL の画像と、インライン数式を画像のまま行内へ配置する処理は扱わない。
