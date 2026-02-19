import { describe, expect, it } from "vitest";
import { ReportPayloadSchema, WorkflowChainSchema } from "../src/index.js";

describe("shared schemas", () => {
  it("validates workflow chains with ordered steps", () => {
    const parsed = WorkflowChainSchema.parse({
      id: "wf_1",
      slug: "full-stack-saas",
      title: "Full Stack SaaS",
      description: "Deploy and configure a SaaS stack",
      tags: ["deploy", "payments"],
      estimated_minutes: 25,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      steps: [
        {
          step_number: 1,
          cli_slug: "vercel",
          purpose: "Deploy app",
          command_ids: ["vercel-deploy"],
          auth_prerequisite: true
        }
      ]
    });

    expect(parsed.slug).toBe("full-stack-saas");
  });

  it("requires workflow_id or command_id in report payload", () => {
    const result = ReportPayloadSchema.safeParse({
      status: "success",
      cli_slug: "vercel",
      cli_version: "1.0.0",
      duration_ms: 1200,
      exit_code: 0,
      agent_name: "codex",
      agent_version: "1.0",
      os: "linux",
      arch: "x64",
      request_id: "req_1",
      timestamp: new Date().toISOString()
    });

    expect(result.success).toBe(false);
  });
});
