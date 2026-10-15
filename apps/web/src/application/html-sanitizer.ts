import { createContext, use } from "react";

/**
 * Port: turn untrusted GitHub HTML into markup safe to render (FR-6.6). Returns TrustedHTML
 * where the browser supports Trusted Types, otherwise a sanitised string. Images become a link
 * labelled `imageLabel`. The adapter is infrastructure/browser/trusted-types.ts, provided at
 * the composition root.
 */
export type SanitizeHtml = (dirty: string, imageLabel: string) => TrustedHTML | string;

export const HtmlSanitizerContext = createContext<SanitizeHtml | null>(null);

/** First caller is the PR detail panel (T24). */
export function useSanitizeHtml(): SanitizeHtml {
  const sanitize = use(HtmlSanitizerContext);
  // Fail closed: without a sanitiser there is no safe way to render HTML.
  if (sanitize === null) throw new Error("useSanitizeHtml needs an HtmlSanitizerContext provider");
  return sanitize;
}
