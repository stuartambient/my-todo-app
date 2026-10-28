# TodoApp

Android todo app built with Expo SDK 57, React Native, Expo Router, and SQLite. Supports dated lists, optional due times, independent local reminders, repeating todos, search, completed history, and manual backup/restore.

## Development

Install dependencies, then build the development app on a connected phone or emulator:

```powershell
npm.cmd install
npx.cmd expo run:android --device
```

After installing the development build, start Metro for JavaScript work with:

```powershell
npm.cmd start
```

The app uses custom native notification/reminder functionality and needs its own development build. Expo Go is not the target runtime.

## Standalone Android test build

Save a backup, stop Metro, then build and install the release variant:

```powershell
npm.cmd run android:standalone
```

This embeds the production JavaScript bundle and runs without Metro afterward. See [standalone Android testing](docs/standalone-android-testing.md) for signing/data expectations, phone tests, generated APK location, and switching back to development. Store distribution/signing is a separate step.

## Checks

```text
npx tsc --noEmit
npx expo lint
npx jest --preset jest-expo --runInBand --silent --testTimeout=15000
```

SQLite integration checks use Node 24+:

```text
node scripts/verify-database-startup.cjs
node scripts/verify-backup.cjs
node scripts/verify-reminder-restore.cjs
```

Additional implementation and device-test guides are in [docs](docs).
