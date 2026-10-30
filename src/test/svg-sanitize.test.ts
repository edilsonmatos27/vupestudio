import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "@/lib/svg-sanitize";

const traced = `<svg width="10" height="10" version="1.1" xmlns="http://www.w3.org/2000/svg" ><path fill="rgb(255,0,0)" stroke="rgb(255,0,0)" stroke-width="1" opacity="1" d="M 0 0 L 10 0 L 10 10 Z " /></svg>`;

describe("sanitizeSvg", () => {
  it("keeps real vector paths from the tracer", () => {
    const r = sanitizeSvg(traced);
    expect(r.shapeCount).toBe(1);
    expect(r.svg).toContain("<path");
  });
  it("rejects scripts", () => {
    expect(() =>
      sanitizeSvg(
        `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0"/></svg>`,
      ),
    ).toThrow();
  });
  it("rejects event handlers", () => {
    expect(() =>
      sanitizeSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0"/></svg>`,
      ),
    ).toThrow();
  });
  it("rejects embedded bitmaps (<image>)", () => {
    expect(() =>
      sanitizeSvg(
        `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AAAA"/></svg>`,
      ),
    ).toThrow();
  });
  it("rejects external references in attribute values", () => {
    expect(() =>
      sanitizeSvg(
        `<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(http://x/y)" d="M0 0"/></svg>`,
      ),
    ).toThrow();
  });
  it("rejects an SVG without vector shapes", () => {
    expect(() => sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><g></g></svg>`)).toThrow();
  });
});
