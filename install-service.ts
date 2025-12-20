#!/usr/bin/env bun

import { $ } from "bun";
import { existsSync } from "fs";
import { resolve } from "path";

// Parse command line arguments
const args = process.argv.slice(2);
const serviceName = args.find(arg => arg.startsWith("--name="))?.split("=")[1] || "tada";
const port = args.find(arg => arg.startsWith("--port="))?.split("=")[1] || "4000";
const user = args.find(arg => arg.startsWith("--user="))?.split("=")[1] || process.env.USER || "root";
const configPath = args.find(arg => arg.startsWith("--config="))?.split("=")[1];
const skipStart = args.includes("--skip-start");

// Get project directory (where this script is located)
const projectDir = import.meta.dir;
const agentTsPath = resolve(projectDir, "agent.ts");

// Check if required files exist
if (!existsSync(agentTsPath)) {
  console.error(`❌ Error: agent.ts not found (${agentTsPath})`);
  process.exit(1);
}

// Find bun executable path
let bunPath: string;
try {
  const bunWhich = await $`which bun`.quiet();
  bunPath = bunWhich.stdout.toString().trim();
  if (!bunPath) {
    throw new Error("bun not found");
  }
} catch {
  // If which fails, try common paths
  const commonPaths = [
    "/usr/local/bin/bun",
    "/usr/bin/bun",
    "/opt/homebrew/bin/bun",
    `${process.env.HOME}/.bun/bin/bun`
  ];
  
  bunPath = commonPaths.find(path => existsSync(path)) || "bun";
  console.log(`⚠️  Warning: Could not auto-detect bun path, using: ${bunPath}`);
}

// Determine config file path
const finalConfigPath = configPath || resolve(projectDir, "config.json");

// Generate systemd service file content
const serviceContent = `[Unit]
Description=TADA! a tiny deploy agent
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${projectDir}
ExecStart=${bunPath} run ${agentTsPath} --port=${port} --config=${finalConfigPath}
Restart=always
RestartSec=5

Environment=NODE_ENV=production

# Security options
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`;

// Display configuration info
console.log("📋 Service configuration:");
console.log(`   Service name: ${serviceName}`);
console.log(`   Port: ${port}`);
console.log(`   User: ${user}`);
console.log(`   Working directory: ${projectDir}`);
console.log(`   Bun path: ${bunPath}`);
console.log(`   Config file: ${finalConfigPath}`);
console.log("");

// Check for sudo permissions
try {
  await $`sudo -n true`.quiet();
} catch {
  console.error("❌ Error: sudo permissions required to install system service");
  console.error("   Please use: sudo bun run install-service.ts");
  process.exit(1);
}

// Write to temporary file
const tempServiceFile = `/tmp/${serviceName}.service`;
await Bun.write(tempServiceFile, serviceContent);

// Copy to system directory
try {
  console.log("📝 Creating system service file...");
  await $`sudo cp ${tempServiceFile} /etc/systemd/system/${serviceName}.service`;
  console.log(`✅ Service file created: /etc/systemd/system/${serviceName}.service`);
} catch (error) {
  console.error("❌ Failed to copy service file:", error);
  process.exit(1);
}

// Reload systemd
try {
  console.log("🔄 Reloading systemd...");
  await $`sudo systemctl daemon-reload`;
  console.log("✅ systemd reloaded");
} catch (error) {
  console.error("❌ Failed to reload systemd:", error);
  process.exit(1);
}

// Enable service (auto-start on boot)
try {
  console.log("🔧 Enabling service (auto-start on boot)...");
  await $`sudo systemctl enable ${serviceName}.service`;
  console.log("✅ Service enabled, will auto-start on boot");
} catch (error) {
  console.error("❌ Failed to enable service:", error);
  process.exit(1);
}

// Start service (unless skip is specified)
if (!skipStart) {
  try {
    console.log("🚀 Starting service...");
    await $`sudo systemctl start ${serviceName}.service`;
    
    // Wait a bit then check status
    await new Promise(resolve => setTimeout(resolve, 500));
    const status = await $`sudo systemctl status ${serviceName}.service --no-pager -l`.quiet();
    console.log("✅ Service started");
    console.log("");
    console.log("📊 Service status:");
    console.log(status.stdout.toString());
  } catch (error) {
    console.error("⚠️  Issue starting service, please check manually:");
    console.error(`   sudo systemctl status ${serviceName}.service`);
  }
} else {
  console.log("⏭️  Skipping service start (--skip-start flag used)");
}

console.log("");
console.log("🎉 Installation complete!");
console.log("");
console.log("📚 Common commands:");
console.log(`   Check status: sudo systemctl status ${serviceName}.service`);
console.log(`   View logs: sudo journalctl -u ${serviceName}.service -f`);
console.log(`   Restart service: sudo systemctl restart ${serviceName}.service`);
console.log(`   Stop service: sudo systemctl stop ${serviceName}.service`);
console.log(`   Disable auto-start: sudo systemctl disable ${serviceName}.service`);

