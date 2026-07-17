import { describe, it, expect } from "vitest";
import { parseValidFrom, parseValidTo } from "../weekly-ad.js";

describe("parseValidFrom", () => {
  it("parses a date-only string as local start of day", () => {
    const d = parseValidFrom("2026-07-15");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // July (0-indexed)
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("passes a full datetime string through unchanged", () => {
    const iso = "2026-07-15T12:34:56.000Z";
    expect(parseValidTo(iso).getTime()).toBe(new Date(iso).getTime());
  });
});

describe("parseValidTo (end-of-day local boundary)", () => {
  it("parses a date-only string as local end of day", () => {
    const d = parseValidTo("2026-07-21");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(21);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });

  it("keeps an ad 'valid through the 21st' still valid the evening of the 20th", () => {
    const to = parseValidTo("2026-07-21");
    const eveningOf20th = new Date("2026-07-20T20:00:00"); // local
    expect(to.getTime()).toBeGreaterThan(eveningOf20th.getTime());
  });

  it("keeps the ad valid the evening of its final day", () => {
    const to = parseValidTo("2026-07-21");
    const eveningOf21st = new Date("2026-07-21T18:00:00"); // local
    expect(to.getTime()).toBeGreaterThan(eveningOf21st.getTime());
  });

  it("expires the ad by the start of the following day", () => {
    const to = parseValidTo("2026-07-21");
    const startOf22nd = new Date("2026-07-22T00:00:00"); // local
    expect(to.getTime()).toBeLessThan(startOf22nd.getTime());
  });
});
