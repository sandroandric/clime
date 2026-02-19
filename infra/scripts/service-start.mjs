#!/usr/bin/env node
import { spawn } from "node:child_process";

const role = (process.env.CLIME_SERVICE_ROLE ?? "").trim().toLowerCase();

const roleToCommand = {
  api: ["npm", ["run", "start:api"]],
  web: ["npm", ["run", "start:web"]],
  workers: ["npm", ["run", "start:workers"]]
};

if (!role || !(role in roleToCommand)) {
  console.error("CLIME_SERVICE_ROLE must be set to one of: api, web, workers.");
  process.exit(1);
}

const [cmd, args] = roleToCommand[role];
const child = spawn(cmd, args, {
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
