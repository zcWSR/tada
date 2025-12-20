import { spawn } from "bun";
import { watch } from "fs";
import { resolve } from "path";

// Parse command line arguments
const args = process.argv.slice(2);
const port = Number(args.find(arg => arg.startsWith("--port="))?.split("=")[1] || 3000);
const configPath = args.find(arg => arg.startsWith("--config="))?.split("=")[1] || resolve(import.meta.dir, "config.json");

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

  const { script, command, cwd, timeout = 300 } = action;

  // Validate: must have either script or command, but not both
  if (!script && !command) {
    return { ok: false, error: `Action ${actionName} must have either 'script' or 'command'` };
  }
  if (script && command) {
    return { ok: false, error: `Action ${actionName} cannot have both 'script' and 'command'` };
  }

  // Determine command to execute
  let cmd: string[];
  if (command) {
    if (Array.isArray(command)) {
      // If command is an array, execute directly
      cmd = command;
    } else {
      // If command is a string, execute through shell to support operators like &&, ;, etc.
      cmd = ["sh", "-c", command];
    }
  } else {
    // Default to script execution
    cmd = ["sh", script];
  }

  const proc = spawn({
    cmd,
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
