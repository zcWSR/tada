import { spawn } from "bun";
import { watch } from "fs";

// 端口
const port = Number(process.argv[2]) || 3000;

// 配置路径（可以用环境变量覆盖）
const configPath = process.env.AGENT_CONFIG || "./config.json";

// 加载配置
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

// 防抖定时器，避免频繁触发
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

// 监听配置文件变更
watch(configPath, { persistent: true }, async (eventType) => {
  if (eventType === "change") {
    // 防抖：延迟 100ms 后重新加载，避免文件写入过程中的多次触发
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

// 工具：执行 action
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

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  clearTimeout(timer);

  return { ok: exitCode === 0, exitCode, stdout, stderr };
}

// 路由处理：GET /hook
async function handleGetHook(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  if (!action) {
    return new Response(`Missing action`, { status: 400 });
  }
  const result = await runAction(action, Object.fromEntries(url.searchParams));
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

// 路由处理：POST /hook
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

// Bun serve 启动
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
