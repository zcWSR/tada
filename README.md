## TADA!

Zero dependency tiny HTTP deployment agent on Bun, with Docker management support.

```bash
# default port 3000
bun run tada.ts

# with custom port
bun run tada.ts --port=8080

# with custom config path
bun run tada.ts --config=/path/to/config.toml

# with custom docker socket
bun run tada.ts --docker-sock=/var/run/docker.sock
```

### Config

`config.toml`:

```toml
# Bearer token for authorization (optional, no auth if omitted)
# token = "your-secret-token"

# Docker configuration (optional, remove this section if not needed)
[docker]
sock = "/var/run/docker.sock"

# Standalone container
[[docker.containers]]
name = "my-nginx"
allow = ["restart", "update"]

# Compose container
[[docker.containers]]
name = "japari-node"
allow = ["restart", "update"]
composeFile = "/opt/japari/docker-compose.yml"
service = "node"  # compose service name (defaults to name if omitted)

# Actions
[[actions]]
name = "deploy"
script = "deploy.sh"
cwd = "/opt/app"
timeout = 300

[[actions]]
name = "restart"
command = ["systemctl", "restart", "myapp"]
cwd = "/opt/app"
timeout = 60

[[actions]]
name = "build"
command = "cd /opt/app && npm install && npm run build"
cwd = "/opt/app"
timeout = 300
```

#### Actions

Each action in the `[[actions]]` array:

- `name`: unique action name (required)
- `script`: script file to run (mutually exclusive with `command`)
- `command`: command to run directly (mutually exclusive with `script`)
  - If string: executed through shell, supports operators like `&&`, `;`, `||`, etc.
  - If array: executed directly with exact arguments
- `cwd`: working directory (optional)
- `timeout`: seconds before kill (optional, default 300)

#### Docker

The `[docker]` section is optional. When present:

- `sock`: Docker socket path (default `/var/run/docker.sock`, can be overridden with `--docker-sock` CLI arg)
- `[[docker.containers]]`: whitelist of containers that can be managed
  - `name`: container name (required)
  - `allow`: list of allowed operations: `restart`, `update` (required)
  - `image`: image name override (optional, auto-detected from container if omitted)
  - `composeFile`: Docker Compose file path (optional, if set uses `docker compose -f` for update)
  - `service`: Compose service name (optional, defaults to `name`)

Operations:

- `restart`: restart the container (works for both standalone and Compose containers via Docker API)
- `update`: pull latest image and restart the container
  - **Compose containers** (with `composeFile` field): runs `docker compose -f <file> pull <service> && docker compose -f <file> up -d <service>`
  - **Standalone containers** (without `composeFile` field): pulls image via Docker API, then stops/removes old container and creates/starts a new one with the same config. Automatically rolls back on failure.

### Config Hot Reload

The config file is watched for changes. When modified, the new config is loaded automatically without restarting the service. If the new config has errors, the old config is kept.

### Authorization

If `token` is set in config, all requests must include the `Authorization` header:

```
Authorization: Bearer your-secret-token
```

Unauthorized requests receive a `401` response. If `token` is not set, no auth is required.

### API

#### `GET /action`

Trigger an action by name.

```bash
curl "http://localhost:3000/action?name=deploy"
curl "http://localhost:3000/action?name=build&branch=main"

# with authorization
curl -H "Authorization: Bearer your-secret-token" "http://localhost:3000/action?name=deploy"
```

All query parameters (except `name`) are passed to the action as the `PAYLOAD` environment variable (JSON stringified).

Response:

```json
{
  "ok": true,
  "exitCode": 0,
  "stdout": "Deployment successful",
  "stderr": ""
}
```

#### `GET /docker`

Trigger a Docker operation on an allowed container.

```bash
curl "http://localhost:3000/docker?name=my-nginx&action=restart"
curl "http://localhost:3000/docker?name=my-nginx&action=update"

# with authorization
curl -H "Authorization: Bearer your-secret-token" "http://localhost:3000/docker?name=japari-node&action=update"
```

Response:

```json
{
  "ok": true,
  "message": "Container \"my-nginx\" updated with image \"nginx:latest\""
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
sudo bun run install-service.ts --name=tada --port=8080 --user=www-data --config=/opt/agent/config.toml

# Install without starting (use --skip-start)
sudo bun run install-service.ts --skip-start
```

Parameters:
- `--name=service-name`: System service name (default: tada)
- `--port=port`: Service listening port (default: 4000)
- `--user=user`: User to run the service (default: current user)
- `--config=path`: Config file path (default: ./config.toml)
- `--skip-start`: Install without starting the service
