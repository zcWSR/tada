## TADA!

zero dependency Tiny HTTP deployment agent on Bun.

```bash
# default port 3000
bun run agent.ts

# with custom port
bun run agent.ts --port=8080

# with custom config path
bun run agent.ts --config=/path/to/config.json

# with both custom port and config
bun run agent.ts --port=8080 --config=/path/to/config.json
```

### Config

`config.json`:

```json
{
  "actions": {
    "deploy": {
      "script": "deploy.sh",
      "cwd": "/opt/app",
      "timeout": 300
    },
    "restart": {
      "command": ["systemctl", "restart", "myapp"],
      "cwd": "/opt/app",
      "timeout": 60
    },
    "build": {
      "command": "cd /opt/app && npm install && npm run build",
      "cwd": "/opt/app",
      "timeout": 300
    }
  }
}
```

Each action:

- `script`: script file to run (mutually exclusive with `command`)
- `command`: command to run directly (mutually exclusive with `script`)
  - If string: executed through shell, supports operators like `&&`, `;`, `||`, etc.
  - If array: executed directly with exact arguments
- `cwd`: working directory (optional)
- `timeout`: seconds before kill (optional, default 300)

Note: Each action must have either `script` or `command`, but not both.

Examples:
- Single command: `"command": "npm start"`
- Multiple commands (string): `"command": "cd /opt/app && npm install && npm start"`
- Command with arguments (array): `"command": ["npm", "run", "build", "--production"]`

### API

- `GET /hook?action=deploy&k=v`
- `POST /hook` with JSON body:

```json
{
  "action": "deploy",
  "branch": "main"
}
```

Response:

```json
{
  "ok": true,
  "exitCode": 0,
  "stdout": "Deployment successful",
  "stderr": ""
}
```

### Auto Install Systemd (optional)

Use the install script to automatically create and enable the system service:

```bash
# Use default config (service name: tada, port: 4000)
sudo bun run install-service.ts

# Or use npm script
sudo bun run install-service

# Custom configuration
sudo bun run install-service.ts --name=tada --port=8080 --user=www-data --config=/opt/agent/config.json

# Install without starting (use --skip-start)
sudo bun run install-service.ts --skip-start
```

Parameters:
- `--name=service-name`: System service name (default: tada)
- `--port=port`: Service listening port (default: 4000)
- `--user=user`: User to run the service (default: current user)
- `--config=path`: Config file path (default: ./config.json)
- `--skip-start`: Install without starting the service
