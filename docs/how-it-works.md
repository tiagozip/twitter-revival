# How it works

## Getting requests to your server

Each app has Twitter's hostnames written into its code. The `01-hosts.sh` patch replaces them with `http://127.0.0.1:<port>`, a different port per app. Inside the app, `revival.LocalProxy` listens on that port and forwards every request to the server address you entered on first launch. This is why you can change the server from the menu without rebuilding: the hostnames in the old code never change, only where the proxy sends them.

The proxy adds two headers. `X-Revival-Client` says which app is asking, since the 2011 and 2012 apps both speak API v1 but expect slightly different answers. `X-Revival-Base` tells the server how the app reaches it, so image and media links in the answers point back through the proxy.

## Signing in

The old apps sign in with xAuth, which sends a username and password. The server ignores the username and treats the password as an X `auth_token`. It logs in to X with it, encrypts the token with AES-256-GCM under a key only the server knows, and returns the encrypted blob as the OAuth token. The app sends that blob on every request, and the server decrypts it to know whose account to use. The server never writes the token to disk.

## Translating the API

The server answers each old endpoint by calling X through [emusks](https://www.npmjs.com/package/emusks), then reshapes the result. `server/src/map.js` turns X's GraphQL tweets and users into the old format: string and number ids, the 2011 date format, entities with old style indices. The 2011 app wants plain JSON arrays, the 2012 app wants some 2012 only endpoints like activity and discovery, and the 2014 app wants API v1.1 timelines with `entity_id` blocks. Each has its own handler file.

## Showing things the old apps never had

Photo grids, video, polls, quote tweets, link cards, community notes, Spaces and communities didn't exist in 2011, so the old apps have no fields for them. The server adds one invisible character, U+2060, to the end of each tweet's text and gives it a URL entity pointing at `/m/<base64 JSON>`. The JSON holds whatever the tweet has:

| Key | What           |
| --- | -------------- |
| `p` | photos         |
| `v` | video or GIF   |
| `k` | link card      |
| `o` | poll           |
| `q` | quoted tweet   |
| `n` | community note |
| `s` | Space          |
| `y` | community      |

The old apps store entities as they are, so the payload survives their local databases. The shared Java code in `apps/common/java/revival` finds that entity when a tweet is drawn and renders the extra blocks under the text: `InlineMedia` in timelines, `Detail` on the tweet screen, `Extras` for the drawing itself, and `MediaActivity` as a full screen photo viewer and video player.

## Posting new things from old apps

| Feature                 | How                                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Photos                  | The 2011 and 2012 apps upload through twitpic or yfrog. The server answers those uploads itself and keeps the media id for the next tweet. The 2014 app uses its own `update_with_media`.          |
| Photo picker and camera | The old apps ask Android for files in ways modern Android refuses. `PickActivity` and `CaptureActivity` sit in between, use the modern picker and camera, and hand the old app a file it can read. |
| Quotes                  | The old Quote button fills the box with `"@user: text"`. The server matches that against tweets it has shown you and posts a real quote tweet.                                                     |
| Polls                   | The poll button opens `PollDialog`, which writes a short block like `📊 Poll (1 day)` with `○` choices at the end of the tweet. The server turns that into a real X poll.                          |
| Votes                   | Tapping a poll choice calls `/revival/vote`.                                                                                                                                                       |

## Making 2011 code run on Android 15

`patchlib.py modernize` raises the target SDK to 28, up from 7 in the 2011 app, and fixes what that breaks: it registers the revival activities and providers, reroutes the photo picker and camera, and replaces old storage paths. `safe-calls` wraps calls that crash on modern Android. `px-to-dp` converts sizes the old layouts gave in pixels. Each app also gets its own package name, so all three install next to each other and next to the X app.
