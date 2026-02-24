import { spawn } from "bun";
import type { Container } from "./config";

let dockerSock: string;

type DockerResult = {
  ok: boolean;
  message: string;
};

function dockerFetch(path: string, options?: RequestInit) {
  return fetch(`http://localhost${path}`, { ...options, unix: dockerSock } as any);
}

export async function initDocker(sock: string): Promise<void> {
  dockerSock = sock;
  try {
    const res = await dockerFetch("/info");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = (await res.json()) as { ServerVersion: string };
    console.log(`🐳 Docker connected (v${info.ServerVersion}) via ${sock}`);
  } catch (e) {
    console.warn(`⚠️  Docker connection failed (${sock}):`, e);
  }
}

export async function dockerRestart(name: string): Promise<DockerResult> {
  const res = await dockerFetch(`/containers/${name}/restart`, { method: "POST" });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, message: `Restart failed (HTTP ${res.status}): ${body}` };
  }
  return { ok: true, message: `Container "${name}" restarted` };
}

export async function dockerUpdate(container: Container): Promise<DockerResult> {
  const { name } = container;

  if (container.composeFile) {
    return composeUpdate(container);
  }
  return standaloneUpdate(container);
}

async function composeUpdate(container: Container): Promise<DockerResult> {
  const { name, composeFile } = container;
  const service = container.service || name;
  const f = `-f ${composeFile}`;

  const cmd = `docker compose ${f} pull ${service} && docker compose ${f} up -d ${service}`;
  const proc = spawn({
    cmd: ["sh", "-c", cmd],
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  if (exitCode !== 0) {
    return { ok: false, message: `Compose update failed: ${stderr || stdout}` };
  }
  return { ok: true, message: `Container "${name}" updated via compose` };
}

async function standaloneUpdate(container: Container): Promise<DockerResult> {
  const { name } = container;

  // 1. Inspect
  let info: any;
  try {
    const res = await dockerFetch(`/containers/${name}/json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    info = await res.json();
  } catch {
    return { ok: false, message: `Container "${name}" not found` };
  }

  const image = container.image || info.Config?.Image;
  if (!image) {
    return { ok: false, message: `Cannot determine image for container "${name}"` };
  }

  // 2. Pull
  const [fromImage, tag] = splitImage(image);
  const pullRes = await dockerFetch(
    `/images/create?fromImage=${encodeURIComponent(fromImage)}&tag=${encodeURIComponent(tag)}`,
    { method: "POST" },
  );
  if (!pullRes.ok) {
    const body = await pullRes.text();
    return { ok: false, message: `Pull failed (HTTP ${pullRes.status}): ${body}` };
  }
  await pullRes.text();

  // 3. Stop
  await dockerFetch(`/containers/${name}/stop`, { method: "POST" });

  // 4. Rename as backup
  const backupName = `${name}-old`;
  const renameRes = await dockerFetch(
    `/containers/${name}/rename?name=${encodeURIComponent(backupName)}`,
    { method: "POST" },
  );
  if (!renameRes.ok) {
    await dockerFetch(`/containers/${name}/start`, { method: "POST" });
    return { ok: false, message: `Failed to rename old container` };
  }

  // 5. Create new container
  const createBody = {
    ...info.Config,
    Image: image,
    HostConfig: info.HostConfig,
    NetworkingConfig: info.NetworkingConfig,
  };
  const createRes = await dockerFetch(
    `/containers/create?name=${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    },
  );
  if (!createRes.ok) {
    await dockerFetch(
      `/containers/${backupName}/rename?name=${encodeURIComponent(name)}`,
      { method: "POST" },
    );
    await dockerFetch(`/containers/${name}/start`, { method: "POST" });
    const body = await createRes.text();
    return { ok: false, message: `Failed to create new container: ${body}` };
  }

  // 6. Start new container
  const startRes = await dockerFetch(`/containers/${name}/start`, { method: "POST" });
  if (!startRes.ok) {
    await dockerFetch(`/containers/${name}`, { method: "DELETE" });
    await dockerFetch(
      `/containers/${backupName}/rename?name=${encodeURIComponent(name)}`,
      { method: "POST" },
    );
    await dockerFetch(`/containers/${name}/start`, { method: "POST" });
    return { ok: false, message: `Failed to start new container, rolled back` };
  }

  // 7. Remove backup
  await dockerFetch(`/containers/${backupName}?force=true`, { method: "DELETE" });

  return { ok: true, message: `Container "${name}" updated with image "${image}"` };
}

export function validateDockerAction(
  containers: Container[],
  name: string,
  action: string,
): string | null {
  const container = containers.find((c) => c.name === name);
  if (!container) return `Container "${name}" is not in the allowed list`;
  if (!container.allow.includes(action)) {
    return `Action "${action}" is not allowed for container "${name}" (allowed: ${container.allow.join(", ")})`;
  }
  return null;
}

function splitImage(image: string): [string, string] {
  const lastColon = image.lastIndexOf(":");
  if (lastColon === -1 || image.includes("/", lastColon)) {
    return [image, "latest"];
  }
  return [image.slice(0, lastColon), image.slice(lastColon + 1)];
}
