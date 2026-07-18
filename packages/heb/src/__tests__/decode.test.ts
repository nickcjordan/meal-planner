import { describe, it, expect } from "vitest";
import { decodeHtmlEntities } from "../decode.js";

describe("decodeHtmlEntities", () => {
  it("returns the input unchanged when there is no ampersand", () => {
    expect(decodeHtmlEntities("Fresh Broccoli")).toBe("Fresh Broccoli");
  });

  it("decodes a trailing non-breaking space", () => {
    expect(decodeHtmlEntities("Sweet Baby Broccoli&nbsp;")).toBe(
      "Sweet Baby Broccoli ",
    );
  });

  it("decodes ampersands in brand names", () => {
    expect(decodeHtmlEntities("Ben &amp; Jerry's")).toBe("Ben & Jerry's");
  });

  it("decodes numeric decimal and hex entities", () => {
    expect(decodeHtmlEntities("Jalape&#241;o")).toBe("Jalapeño");
    expect(decodeHtmlEntities("Jalape&#xF1;o")).toBe("Jalapeño");
  });

  it("decodes common named accents", () => {
    expect(decodeHtmlEntities("Cr&eacute;me")).toBe("Créme");
  });

  it("leaves unknown entities untouched", () => {
    expect(decodeHtmlEntities("A&unknownentity;B")).toBe("A&unknownentity;B");
  });

  it("is idempotent on already-decoded text", () => {
    const decoded = decodeHtmlEntities("Ben &amp; Jerry's");
    expect(decodeHtmlEntities(decoded)).toBe(decoded);
  });
});
