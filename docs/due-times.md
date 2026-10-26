# Optional due times

New Todo always shows the due date/time row, above More options. Use Add date,
then Add time beside it to open the Android time picker.
Date and optional time share one row in both New and Edit, with separate clear
controls beneath their values.
Time is optional: selecting a date alone does not fill it. The picker starts at
9 AM only as an uncommitted suggestion; confirming is required to save a time.
Canceling the picker leaves the value unchanged. Midnight is a valid time.

Clear due time leaves the due date intact. Clear due date also clears its time.
Neither action changes the separately selected reminder. A due time never
creates a notification; users must explicitly set a Reminder for an alert.

Times appear beside due dates in both Open and Completed. Open todos sort by
calendar date, then timed todos in chronological order, then date-only todos.
Undated todos remain at the bottom. Matching times retain the existing priority
and creation-order tie breaks. Search preserves that order and date headings.
Completed history keeps its existing completion order.

The due countdown uses the selected local time. Date-only todos keep their
end-of-day deadline. The list refreshes its display at minute boundaries while
focused, without fetching todos or changing notification schedules.

## Storage and recurrence

The existing `todos.due_time` column now maps to `Todo.dueTime` and form values.
It stores a local wall-clock string in `HH:mm` format, or NULL for no time.
`00:00` is different from NULL. Existing date-only rows stay NULL; no database
reset or schema change is required. Validation rejects invalid times and times
without dates. Date/time use the device's local timezone; reminders remain
separate ISO timestamps.

Both recurrence modes carry the same due time into the successor. Changing only
the time preserves a monthly/yearly calendar anchor. Notification Complete uses
the same completion path, and Snooze modifies only the reminder timestamp.
Reminder dates still shift according to the existing recurrence rules, rather
than being inferred from or coupled to the due time.

## Verification

```sh
npx tsc --noEmit
npx expo lint
npx jest --preset jest-expo --runInBand
TZ=America/Denver node scripts/verify-reminders.cjs
```

The integration script requires Node 24+ for its built-in SQLite adapter. It
exercises real persistence, date/time ordering, clearing, validation rollback,
both recurrence modes, calendar anchors, and notification actions. It also
checks that due-time edits don't add or change native reminder requests.

Emulator review (pull and reload; no native rebuild):

1. Create two todos on the same date at 9 AM and 3 PM, plus one with no time.
   Check that the order is 9 AM, 3 PM, date-only under one date heading.
2. Reopen a timed todo, edit its subject, and confirm its time persists.
3. Clear only the time, then clear a due date. Check the independent reminder
   stays unchanged. Cancel a time picker and check no time is added/changed.
4. Set a due time a minute ahead and leave the list open. Check its due label
   becomes Overdue without an alert when there is no Reminder.
5. Complete a timed recurring todo and inspect the successor's time. Check
   Completed also shows the original time.
6. Verify that existing date-only todos still have no time.

Native picker behavior, display formatting on the emulator, and end-to-end
notification delivery require device testing.
