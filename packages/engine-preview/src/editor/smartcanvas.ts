import type { NexusDocument, Selection } from "@korczak/nexus-engine";
import type { PreviewController } from "../services/controller";
import { readDomSelection, writeDomSelection } from "./dom-selection";
import { attachInput } from "./input";
import { renderDocument } from "./render";

/** Renderer contract: projects the canonical engine model onto a visual surface. */
export interface SmartCanvasRenderer {
  render(document: NexusDocument, root: HTMLElement): void;
}

/** Selection contract: translates between logical positions and a platform surface. */
export interface SmartCanvasSelectionAdapter {
  read(root: HTMLElement): Selection | undefined;
  write(root: HTMLElement, selection: Selection | undefined): boolean;
}

/** Input contract: translates platform input into semantic engine operations. */
export interface SmartCanvasInputAdapter {
  attach(root: HTMLElement, controller: PreviewController): () => void;
}

export interface SmartCanvasSurfaceOptions {
  renderer?: SmartCanvasRenderer;
  selection?: SmartCanvasSelectionAdapter;
  input?: SmartCanvasInputAdapter;
}

/**
 * Coordinates the editor surface without owning document state or commands.
 * The engine remains the sole source of truth; rendered DOM is disposable.
 */
export class SmartCanvasSurface {
  private lastDocument: NexusDocument | undefined;
  private readonly renderer: SmartCanvasRenderer;
  private readonly selection: SmartCanvasSelectionAdapter;
  private readonly detachInput: () => void;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly root: HTMLElement,
    private readonly controller: PreviewController,
    options: SmartCanvasSurfaceOptions = {},
  ) {
    this.renderer = options.renderer ?? { render: renderDocument };
    this.selection = options.selection ?? {
      read: readDomSelection,
      write: writeDomSelection,
    };
    this.detachInput = (options.input ?? { attach: attachInput }).attach(root, controller);
    this.unsubscribe = controller.subscribe(() => this.refresh());
    this.refresh(true);
  }

  refresh(force = false): void {
    const document = this.controller.document;
    if (force || document !== this.lastDocument) {
      this.renderer.render(document, this.root);
      this.lastDocument = document;
      if (this.hasFocus()) this.selection.write(this.root, this.controller.selection);
      return;
    }

    if (!this.hasFocus()) return;
    const visualSelection = this.selection.read(this.root);
    const logicalSelection = this.controller.selection;
    const differs =
      !visualSelection ||
      !logicalSelection ||
      visualSelection.anchor.blockId !== logicalSelection.anchor.blockId ||
      visualSelection.anchor.offset !== logicalSelection.anchor.offset ||
      visualSelection.focus.blockId !== logicalSelection.focus.blockId ||
      visualSelection.focus.offset !== logicalSelection.focus.offset;
    if (differs && logicalSelection) this.selection.write(this.root, logicalSelection);
  }

  focus(): void {
    this.root.focus();
    this.selection.write(this.root, this.controller.selection);
  }

  dispose(): void {
    this.unsubscribe();
    this.detachInput();
  }

  private hasFocus(): boolean {
    return document.activeElement === this.root || this.root.contains(document.activeElement);
  }
}
