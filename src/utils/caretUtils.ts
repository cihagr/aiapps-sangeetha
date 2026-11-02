export function saveCaretPosition(el: HTMLElement) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return 0;

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(el);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length; // absolute offset
  }

export function restoreCaretPosition(el: HTMLElement, offset: number) {
    const selection = window.getSelection();
    const range = document.createRange();

    if (!el.textContent || el.textContent.length === 0) {
      // Element is empty → place caret at start
      range.setStart(el, 0);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }

    let currentOffset = 0;
    function traverse(node: Node): boolean {
      if (node.nodeType === Node.TEXT_NODE) {
        const nextOffset = currentOffset + (node.textContent?.length || 0);
        if (offset <= nextOffset) {
          range.setStart(node, offset - currentOffset);
          range.collapse(true);
          return true;
        }
        currentOffset = nextOffset;
      } else {
        for (let child of node.childNodes) {
          if (traverse(child)) return true;
        }
      }
      return false;
    }

    traverse(el);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }