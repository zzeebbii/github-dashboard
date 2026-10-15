import DOMPurify, { type Config, type WindowLike } from "dompurify";
import type { SanitizeHtml } from "../../application/html-sanitizer.ts";

/**
 * The app's only Trusted Types policy and the HTML sanitiser behind it (FR-6.6).
 *
 * The CSP allows exactly one policy name, `ghd-sanitize`, and no duplicates. DOMPurify has to
 * parse untrusted markup in an inert document, and under `require-trusted-types-for 'script'`
 * that parse is itself a sink, so DOMPurify needs a policy that passes its input through. We
 * hand it ours (TRUSTED_TYPES_POLICY) so it never tries to create its own `dompurify` policy,
 * which the CSP would block. The pass-through policy object stays inside `createSanitizeHtml`'s
 * closure: the only way to mint TrustedHTML in this app is to go through DOMPurify below.
 *
 * Hooks live on a private DOMPurify instance, so nothing leaks onto the shared default export.
 */

// Absolute http(s) and mailto only: drops javascript:, data:, vbscript: and relative URLs
// (which would resolve against this app's origin, not github.com).
const SAFE_URL = /^(?:https?:|mailto:)/i;

const CONFIG = {
  // Allow-list of what GitHub's rendered Markdown uses. Everything else (script, style, iframe,
  // form, input, object, embed, svg, math, img, ...) is removed; text content of unknown
  // elements such as <g-emoji> is kept.
  ALLOWED_TAGS: [
    "a",
    "abbr",
    "b",
    "blockquote",
    "br",
    "code",
    "dd",
    "del",
    "details",
    "div",
    "dl",
    "dt",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "ins",
    "kbd",
    "li",
    "mark",
    "ol",
    "p",
    "pre",
    "q",
    "s",
    "samp",
    "small",
    "span",
    "strong",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "tt",
    "u",
    "ul",
    "var",
  ],
  // No on*, style (the CSP forbids inline style anyway), class, id or name (DOM clobbering).
  ALLOWED_ATTR: ["href", "title", "colspan", "rowspan", "open", "dir"],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  ALLOWED_URI_REGEXP: SAFE_URL,
} satisfies Config;

// DOMPurify's API requires createScriptURL, but the allow-list has no script or script-URL
// sink, so neither script callback is ever legitimately reached: refuse, never pass through.
const refuse = () => {
  throw new TypeError("ghd-sanitize creates HTML only");
};

/** Exported for tests, which also exercise the no-Trusted-Types fallback. */
export function createSanitizeHtml(trustedTypes: WindowLike["trustedTypes"]): SanitizeHtml {
  const purify = DOMPurify(window);

  // Links open outside the app and never hand GitHub's page a window.opener.
  purify.addHook("afterSanitizeAttributes", (node) => {
    if (node instanceof HTMLAnchorElement && node.hasAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });

  const policy = trustedTypes?.createPolicy("ghd-sanitize", {
    createHTML: (input) => input,
    createScript: refuse,
    createScriptURL: refuse,
  });

  return (dirty, imageLabel) => {
    // Images are never loaded (img-src stays limited to avatars): each becomes a labelled link
    // to the original. The parse happens in an inert document, so no request is made here.
    // Added per call because the label is per call; removed in `finally` so it cannot leak.
    const replaceImage = (node: Node, data: { tagName: string }) => {
      if (data.tagName !== "img" || !(node instanceof Element)) return;
      const src = node.getAttribute("src") ?? "";
      const alt = node.getAttribute("alt")?.trim() ?? "";
      const text = alt === "" ? imageLabel : `${imageLabel}: ${alt}`;
      const doc = node.ownerDocument;
      // Inside an existing link the label is enough (nested links are invalid); the img itself
      // is then removed by the allow-list.
      if (node.closest("a") !== null || !SAFE_URL.test(src)) {
        node.before(doc.createTextNode(text));
        return;
      }
      const link = doc.createElement("a");
      link.setAttribute("href", src);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
      link.textContent = text;
      node.before(link);
    };

    purify.addHook("uponSanitizeElement", replaceImage);
    try {
      return policy === undefined
        ? // No Trusted Types (older Firefox/Safari): a plain sanitised string. `null` stops
          // DOMPurify from attempting a policy of its own.
          purify.sanitize(dirty, { ...CONFIG, TRUSTED_TYPES_POLICY: null })
        : purify.sanitize(dirty, {
            ...CONFIG,
            TRUSTED_TYPES_POLICY: policy,
            RETURN_TRUSTED_TYPE: true,
          });
    } finally {
      purify.removeHook("uponSanitizeElement", replaceImage);
    }
  };
}

// lib.dom does not declare Trusted Types yet; DOMPurify's WindowLike does.
const browser: WindowLike = window;

/** The app-wide sanitiser. Importing this module creates the policy, once. */
export const sanitizeHtml = createSanitizeHtml(browser.trustedTypes);
