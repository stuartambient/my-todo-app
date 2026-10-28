# Standalone Android testing

This installs the Android **release variant** of TodoApp with the production JavaScript/Hermes bundle inside the APK. The installed app opens directly and runs without Metro, Expo Go, a USB cable, or a connection to the development computer.

This is a local test build, using the existing native project's signing configuration. Expo SDK 57's generated template signs both debug and release with the local test keystore by default. A Play Store build and its private production/upload signing key are a later distribution step; this command does not configure or upload a store release.

## Build and install on the phone

1. In TodoApp, save a fresh backup to your chosen folder. Keep the file available outside app storage.
2. Stop Metro with **Ctrl+C**. Keep the phone connected, unlocked, and listed by `adb devices`.
3. From the project folder in VS Code's PowerShell terminal:

```powershell
git pull
npm.cmd run android:standalone
```

Select the physical phone if the command lists multiple devices. The script runs:

```text
expo run:android --variant release --device --no-bundler
```

SDK 57's CLI generates a production bundle for release variants, compiles and installs the APK, and launches the app. `--no-bundler` prevents starting the persistent Metro development server. Metro's bundling output **during the build** is expected: it is producing the bundled asset, not a server the installed app needs afterward.

The package stays `com.sambi.todoapp`. With the existing default debug/release signing configuration and the same local keystore, this updates the installed development app and preserves its private SQLite data. Keep the existing generated Android project/keystore. If Android reports an incompatible signing certificate, stop and inspect that error rather than uninstalling the app to bypass it.

Open TodoApp once after installation so startup can reconcile reminders and initialize the current background-task runtime. Then unplug USB and close the terminal. Close/reopen TodoApp from its phone icon to confirm it starts independently. The terminal should return to a prompt; there is no Metro session to keep running.

The generated APK is normally at:

```text
android/app/build/outputs/apk/release/app-release.apk
```

The installable artifact is produced on the computer performing the native build. A JavaScript export by itself is not an APK. Android Studio/SDK, ADB, and the working Java 17 setup from development are still needed to build it locally.

## Device checks

Use the phone normally with the computer disconnected. Record a todo subject, action, and approximate time if something behaves unexpectedly.

- **Startup and data:** existing open/completed todos remain; create an undated todo and a dated/timed one, close/reopen the app, and verify their contents.
- **Editing and draft protection:** save edits, keep a draft after Back, discard a draft, and check search by subject and notes.
- **Background reminders:** schedule a few minutes ahead, put TodoApp in the background and lock the phone; confirm the alert appears and opens the correct todo.
- **Complete and Snooze:** test both from a notification card while the app is backgrounded. Complete removes the card and pending alarm; Snooze removes the old card and alerts again about ten minutes later.
- **Repeats:** complete one test repeating occurrence, verify exactly one next occurrence, and check its due date/time and reminder. Reopening/recompleting must not duplicate the successor.
- **Notification recovery:** let a fresh reminder appear, swipe it away, preview and restore it; verify a silent card returns with actions. Existing cards and completed/changed reminders must be excluded.
- **Phone restart:** schedule a future reminder, restart the phone, open TodoApp once, and verify the future reminder still works. Do not use Android force-stop as a substitute for ordinary backgrounding: force-stop suppresses scheduled alarms until the app runs again.
- **Backup/restore:** save to the remembered folder, preview the JSON, restore the same backup and verify no duplicates. Recover one deliberately deleted test todo. Test external storage providers according to their own connectivity requirements; a cloud folder may still need internet.

## Making later changes

A standalone build uses the code embedded at build time. `git pull`, Metro reload, and Fast Refresh do not change that installed bundle. Re-run `npm.cmd run android:standalone` after pulling changes you want to test in standalone mode.

To return to the development build:

```powershell
npx.cmd expo run:android --device
```

This reinstalls the debug/development variant using the current local signing configuration and starts Metro. Thereafter, normal JavaScript development uses `npm.cmd start`; native module changes require another development rebuild. Do not expect a release app to connect when Metro says “no apps connected”.

## Verification performed in the shared workspace

The script's flags and release bundle behavior were checked against the installed Expo 57 CLI. Its template signing configuration was inspected. TypeScript, Expo lint, and a production Android JavaScript export are checked here. Native APK compilation, install/signature compatibility with the existing phone app, and device behavior must be verified by the Windows build and the checks above; no APK is generated in the shared workspace.
