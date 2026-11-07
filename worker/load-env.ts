// Carrega .env quando o worker roda fora do Docker (o Next.js faz isso sozinho para o app web).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const file = path.resolve(process.cwd(), ".env");
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]!] !== undefined) continue;
    process.env[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1");
  }
}
