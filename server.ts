import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import next from "next";
import { attachRealtime } from "./lib/realtime/server";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0"; // all interfaces: reachable from phones/tablets on the LAN
const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();
const http = createServer((req, res) => handle(req, res));
attachRealtime(http);
http.listen(port, host, () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i!.address}:${port}`);
  console.log(`> RMS ready (${dev ? "dev" : "production"})`);
  console.log(`  This laptop:   http://localhost:${port}`);
  lan.forEach((u) => console.log(`  Other devices: ${u}`));
});
