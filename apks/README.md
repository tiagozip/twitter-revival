# Twitter's original APKs

These are needed for patching and builds. For convenience, I've included them in this repo, but you should make sure they match the hashes below.

| File                | Version              | Version code | SHA-256                                                            |
| ------------------- | -------------------- | ------------ | ------------------------------------------------------------------ |
| `twitter-2.0.1.apk` | 2.0.1, February 2011 | 122          | `f7bfedcb84aae3aeeeae3287c0f33fd5db017d2e0fd3e15d891b546ec28f2e8a` |
| `twitter-3.3.0.apk` | 3.3.0, July 2012     | 168          | `27c6dba622a725d51efc2cd6893c3aacf40266330febef23292fe4097dec872d` |
| `twitter-4.1.9.apk` | 4.1.9, October 2013  | 1000438      | `d6c06eb12cff4e7f8710d3284a278f1e40ef2c4202fcc05c01adb2df733d1658` |

## Source

- 2.0.1: [archive.org/download/com-twitter-android-2-0-1-20260728/Twitter.apk](https://archive.org/download/com-twitter-android-2-0-1-20260728/Twitter.apk)
- 3.3.0: [archive.org/download/com.twitter.android_3.3.0_2026-03-27/Twitter.apk](https://archive.org/download/com.twitter.android_3.3.0_2026-03-27/Twitter.apk)
- 4.1.9: search APK archives for Twitter 4.1.9 with version code 1000438.

```bash
curl -L -o apks/twitter-2.0.1.apk https://archive.org/download/com-twitter-android-2-0-1-20260728/Twitter.apk
```

```bash
curl -L -o apks/twitter-3.3.0.apk https://archive.org/download/com.twitter.android_3.3.0_2026-03-27/Twitter.apk
```

## Checking the hashes

```bash
shasum -a 256 apks/*.apk
```
