import type { WindowLike } from "dompurify";
import { describe, expect, test } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useSanitizeHtml } from "../../src/application/html-sanitizer.ts";
import { useT } from "../../src/application/i18n.tsx";
import { createSanitizeHtml } from "../../src/infrastructure/browser/trusted-types.ts";
import { SafeHtml } from "../../src/ui/SafeHtml.tsx";
import { expectNoAxeViolations } from "../axe.ts";
import { renderWithProviders } from "../render.tsx";

// Composed the way a feature will: the sanitiser comes from the provider in render.tsx.
interface BodyProps {
  readonly html: string;
  readonly imageLabel?: string;
}

function Body(props: BodyProps) {
  const t = useT();
  return (
    <SafeHtml
      html={props.html}
      imageLabel={props.imageLabel ?? t("imageLabel")}
      sanitize={useSanitizeHtml()}
    />
  );
}

async function renderBody(props: BodyProps): Promise<HTMLElement> {
  const screen = await renderWithProviders(<Body {...props} />);
  return screen.container;
}

declare global {
  interface Window {
    pwned?: boolean;
  }
}

const HOSTILE = `
  <p>Hello</p>
  <script>window.pwned = true</script>
  <img src="x" onerror="window.pwned = true">
  <a href="javascript:window.pwned = true">js</a>
  <a href="JaVaScRiPt:window.pwned = true">mixed case</a>
  <a href="data:text/html,<script>window.pwned = true</script>">data</a>
  <a href="vbscript:msgbox(1)">vb</a>
  <div onclick="window.pwned = true" style="color: red" class="x" id="clobber">styled</div>
  <iframe src="https://example.com"></iframe>
  <form action="https://example.com"><input name="q"><button>go</button></form>
  <object data="x.swf"></object><embed src="x.swf">
  <style>p { color: red }</style>
  <svg><script>window.pwned = true</script><a href="javascript:1">svg</a></svg>
  <math><mi xlink:href="javascript:1">m</mi></math>
`;

describe("SafeHtml (AC-6.3)", () => {
  test("script, on* handlers and script URLs are stripped and nothing executes", async () => {
    const container = await renderBody({ html: HOSTILE });
    const html = container.getHTML();

    expect(container.querySelector("p")?.textContent).toBe("Hello");
    const forbidden = [
      "script",
      "style",
      "iframe",
      "form",
      "input",
      "object",
      "embed",
      "svg",
      "math",
      "img",
    ];
    expect(forbidden.filter((tag) => container.querySelector(tag) !== null)).toEqual([]);
    expect(container.querySelector("[style], [class], [id], [onclick], [onerror]")).toBeNull();
    expect(html).not.toMatch(/\son\w+=/i);
    expect(html).not.toMatch(/javascript:|vbscript:|data:/i);
    // The neutralised links keep their text but lose the href, so they are not links at all.
    for (const anchor of container.querySelectorAll("a")) {
      expect(anchor.hasAttribute("href")).toBe(false);
    }
    // Give a load/error event a chance to fire, had anything survived.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(window.pwned).toBeUndefined();
  });

  test("links open in a new tab without an opener", async () => {
    const container = await renderBody({
      html: '<a href="https://github.com/o/r/pull/1" target="_self">PR</a>',
    });

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://github.com/o/r/pull/1");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  test("an image becomes a labelled link to the original and is never requested", async () => {
    // Same-origin so a request, had one been made, would surely appear in resource timing.
    const src = new URL(`/never-loaded-${crypto.randomUUID()}.png`, location.href).href;
    const container = await renderBody({ html: `<p><img src="${src}" alt="screenshot"></p>` });

    const link = container.querySelector("a");
    expect(container.querySelector("img")).toBeNull();
    expect(link?.textContent).toBe("Image — open in GitHub: screenshot");
    expect(link?.getAttribute("href")).toBe(src);
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.getAttribute("target")).toBe("_blank");

    // Positive control: a real image request to a sibling URL does show up.
    const control = new URL(`/control-${crypto.randomUUID()}.png`, location.href).href;
    await new Promise((resolve) => {
      const image = new Image();
      image.addEventListener("load", resolve);
      image.addEventListener("error", resolve);
      image.src = control;
    });
    await expect.poll(() => performance.getEntriesByName(control).length).toBe(1);
    expect(performance.getEntriesByName(src)).toHaveLength(0);
  });

  test("the image label comes from the caller; images inside a link and unsafe sources become text", async () => {
    const container = await renderBody({
      html: '<a href="https://github.com/a.png"><img src="https://github.com/a.png"></a><img src="javascript:1" alt="bad">',
      imageLabel: "Kuva",
    });

    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]?.textContent).toBe("Kuva");
    expect(container.textContent).toContain("Kuva: bad");
    expect(container.getHTML()).not.toContain("javascript:");
  });
});

describe("the sanitiser", () => {
  const browser: WindowLike = window;

  test("returns TrustedHTML from the ghd-sanitize policy where Trusted Types exist", () => {
    // Chromium supports Trusted Types.
    const sanitize = createSanitizeHtml(browser.trustedTypes);
    const clean = sanitize("<b onclick=x>bold</b>", "Image");
    expect(browser.trustedTypes?.isHTML(clean)).toBe(true);
    // TrustedHTML serialises to its sanitised markup.
    expect(JSON.stringify(clean)).toBe(JSON.stringify("<b>bold</b>"));
  });

  test("falls back to a sanitised string where Trusted Types are unsupported", () => {
    const sanitize = createSanitizeHtml(undefined);
    expect(sanitize('<b onclick="x">bold</b><script>1</script>', "Image")).toBe("<b>bold</b>");
  });

  test("useSanitizeHtml fails closed without a provider", async () => {
    await expect(renderHook(() => useSanitizeHtml())).rejects.toThrow(/HtmlSanitizerContext/);
  });
});

test("rendered GitHub HTML has no axe violations in either theme", async () => {
  const container = await renderBody({
    html: '<h2>Summary</h2><p>See <a href="https://github.com/o/r/pull/1">#1</a>.</p><ul><li>one</li></ul><img src="https://user-images.githubusercontent.com/x.png" alt="diagram">',
  });

  await expectNoAxeViolations(container);
});
