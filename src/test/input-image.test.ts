import { describe, expect, it } from "vitest";
import { PhotonImage } from "@cf-wasm/photon";
import { InputImageError, normalizeInputImage } from "@/lib/input-image.server";

const fixtures = {
  PNG: "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFklEQVR4nGM8kaIRxcDAwMDEAAVwBgAqVgG0/CXyCQAAAABJRU5ErkJggg==",
  WEBP: "UklGRlwAAABXRUJQVlA4WAoAAAAQAAAAAQAAAgAAQUxQSAcAAAAAWlpaWlpaAFZQOCAuAAAA0AEAnQEqAgADAAFAJiWgAnS6AfgAA7AA/su3/87BsS7XuB/9Js8TZ4mz45gAAA==",
  JPEG: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCKiiivlT7E/9k=",
};
const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

describe("input image normalization", () => {
  for (const [format, base64] of Object.entries(fixtures)) {
    it(`decodes ${format} and returns a PNG with matching dimensions and filename`, () => {
      const result = normalizeInputImage(decode(base64), "referencia.errada");
      expect(result.mime).toBe("image/png");
      expect(result.name).toBe("referencia.png");
      expect(Array.from(result.bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      const image = PhotonImage.new_from_byteslice(result.bytes);
      try {
        expect(image.get_width()).toBe(2);
        expect(image.get_height()).toBe(3);
        if (format !== "JPEG") expect(image.get_raw_pixels()[3]).toBe(90);
      } finally {
        image.free();
      }
    });
  }
  it("rejects a PNG header with truncated pixel data and identifies the file", () => {
    expect(() => normalizeInputImage(decode(fixtures.PNG).slice(0, 50), "moto.png")).toThrow(
      /moto.png/,
    );
    // A decoder error must not prevent later requests from succeeding.
    expect(normalizeInputImage(decode(fixtures.PNG), "valida.png").bytes.length).toBeGreaterThan(0);
  });
  it("rejects HTML, empty files and unsupported formats", () => {
    for (const bytes of [
      new Uint8Array(),
      new TextEncoder().encode("<html>erro</html>"),
      new TextEncoder().encode("GIF89a"),
    ])
      expect(() => normalizeInputImage(bytes, "arquivo.png")).toThrow(InputImageError);
  });
  it("rejects excessive dimensions before allocating pixel memory", () => {
    const bytes = decode(fixtures.PNG);
    new DataView(bytes.buffer).setUint32(16, 9_000_000);
    expect(() => normalizeInputImage(bytes, "grande.png")).toThrow(/24 megapixels/);
  });
});
