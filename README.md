<img src="docs/img/logo.svg" width="64" height="64" alt="A chubby blue pixel art bird">

<h1>Twitter Revival</h1>

A project to make the old Twitter for Android apps work again!

Support for media, quote tweets, link cards, polls, community notes, DMs and more have all been added through patches. This project is in early alpha.

| 2011                                | 2012                                | 2014                                |
| ----------------------------------- | ----------------------------------- | ----------------------------------- |
| ![The 2011 app](docs/img/2011.webp) | ![The 2012 app](docs/img/2012.webp) | ![The 2014 app](docs/img/2014.webp) |

## Quick start

You'll need the server running on a computer your phone can reach, and one of the apps on your phone.

**1. Start the server.** Install [Bun](https://bun.com), then:

```bash
git clone https://github.com/tiagozip/twitter-revival
cd twitter-revival/server
bun install
bun start
```

This server is a proxy for the old Twitter API used by these clients to be able to work with the modern Twitter API, through emusks. It listens on port 7171 and you should leave it running.

**2. Install an app.** Get an APK from the [releases page](https://github.com/tiagozip/twitter-revival/releases) (pick a version you like!) on your phone and open it.

**3. Point it at your server.** The first launch asks for the server address. On home Wi-Fi that is your computer's local IP, like `192.168.1.20:7171`.

**4. Sign in.** Type your X username, and paste your X `auth_token` cookie as the password. [How to find your auth_token](docs/install.md#find-your-auth_token).

That's it. The full walkthrough, with fixes for common problems, is in [docs/install.md](docs/install.md).

## Guides

- [Install on your phone](docs/install.md)
- [Run the server](server/README.md)
- [Build the apps](apps/README.md)
- [How it works](docs/how-it-works.md)

## Things that don't work yet

- Communities show their name and member count, but you can't browse or join them.

- Spaces show a card with the title, host and listener count, and tapping it opens x.com.

- In the 2014 app, polls are created from the "..." menu in the compose screen. The 2011 and 2012 apps have a poll button in the compose toolbar.

---

This is an unofficial fan project and is not affiliated with X Corp.

The code in this repo is licensed under the [AGPLv3](LICENSE). The original Twitter APKs in `apks/` are not covered by it.

**Signing in to X with a third-party app is against X's terms of service** and may get your account banned. This is unlikely, but use at your own risk. Logging in with an alt account is heavily recommended.
