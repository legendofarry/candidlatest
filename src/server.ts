import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Polyfill __dirname and __filename for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
globalThis.__dirname = __dirname;
globalThis.__filename = __filename;

import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

function allowedOwnerOrigin(origin: string | null) {
  if (!origin) return null;
  const allowed = (process.env["OWNER_APP_ORIGIN"] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function withOwnerCors(request: Request, response: Response) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/public/owner/")) return response;

  const origin = allowedOwnerOrigin(request.headers.get("origin"));
  if (!origin) return response;

  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, x-owner-key");
  headers.set("access-control-max-age", "600");
  headers.append("vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      if (
        request.method === "OPTIONS" &&
        new URL(request.url).pathname.startsWith("/api/public/owner/")
      ) {
        return withOwnerCors(request, new Response(null, { status: 204 }));
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withOwnerCors(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return withOwnerCors(
        request,
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
