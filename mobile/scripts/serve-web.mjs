import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.env.PORT ?? 8081);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function routeFile(pathname) {
  const clean = decodeURIComponent(pathname).replace(/^\/+/, "");
  const normalized = clean
    ? posix.normalize(clean).replace(/^(\.\.\/)+/, "")
    : "";
  const direct = join(dist, normalized || "index.html");
  if (existsSync(direct) && statSync(direct).isFile()) return direct;

  const html = join(dist, `${normalized}.html`);
  if (existsSync(html)) return html;
  if (!extname(normalized)) return join(dist, "index.html");
  return null;
}

createServer((request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", `http://${request.headers.host}`).pathname;
    const file = routeFile(pathname);
    if (!file) {
      response.writeHead(404, {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Preview server error");
  }
}).listen(port, () => {
  console.log(`Mobile web preview ready at http://localhost:${port}`);
});
