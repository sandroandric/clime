import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOpenApiDocument } from "./openapi.js";

const outputPath = resolve(process.cwd(), "openapi.generated.json");
writeFileSync(outputPath, JSON.stringify(buildOpenApiDocument(), null, 2));
console.log(`OpenAPI written to ${outputPath}`);
