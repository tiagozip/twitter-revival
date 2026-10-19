# Build the apps

The build takes Twitter's original APKs, decodes them, applies the patches in this folder, adds the revival Java code, and signs the result.

## What you need

- JDK 17
- Android SDK build-tools 34.0.0 and platform android-34
- [apktool](https://apktool.org)
- Python 3

On a Mac with [Homebrew](https://brew.sh):

```bash
brew install openjdk@17 apktool python
```

```bash
brew install --cask android-commandlinetools
```

```bash
sdkmanager "build-tools;34.0.0" "platforms;android-34"
```

On Linux, install JDK 17, apktool and Python 3 from your package manager, get the [Android command line tools](https://developer.android.com/studio#command-line-tools-only), run the same `sdkmanager` line, and set `ANDROID_HOME` to the SDK folder.

The build script looks for the SDK in `ANDROID_HOME`, `~/Library/Android/sdk`, Homebrew's location and `~/Android/Sdk`, and for Java in `JAVA_HOME` and the usual JDK 17 locations. It tells you what's missing.

## Build

1. Make sure your APKs are in [`apks/`](../apks/README.md)
2. From the repo root, run:

```bash
./apps/build.sh
```

That builds all three. To build only one:

```bash
./apps/build.sh 2014
```

The APKs are written to `apps/<year>/build/twitter-revival-<year>.apk`. Install one with `adb install`, or copy it to your phone.

## Signing key

The first build makes a signing key in `keys/revival.keystore`. Keep it. Android only installs an update over an existing app when both are signed with the same key, so if you lose it, everyone has to uninstall and reinstall.

## Builds for the emulator

If your server URL is stable and you'd rather skip the first launch prompt, you can set `REVIVAL_SERVER` to bake a server address into the app.

```bash
REVIVAL_SERVER=10.0.2.2:7171 ./apps/build.sh 2014
```

These builds are named `twitter-revival-<year>-dev.apk`.

## Release builds

A plain `./apps/build.sh` is a release build, as long as `REVIVAL_SERVER` isn't set in your shell. The app then asks for the server on first launch. These are the files to upload to a GitHub release.

## Patches

| App  | Package                      | Patches                                                                                                                        |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 2011 | `com.twitter.android.glossy` | rename, hosts, no contacts sync, inline media, rounded text widths, tweet detail extras, 280 character limits, search entities |
| 2012 | `com.twitter.android.fly`    | rename, hosts, modern features                                                                                                 |
| 2014 | `com.twitter.android.holo`   | rename, hosts, media previews, image TLS, modern features                                                                      |
