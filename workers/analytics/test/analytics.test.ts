import { describe, expect, it } from "vitest";
import { computeCompatibilityLeaderboard } from "../src/index.js";

describe("analytics leaderboard", () => {
  it("sorts by score descending", () => {
    const ranking = computeCompatibilityLeaderboard([
      { cli_slug: "a", status: "pass" },
      { cli_slug: "a", status: "pass" },
      { cli_slug: "b", status: "pass" },
      { cli_slug: "b", status: "fail" }
    ]);

    expect(ranking[0].cli).toBe("a");
    expect(ranking[0].score).toBeGreaterThan(ranking[1].score);
  });
});
