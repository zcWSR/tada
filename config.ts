import { readFileSync, watch } from "fs";

export type Action = {
  name: string;
  script?: string;
  command?: string | string[];
  cwd?: string;
  timeout?: number;
};

export type Container = {
  name: string;
  allow: string[];
  image?: string;
  composeFile?: string;
  service?: string;
};

export type Config = {
  token?: string;
  actions?: Action[];
  docker?: {
    sock?: string;
    containers?: Container[];
  };
};

export function loadConfig(path: string): Config {
  const content = readFileSync(path, "utf-8");
  return Bun.TOML.parse(content) as Config;
}

export function watchConfig(
  path: string,
  onChange: (config: Config) => void,
): void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  watch(path, { persistent: true }, (eventType) => {
    if (eventType !== "change") return;
    if (timer) clearTimeout(timer);

    timer = setTimeout(() => {
      console.log("📝 Config file changed, reloading...");
      try {
        const config = loadConfig(path);
        onChange(config);
        console.log("✅ Config reloaded");
      } catch (e) {
        console.error("❌ Failed to reload config, keeping old config:", e);
      }
      timer = null;
    }, 100);
  });

  try {
    const config = loadConfig(path);
    onChange(config);
    console.log(`👀 Loaded and watching config: ${path}`);
  } catch (e) {
    console.error("❌ Failed to load config:", e);
    process.exit(1);
  }
}
