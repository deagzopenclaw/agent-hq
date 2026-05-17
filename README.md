# Agent HQ

Standalone local dashboard for visualizing Hermes Agent backend state as a pixel-art AI ecosystem city.

## Local run

```bash
npm start
```

Open:

```text
http://127.0.0.1:7777
```

## Environment

- `PORT` — server port. Defaults to `7777` locally; Railway provides this automatically.
- `HOST` — bind host. Defaults to `0.0.0.0`.
- `HERMES_ROOT` — path to a Hermes Agent checkout. Defaults to `/home/deagz/.hermes/hermes-agent`.

## Important deployment note

The UI can deploy to Railway as a Node app, but the **real Hermes state/chat backend requires Hermes Agent and its config/secrets to exist on the deployed machine**. A plain Railway deploy will serve the website, but `/api/hq/state` and `/api/chat` need a working Hermes runtime.

For real live data from your home machine/WSL, a tunnel to the local server is usually better than Railway. For a full Railway backend, install/configure Hermes in the Railway service and set `HERMES_ROOT` plus required provider credentials.
