import { describe, expect, it } from "vitest";
import { mediaSizeError } from "@/lib/media-limits";

const MB = 1024 * 1024;

describe("agent illustrative image limit", () => {
  it("accepts exactly 10 MB", () => {
    expect(mediaSizeError(10 * MB, "agent")).toBeNull();
  });
  it("rejects 10 MB + 1 byte", () => {
    expect(mediaSizeError(10 * MB + 1, "agent")).toBe("Imagem acima de 10 MB.");
  });
});

describe("other admin media keep 2 MB", () => {
  it("rejects 2 MB + 1 byte without agent purpose", () => {
    expect(mediaSizeError(2 * MB + 1, undefined)).toBe("Imagem acima de 2 MB.");
  });
});
