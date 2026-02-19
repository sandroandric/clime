import { describe, expect, it } from "vitest";
import { sanitizeBinaryCandidate } from "../src/index.js";

describe("verifier sanitizeBinaryCandidate", () => {
  it("returns safe binary names", () => {
    expect(sanitizeBinaryCandidate("stripe")).toBe("stripe");
  });

  it("rejects dangerous candidates", () => {
    expect(sanitizeBinaryCandidate("--help")).toBeNull();
    expect(sanitizeBinaryCandidate("$(rm -rf /)")).toBeNull();
  });
});
