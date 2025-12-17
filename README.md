## TADA!

Tiny HTTP deployment agent on Bun.

```bash
# default port 3000
bun run agent.ts

# with custom port
bun run agent.ts 8080

# with custom config path
AGENT_CONFIG=/path/to/config.json bun run agent.ts
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
    }
  }
}
```

Each action:

- `script`: script to run (required)
- `cwd`: working directory (optional)
- `timeout`: seconds before kill (optional, default 300)

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

### Systemd (optional)

See `agent.example.service` and copy it to your systemd directory, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable tada
sudo systemctl start tada
```

MIT
