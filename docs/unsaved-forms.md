# Unsaved form protection

New and Edit track changes relative to their initial values. The default Task
selection, opening More options, opening/canceling a type selector, focusing an
input or inspecting a date picker do not make a form dirty. Changing a field
does; restoring all initial values makes it clean again.

Header Back and Android Back are guarded using SDK 57's `usePreventRemove` from
`expo-router/react-navigation`. A dirty form offers Keep editing or Discard
changes. Keep editing retains the current draft. Discard replays the original
navigation action so the intended destination is preserved. Repeated Back
presses do not stack alerts. Untouched forms leave without a prompt. An open
native picker or type dialog handles its own cancellation before screen Back.

Saving blocks removal while the operation is in progress. Successful saves
permit navigation immediately, including when React hasn't committed the clean
state yet. Failed saves retain the draft and protection and allow retrying.
The guard never navigates after its editor has unmounted. A write that has
already started is allowed to finish; it is not canceled or rolled back by UI
unmounting.

Complete/Reopen checks for unsaved edits before running the action. It explains
that those edits will be discarded if the action succeeds. Delete's existing
confirmation includes the unsaved-change warning. Failed mutations retain the
draft; successful operations leave without a second discard dialog. Actions
and the form are disabled while an operation is pending.

An edit-screen database refresh on resume or a notification event does not
replace the form while it has unsaved edits. Once it is clean again, a later
refresh can load current values. This does not implement automatic conflict
merging or recovery of drafts after force-stop, a development reload, process
termination or direct replacement of the route's todo id. It protects screen
removal and ordinary background/resume flows, not persistent drafts.

## Verification

```sh
npx tsc --noEmit
npx expo lint
npx jest --preset jest-expo --runInBand
```

Tests cover dirty/reverted values, option-dialog cancellation, alert deduplication,
Keep editing, discard to the original action, successful and failed saves,
pending/duplicate writes, failed deletes, completion confirmation, unmounting
while saving and preservation during a database refresh.

Device review (git pull and reload; no native rebuild required):

1. Open New Todo and immediately go Back: no prompt. Repeat after only opening
   More options or canceling the type selector: still no prompt.
2. Enter a subject or choose a date. Use header Back, choose Keep editing, and
   confirm the values remain. Repeat with Android Back and Discard changes;
   confirm no todo was created. The keyboard may consume the first Back press.
3. Edit an existing todo and change subject, notes or its schedule. Exercise both
   Back paths. Revert the values and confirm Back no longer prompts.
4. Save a changed form: it should return normally without asking to discard.
5. With an edited draft, tap Complete or Reopen. Keep editing must not mutate the
   todo. Confirming discard performs the action on the saved record. Delete
   should have only its one explicit deletion confirmation.
6. Switch apps/lock and unlock while editing, then return. Confirm the draft is
   still there. Verify type-dialog and Android date/time picker Back behavior.

Native back interception and gesture behavior require the actual device review.
