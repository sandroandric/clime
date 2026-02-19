import { describe, expect, it } from "vitest";
import { slugify } from "../src/index.js";

describe("indexer slugify", () => {
  it("normalizes scoped package names", () => {
    expect(slugify("@scope/my-cli")).toBe("scope-my-cli");
  });

  it("removes invalid chars and trims dashes", () => {
    expect(slugify("___Hello CLI___")).toBe("hello-cli");
  });
});
