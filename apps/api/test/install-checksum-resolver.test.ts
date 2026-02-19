import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InstallInstruction } from "@cli-me/shared-types";
import { InstallChecksumResolver } from "../src/lib/install-checksum-resolver.js";

function makeInstruction(partial: Partial<InstallInstruction>): InstallInstruction {
  return {
    os: "macos",
    package_manager: "brew",
    command: "brew install example",
    dependencies: [],
    ...partial
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("install checksum resolver", () => {
  it("resolves brew formula checksums from formula metadata", async () => {
    const digest = "a".repeat(64);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://formulae.brew.sh/api/formula/vercel-cli.json") {
        return new Response(
          JSON.stringify({
            urls: {
              stable: {
                checksum: digest
              }
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new InstallChecksumResolver();
    const [resolved] = await resolver.enrichInstallInstructions("vercel", [
      makeInstruction({
        package_manager: "brew",
        command: "brew install vercel-cli"
      })
    ]);

    expect(resolved.checksum).toBe(`sha256:${digest}`);
  });

  it("resolves npm package checksum by hashing downloaded tarball", async () => {
    const tarball = Buffer.from("clime-test-tarball", "utf8");
    const expected = createHash("sha256").update(tarball).digest("hex");

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://registry.npmjs.org/%40cli-me%2Fcli/latest") {
        return new Response(
          JSON.stringify({
            dist: {
              tarball: "https://registry.npmjs.org/@cli-me/cli/-/cli-0.1.0.tgz"
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      if (url === "https://registry.npmjs.org/@cli-me/cli/-/cli-0.1.0.tgz") {
        return new Response(tarball, {
          status: 200,
          headers: { "content-length": String(tarball.byteLength) }
        });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new InstallChecksumResolver();
    const [resolved] = await resolver.enrichInstallInstructions("cli-me", [
      makeInstruction({
        package_manager: "npm",
        command: "npm install -g @cli-me/cli"
      })
    ]);

    expect(resolved.checksum).toBe(`sha256:${expected}`);
  });

  it("resolves pip checksums from pypi digests", async () => {
    const digest = "b".repeat(64);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://pypi.org/pypi/httpie/json") {
        return new Response(
          JSON.stringify({
            info: { version: "3.2.2" },
            releases: {
              "3.2.2": [
                {
                  packagetype: "sdist",
                  digests: {
                    sha256: digest
                  }
                }
              ]
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new InstallChecksumResolver();
    const [resolved] = await resolver.enrichInstallInstructions("httpie", [
      makeInstruction({
        package_manager: "pip",
        command: "pip install httpie"
      })
    ]);

    expect(resolved.checksum).toBe(`sha256:${digest}`);
  });

  it("caches checksum resolutions for repeated commands", async () => {
    const digest = "c".repeat(64);
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          urls: {
            stable: {
              checksum: digest
            }
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new InstallChecksumResolver({ cacheTtlSeconds: 3600 });
    const instruction = makeInstruction({
      package_manager: "brew",
      command: "brew install jq"
    });

    const first = await resolver.enrichInstallInstructions("jq", [instruction]);
    const second = await resolver.enrichInstallInstructions("jq", [instruction]);

    expect(first[0].checksum).toBe(`sha256:${digest}`);
    expect(second[0].checksum).toBe(`sha256:${digest}`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves brew aliases via formula index fallback", async () => {
    const digest = "d".repeat(64);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://formulae.brew.sh/api/formula/kubectl.json") {
        return new Response("not found", { status: 404 });
      }
      if (url === "https://formulae.brew.sh/api/formula.json") {
        return new Response(
          JSON.stringify([
            {
              name: "kubernetes-cli",
              aliases: ["kubectl"]
            }
          ]),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      if (url === "https://formulae.brew.sh/api/formula/kubernetes-cli.json") {
        return new Response(
          JSON.stringify({
            ruby_source_checksum: {
              sha256: digest
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new InstallChecksumResolver();
    const [resolved] = await resolver.enrichInstallInstructions("kubectl", [
      makeInstruction({
        package_manager: "brew",
        command: "brew install kubectl"
      })
    ]);

    expect(resolved.checksum).toBe(`sha256:${digest}`);
  });

  it("resolves brew cask old-token aliases via cask index fallback", async () => {
    const digest = "e".repeat(64);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://formulae.brew.sh/api/cask/docker.json") {
        return new Response("not found", { status: 404 });
      }
      if (url === "https://formulae.brew.sh/api/cask.json") {
        return new Response(
          JSON.stringify([
            {
              token: "docker-desktop",
              old_tokens: ["docker"]
            }
          ]),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      if (url === "https://formulae.brew.sh/api/cask/docker-desktop.json") {
        return new Response(
          JSON.stringify({
            sha256: digest
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new InstallChecksumResolver();
    const [resolved] = await resolver.enrichInstallInstructions("docker", [
      makeInstruction({
        package_manager: "brew",
        command: "brew install --cask docker"
      })
    ]);

    expect(resolved.checksum).toBe(`sha256:${digest}`);
  });

  it("resolves tapped brew formula checksums from upstream formula source", async () => {
    const digest = "f".repeat(64);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://formulae.brew.sh/api/formula/auth0.json") {
        return new Response("not found", { status: 404 });
      }
      if (url === "https://formulae.brew.sh/api/formula.json") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url === "https://api.github.com/repos/auth0/homebrew-auth0-cli") {
        return new Response(
          JSON.stringify({
            default_branch: "main"
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      if (url === "https://raw.githubusercontent.com/auth0/homebrew-auth0-cli/main/auth0.rb") {
        return new Response(`class Auth0 < Formula\n  sha256 \"${digest}\"\nend`, {
          status: 200,
          headers: { "content-type": "text/plain" }
        });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new InstallChecksumResolver();
    const [resolved] = await resolver.enrichInstallInstructions("auth0", [
      makeInstruction({
        package_manager: "brew",
        command: "brew install auth0/auth0-cli/auth0"
      })
    ]);

    expect(resolved.checksum).toBe(`sha256:${digest}`);
  });
});
