import { spawn } from "bun";
import { watch } from "fs";

// Port
const port = Number(process.argv[2]) || 3000;

// Config path (can be overridden by environment variable)
const configPath = process.env.AGENT_CONFIG || "./config.json";

// Load config
async function loadConfig(): Promise<any> {
  try {
    const content = await Bun.file(configPath).text();
    return JSON.parse(content);
  } catch (e) {
    console.error("Failed to load config:", e);
    return null;
  }
}

let config: any = await loadConfig();
if (!config) {
  process.exit(1);
}

// Debounce timer to avoid frequent triggers
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

// Watch config file for changes
watch(configPath, { persistent: true }, async (eventType) => {
  if (eventType === "change") {
    // Debounce: delay 100ms before reloading to avoid multiple triggers during file write
    if (reloadTimer) {
      clearTimeout(reloadTimer);
    }
    reloadTimer = setTimeout(async () => {
      console.log(`📝 Config file changed, reloading...`);
      const newConfig = await loadConfig();
      if (newConfig) {
        config = newConfig;
        console.log("✅ Config reloaded successfully");
      } else {
        console.error("❌ Failed to reload config, keeping old config");
      }
      reloadTimer = null;
    }, 100);
  }
});

console.log(`👀 Watching config file: ${configPath}`);

// Execute action
async function runAction(actionName: string, payload: any) {
  const action = config.actions?.[actionName];
  if (!action) {
    return { ok: false, error: `Unknown action: ${actionName}` };
  }

  const { script, cwd, timeout = 300 } = action;

  const proc = spawn({
    cmd: ["sh", script],
    cwd,
    env: {
      ...process.env,
      PAYLOAD: JSON.stringify(payload ?? {})
    },
    stdout: "pipe",
    stderr: "pipe"
  });

  const timer = setTimeout(() => {
    console.error(`Action ${actionName} timed out after ${timeout} seconds`);
    proc.kill()
  }, timeout * 1000);

  // Ensure the process has fully exited before reading stdout/stderr
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  clearTimeout(timer);

  return { ok: exitCode === 0, exitCode, stdout, stderr };
}

// Route handler: GET /hook
async function handleGetHook(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  if (!action) {
    return new Response(`Missing action`, { status: 400 });
  }
  const result = await runAction(action, Object.fromEntries(url.searchParams));
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

// Route handler: POST /hook
async function handlePostHook(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const action = body?.action;
  if (!action) {
    return new Response(`Missing action`, { status: 400 });
  }
  const result = await runAction(action, body);
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

// Start Bun server
Bun.serve({
  port,
  routes: {
    "/hook": {
      GET: handleGetHook,
      POST: handlePostHook
    }
  }
});

console.log(`🚀 Agent running at http://0.0.0.0:${port}`);
console.log('🔍 listening /hook')
