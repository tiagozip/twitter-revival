# Revival server

These old clients were written for Twitter's 2011 to 2014 APIs, which are obviously dead.

This server answers those old API calls by making the matching requests to today's X with your account, then rewrites the answers into the shape each app expects.

## Run it

You need [Bun](https://bun.sh) 1.1 or newer.

```bash
cd server
bun install
bun start
```

You should see `server listening http://0.0.0.0:7171`. Check it from another terminal:

```bash
curl http://localhost:7171/revival/health
```

## Settings

**All of these are optional**, and the server runs perfectly fine without them. To change something, rename `.env.example` to `.env` and fill in only what you need.

| Variable | | What it does |
| --- | --- | --- |
| `PORT` | Optional | Port to listen on. Defaults to 7171. |
| `EMUSKS_TOKEN` | Optional | An X `auth_token` for the server owner. Public reads like the 2011 search tab use it when nobody is signed in. Without it, those reads are refused. |
| `REVIVAL_PASSWORD` | Optional | Lets you sign in to the apps with this password instead of pasting a token. Only works when `EMUSKS_TOKEN` is set, and it signs you in as the owner. Without it, everyone signs in with their own token. |
| `REVIVAL_SECRET` | Optional | Key used to seal session tokens. Without it, the server makes a random one in `server/.secret` on first start and reuses it after. |

Changing or deleting the secret signs everyone out.

## Reach it from outside your home

On your home Wi-Fi the phone can use the computer's local IP. To use the apps anywhere, put the server behind HTTPS.

The quickest way is a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

You can make a **temporary** tunnel like this:

```bash
cloudflared tunnel --url http://localhost:7171
```

Use the `https://….trycloudflare.com` address in the app. QuickTunnels' addresses change every time you restart the tunnel, so for daily use set up a named tunnel on your own domain, or use any reverse proxy you like, such as Caddy or nginx.
