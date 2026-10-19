# Test one Android notification

From your project folder after pulling this update:

```sh
npm install
npx expo start
```

Open TodoApp on your Android phone. Tap **Test notification** below the
Open/Completed tabs and allow notification permission if prompted. A test
reminder should appear after about five seconds, including while the app is
open. Repeat with the app in the background by tapping the button and then
pressing the phone's Home button. Android power settings can delay delivery.

If permission or the test notification category is disabled, the button offers
**Open Settings**. Allow notifications, return to the app, and tap the test
button again. When using Expo Go, the permission and notification settings
belong to Expo Go rather than a separately installed TodoApp.

This uses a local notification, so no push server, push token, FCM credentials,
or Expo account setup is needed. Local notifications are supported in Expo Go
on Android; remote push notifications require a development build. If you use
your own development build, rebuild it once after adding this native module
and its config plugin, for example with `npx expo run:android`.

The notification dependency is aligned to Expo SDK 57 (`~57.0.23`).
This test does not read, update, or schedule reminders for saved todos.

The local-notification adapter intentionally avoids the package's main entry
point: that entry eagerly loads a remote-topic native module omitted from
some Expo Go builds. Recheck the adapter's internal build paths on SDK upgrades.
If Metro still shows the old import failure after pulling, stop it and restart
with `npx expo start --clear`.

Checks for this change:

```sh
npx tsc --noEmit
npx expo lint
npx jest --preset jest-expo --runInBand
```

Automated permission/scheduling tests mock native notification APIs. They do
not replace checking actual notification delivery on an Android device.

Reference: [Expo SDK 57 notification documentation](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).
