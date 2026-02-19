import { describe, expect, it } from "vitest";
import { completionScript } from "../src/completions.js";

describe("shell completions", () => {
  const commands = [
    "configure",
    "init",
    "search",
    "which",
    "install",
    "workflow",
    "rankings",
    "submit",
    "completion",
    "completions"
  ];

  it("generates zsh completions with core commands", () => {
    const script = completionScript("zsh", commands);
    expect(script).toContain("init");
    expect(script).toContain("search");
    expect(script).toContain("workflow");
    expect(script).toContain("completions");
  });

  it("generates bash completions", () => {
    const script = completionScript("bash", commands);
    expect(script).toContain("_clime_complete");
    expect(script).toContain("rankings");
  });

  it("includes commands passed at runtime", () => {
    const script = completionScript("fish", [...commands, "custom-command"]);
    expect(script).toContain("custom-command");
  });
});
