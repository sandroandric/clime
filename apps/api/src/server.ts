import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

const app = await buildApp();

await app.listen({ port, host });
console.log(`@cli-me/api listening on ${host}:${port}`);
