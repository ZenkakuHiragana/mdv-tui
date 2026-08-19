import { Text, type Component } from "@earendil-works/pi-tui";
import { render } from "grok-mermaid";

export function createMermaidComponent(source: string): Component {
  try {
    const art = render(source);
    if (!art) {
      return new Text(source, 1, 0);
    }

    const diagram = art.plain.join("\n");
    return new Text(diagram, 1, 0);
  } catch {
    return new Text(source, 1, 0);
  }
}
