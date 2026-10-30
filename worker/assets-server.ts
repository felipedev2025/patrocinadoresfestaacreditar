import http from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

/**
 * Servidor HTTP efêmero (127.0.0.1, porta aleatória) que expõe ao Chrome do Remotion
 * apenas os arquivos baixados para o diretório temporário do job.
 */
export async function serveDirectory(dir: string) {
  const root = path.resolve(dir);
  const server = http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname).replace(/^\/+/, "");
      const full = path.resolve(root, rel);
      if (!full.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      await fs.access(full);
      const type = full.endsWith(".png") ? "image/png" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
      createReadStream(full).pipe(res);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: (file: string) => `http://127.0.0.1:${port}/${encodeURIComponent(file)}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
