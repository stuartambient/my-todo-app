# Developing TodoApp on Android

Use the installed TodoApp development build for this project. It contains the
native notification modules used by saved reminders. Expo Go has separate data
and is not the runtime used to verify this app.

## Apply the development client update once

Stop Metro with Ctrl+C. Keep the Android emulator running. In PowerShell, from
the project folder:

```powershell
git pull
npm.cmd ci
npx.cmd expo prebuild --platform android
npx.cmd expo run:android
```

Prebuild applies the development-client config plugin to the existing generated
Android project, including its launcher URL scheme. The build installs over
TodoApp using the existing package name, `com.sambi.todoapp`. Keep the existing
signing setup; no uninstall or app-data reset is needed.

Gradle requires JDK 17 for this project's tested build setup. Verify
`$env:JAVA_HOME` and `.\android\gradlew.bat --version` if a new terminal reports
another Java version. A user-level JAVA_HOME change requires restarting VS Code.

## Normal development after that build

In PowerShell:

```powershell
npm.cmd start
```

In Git Bash:

```sh
npm start
```

Both start Metro with `--dev-client`. The terminal should say it is using a
development build. Press **a** to open TodoApp on the emulator. Leave this
terminal running; Fast Refresh applies most source edits automatically, and
**r** reloads manually. Do not switch the launch target to Expo Go with **s**.

`npx.cmd expo start` also selects the development build automatically while
expo-dev-client is installed. `npm.cmd start` makes that choice explicit.

Only rebuild with `npx.cmd expo run:android` after native dependencies change.
After changing config plugins or native app configuration, first run
`npx.cmd expo prebuild --platform android` to apply the configuration.
A new app build still requires Metro during development; this is not a
standalone release build.

## Verify startup

After installing this update, stop and restart Metro with `npm.cmd start`,
press **a**, and confirm TodoApp opens. In another PowerShell terminal:

```powershell
adb shell dumpsys activity activities |
    Select-String 'mResumedActivity|topResumedActivity'
```

The active package should be `com.sambi.todoapp`, not `host.exp.exponent`.
Create a todo with a reminder a few minutes ahead and confirm delivery.

References:
- https://docs.expo.dev/versions/v57.0.0/sdk/dev-client/
- https://docs.expo.dev/more/expo-cli/
