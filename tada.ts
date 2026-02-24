import { resolve } from "path";
import { loadConfig, watchConfig, type Config } from "./config";
import { runAction } from "./action";
import {
  initDocker,
  dockerRestart,
  dockerUpdate,
  validateDockerAction,
} from "./docker";

const args = process.argv.slice(2);
const port = Number(
  args.find((a) => a.startsWith("--port="))?.split("=")[1] || 3000,
);
const configPath =
  args.find((a) => a.startsWith("--config="))?.split("=")[1] ||
  resolve(import.meta.dir, "config.toml");

let config: Config;
watchConfig(configPath, async (c) => {
  config = c;
  if (config.docker) {
    config.docker.sock ||= "/var/run/docker.sock";
    await initDocker(config.docker.sock);
  }
});



async function handleAction(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  if (!name) {
    return Response.json({ ok: false, error: "Missing name" }, { status: 400 });
  }

  const payload = Object.fromEntries(url.searchParams);
  delete payload.name;

  const result = await runAction(config.actions ?? [], name, payload);
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

async function handleDocker(req: Request) {
  if (!config.docker) {
    return Response.json(
      { ok: false, error: "Docker not configured" },
      { status: 501 },
    );
  }

  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  const action = url.searchParams.get("action");

  if (!name || !action) {
    return Response.json(
      { ok: false, error: "Missing name or action" },
      { status: 400 },
    );
  }

  const error = validateDockerAction(
    config.docker.containers ?? [],
    name,
    action,
  );
  if (error) {
    return Response.json({ ok: false, error }, { status: 403 });
  }

  const container = config.docker.containers!.find((c) => c.name === name)!;

  let result;
  switch (action) {
    case "restart":
      result = await dockerRestart(name);
      break;
    case "update":
      result = await dockerUpdate(container);
      break;
    default:
      return Response.json(
        { ok: false, error: `Unknown action: ${action}` },
        { status: 400 },
      );
  }

  return Response.json(result, { status: result.ok ? 200 : 500 });
}

function authorize(req: Request): Response | null {
  if (!config.token) return null;
  const header = req.headers.get("authorization");
  if (header === `Bearer ${config.token}`) return null;
  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function withAuth(handler: (req: Request) => Promise<Response>) {
  return (req: Request) => authorize(req) ?? handler(req);
}

Bun.serve({
  port,
  routes: {
    "/": Response.json({ repo: "https://github.com/zcWSR/tada" }),
    "/action": { GET: withAuth(handleAction) },
    "/docker": { GET: withAuth(handleDocker) },
  },
});

console.log(`🚀 TADA! running at http://0.0.0.0:${port}`);
