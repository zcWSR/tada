import { spawn } from "bun";
import type { Action } from "./config";

type ActionResult = {
  ok: boolean;
  error?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
};

export async function runAction(
  actions: Action[],
  name: string,
  payload: Record<string, string>,
): Promise<ActionResult> {
  const action = actions.find((a) => a.name === name);
  if (!action) {
    return { ok: false, error: `Unknown action: ${name}` };
  }

  const { script, command, cwd, timeout = 300 } = action;

  if (!script && !command) {
    return { ok: false, error: `Action "${name}" must have either 'script' or 'command'` };
  }
  if (script && command) {
    return { ok: false, error: `Action "${name}" cannot have both 'script' and 'command'` };
  }

  let cmd: string[];
  if (command) {
    cmd = Array.isArray(command) ? command : ["sh", "-c", command];
  } else {
    cmd = ["sh", script!];
  }

  const proc = spawn({
    cmd,
    cwd,
    env: { ...process.env, PAYLOAD: JSON.stringify(payload) },
    stdout: "pipe",
    stderr: "pipe",
  });

  const timer = setTimeout(() => {
    console.error(`Action "${name}" timed out after ${timeout}s`);
    proc.kill();
  }, timeout * 1000);

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  clearTimeout(timer);

  return { ok: exitCode === 0, exitCode, stdout, stderr };
}
