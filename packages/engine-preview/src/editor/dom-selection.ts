import type { Selection } from "@korczak/nexus-engine";

function blockElementOf(node: Node | null, root: HTMLElement): HTMLElement | undefined {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current instanceof HTMLElement && current.hasAttribute("data-block-id")) return current;
    current = current.parentNode;
  }
  return undefined;
}

function pointToPosition(node: Node, offset: number, root: HTMLElement): { blockId: string; offset: number } | undefined {
  const block = blockElementOf(node, root);
  if (!block) return undefined;
  const range = document.createRange();
  range.selectNodeContents(block);
  try {
    range.setEnd(node, offset);
  } catch {
    return undefined;
  }
  return { blockId: block.getAttribute("data-block-id")!, offset: range.toString().length };
}

/** Translates the browser selection into a logical engine selection (or undefined if it is outside the editor). */
export function readDomSelection(root: HTMLElement): Selection | undefined {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !sel.focusNode) return undefined;
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return undefined;
  const anchor = pointToPosition(sel.anchorNode, sel.anchorOffset, root);
  const focus = pointToPosition(sel.focusNode, sel.focusOffset, root);
  return anchor && focus ? { anchor, focus } : undefined;
}

function positionToPoint(blockId: string, offset: number, root: HTMLElement): { node: Node; offset: number } | undefined {
  const block = Array.from(root.querySelectorAll<HTMLElement>("[data-block-id]")).find((b) => b.getAttribute("data-block-id") === blockId);
  if (!block) return undefined;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let last: Text | undefined;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    last = text;
    if (offset <= consumed + text.length) return { node: text, offset: offset - consumed };
    consumed += text.length;
  }
  if (last) return { node: last, offset: last.length };
  return { node: block, offset: 0 };
}

/** Projects a logical selection back onto the DOM. Returns true when the DOM selection changed. */
export function writeDomSelection(root: HTMLElement, selection: Selection | undefined): boolean {
  const sel = window.getSelection();
  if (!sel || !selection) return false;
  const a = positionToPoint(selection.anchor.blockId, selection.anchor.offset, root);
  const f = positionToPoint(selection.focus.blockId, selection.focus.offset, root);
  if (!a || !f) return false;
  sel.setBaseAndExtent(a.node, a.offset, f.node, f.offset);
  return true;
}
