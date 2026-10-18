import { createServer } from "node:http";
import next from "next";
import { attachRealtime } from "./lib/realtime/server";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();
const http = createServer((req, res) => handle(req, res));
attachRealtime(http);
http.listen(port, () => console.log(`> RMS ready on http://localhost:${port}`));
