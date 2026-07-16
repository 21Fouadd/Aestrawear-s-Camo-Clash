import { createServer, type IncomingMessage, type Server as HttpServer } from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { FIXED_STEP } from "../../lib/game-core.ts";
import {
  MAX_CLIENT_MESSAGE_BYTES,
  WS_SUBPROTOCOL,
  parseJsonMessage,
  readInitialMessage,
} from "./protocol.ts";
import { RoomManager } from "./room-manager.ts";
import { originAllowed, readAllowedOrigins } from "./security.ts";

type GameServerOptions = {
  host?: string;
  port?: number;
  allowedOrigins?: string[];
  matchTicketSecret?: string;
  logLevel?: "silent" | "info";
};

type GameServerHandle = {
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
};

type RateBucket = { startedAt: number; count: number };

function clientIp(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",", 1)[0].trim().slice(0, 64);
  return request.socket.remoteAddress?.slice(0, 64) || "unknown";
}

function rejectUpgrade(socket: import("node:stream").Duplex, status: number, message: string): void {
  const safe = message.replace(/[\r\n]/g, " ").slice(0, 120);
  socket.write(`HTTP/1.1 ${status} ${safe}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export async function startGameServer(options: GameServerOptions = {}): Promise<GameServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3002;
  const logLevel = options.logLevel ?? "info";
  const matchTicketSecret = options.matchTicketSecret ?? "development-only-match-ticket-secret-change-me";
  if (matchTicketSecret.length < 32) throw new Error("MATCH_TICKET_SECRET must be at least 32 characters");
  const allowedOrigins = new Set(options.allowedOrigins ?? ["http://localhost:3000"]);
  const manager = new RoomManager(matchTicketSecret);
  const startedAt = Date.now();
  const rateBuckets = new Map<string, RateBucket>();
  const webSockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_CLIENT_MESSAGE_BYTES,
    perMessageDeflate: {
      clientNoContextTakeover: true,
      serverNoContextTakeover: true,
      threshold: 1_024,
      concurrencyLimit: 4,
    },
    handleProtocols: (protocols) => protocols.has(WS_SUBPROTOCOL) ? WS_SUBPROTOCOL : false,
  });

  const httpServer: HttpServer = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && url.pathname === "/healthz") {
      const stats = manager.getStats();
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(JSON.stringify({ ok: true, region: process.env.OCI_REGION || "me-jeddah-1", uptime: Math.floor((Date.now() - startedAt) / 1000), ...stats }));
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" });
    response.end("Not found");
  });

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname !== "/v2") { rejectUpgrade(socket, 404, "Not Found"); return; }
    if (!originAllowed(request.headers.origin, allowedOrigins)) { rejectUpgrade(socket, 403, "Forbidden"); return; }
    const protocols = String(request.headers["sec-websocket-protocol"] ?? "").split(",").map((value) => value.trim());
    if (!protocols.includes(WS_SUBPROTOCOL)) { rejectUpgrade(socket, 426, "Subprotocol Required"); return; }

    const ip = clientIp(request);
    const now = Date.now();
    const bucket = rateBuckets.get(ip);
    if (!bucket || now - bucket.startedAt >= 60_000) rateBuckets.set(ip, { startedAt: now, count: 1 });
    else {
      bucket.count += 1;
      if (bucket.count > 30) { rejectUpgrade(socket, 429, "Too Many Requests"); return; }
    }

    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      const authTimer = setTimeout(() => webSocket.close(1008, "Authentication timed out"), 5_000);
      webSocket.once("message", (raw, isBinary) => {
        clearTimeout(authTimer);
        if (isBinary) { webSocket.close(1003, "Text messages required"); return; }
        const parsed = parseJsonMessage(raw);
        const initial = parsed ? readInitialMessage(parsed) : null;
        if (!initial) { webSocket.close(1008, "Invalid handshake"); return; }
        manager.accept(webSocket, ip, initial);
      });
      webSocket.once("close", () => clearTimeout(authTimer));
    });
  });

  let accumulator = 0;
  let previous = performance.now();
  const simulationTimer = setInterval(() => {
    const now = performance.now();
    accumulator = Math.min(0.12, accumulator + Math.max(0, (now - previous) / 1000));
    previous = now;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 6) {
      manager.tick(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
  }, 5);
  simulationTimer.unref();
  const heartbeatTimer = setInterval(() => manager.heartbeat(), 2_000);
  heartbeatTimer.unref();
  const cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - 120_000;
    for (const [ip, bucket] of rateBuckets) if (bucket.startedAt < cutoff) rateBuckets.delete(ip);
  }, 60_000);
  cleanupTimer.unref();

  await new Promise<void>((resolve, reject) => {
    const onError = (cause: Error) => { httpServer.off("listening", onListening); reject(cause); };
    const onListening = () => { httpServer.off("error", onError); resolve(); };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(port, host);
  });

  const address = httpServer.address();
  const boundPort = typeof address === "object" && address ? address.port : port;
  if (logLevel === "info") console.log(`Camo Clash authoritative server listening on ${host}:${boundPort}`);

  let closing = false;
  return {
    host,
    port: boundPort,
    url: `ws://${host}:${boundPort}/v2`,
    async close() {
      if (closing) return;
      closing = true;
      clearInterval(simulationTimer);
      clearInterval(heartbeatTimer);
      clearInterval(cleanupTimer);
      manager.shutdown();
      webSockets.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

function readProductionOptions(): GameServerOptions {
  const port = Number(process.env.PORT ?? 3002);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port");
  const origins = readAllowedOrigins(process.env.ALLOWED_ORIGINS);
  if (origins.size === 0) throw new Error("ALLOWED_ORIGINS must contain at least one HTTPS origin");
  const secret = process.env.MATCH_TICKET_SECRET;
  if (!secret || secret.length < 32) throw new Error("MATCH_TICKET_SECRET must contain at least 32 characters");
  return {
    host: process.env.HOST || "127.0.0.1",
    port,
    allowedOrigins: [...origins],
    matchTicketSecret: secret,
    logLevel: process.env.LOG_LEVEL === "silent" ? "silent" : "info",
  };
}

function readDevelopmentOptions(): GameServerOptions {
  const port = Number(process.env.PORT ?? 3002);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port");
  const configuredOrigins = readAllowedOrigins(process.env.ALLOWED_ORIGINS);
  return {
    host: process.env.HOST || "127.0.0.1",
    port,
    allowedOrigins: configuredOrigins.size > 0 ? [...configuredOrigins] : ["http://localhost:3000"],
    matchTicketSecret: process.env.MATCH_TICKET_SECRET || "development-only-match-ticket-secret-change-me",
    logLevel: process.env.LOG_LEVEL === "silent" ? "silent" : "info",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const handle = await startGameServer(process.env.NODE_ENV === "production" ? readProductionOptions() : readDevelopmentOptions());
  const stop = async () => { await handle.close(); process.exit(0); };
  process.once("SIGINT", () => { void stop(); });
  process.once("SIGTERM", () => { void stop(); });
}

export type { GameServerHandle, GameServerOptions };
export type { WebSocket };
