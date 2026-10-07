const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;
const SKIP_PARENT_TAGS = new Set(["A", "CODE", "PRE", "SCRIPT", "STYLE"]);

/**
 * Wraps bare http(s) URLs in a rendered body's text nodes in <a> tags, in
 * place. For stored bodies saved as plain text (before the sanitizer started
 * keeping <a>, or typed without the editor's autolink firing). Skips text
 * already inside a link or code. Only ever creates anchors via DOM APIs with
 * the matched text as textContent, so it can't introduce markup.
 */
export function linkifyDomText(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent && !SKIP_PARENT_TAGS.has(parent.tagName) && !parent.closest("a, code, pre")) {
      textNodes.push(node as Text);
    }
  }

  for (const textNode of textNodes) {
    const text = textNode.data;
    URL_PATTERN.lastIndex = 0;
    if (!URL_PATTERN.test(text)) continue;
    URL_PATTERN.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let last = 0;
    for (const match of Array.from(text.matchAll(URL_PATTERN))) {
      const url = match[0].replace(TRAILING_PUNCTUATION, "");
      if (!url) continue;
      const start = match.index!;
      fragment.append(text.slice(last, start));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.textContent = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer nofollow";
      fragment.append(anchor);
      last = start + url.length;
    }
    fragment.append(text.slice(last));
    textNode.replaceWith(fragment);
  }
}
