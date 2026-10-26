# Quick todo entry

The New Todo screen starts with Subject and the todo type. The first available
active type (normally Task) is selected, so a subject is sufficient to save.
Subject receives keyboard focus automatically. Save Todo stays in a footer
outside the scrolling fields, with bottom safe-area padding. On Android the
app's normal keyboard resize keeps that footer above the keyboard; iOS uses
KeyboardAvoidingView padding. No native configuration or dependencies changed.

Show details expands priority, due date, reminder, recurrence and notes.
Hiding details preserves their values. Saving a collapsed form with invalid
optional details expands them so validation messages can be seen. Recurring
todos still require an initial due date. Subject is still limited to 80
characters, and existing schema validation applies.

Save Todo or the Subject keyboard's Done action submits once. The form ignores
additional submits while validation or saving is in progress. A failed save
keeps the entered values available for retry. The edit screen continues to
show all fields and does not automatically summon the keyboard.

After creation the keyboard is dismissed and the app returns to the home
screen with the saved id. Home selects Open, clears any search, refreshes and
scrolls to that row in its normal date group (or No due date). SectionList
retries unmeasured locations after moving near them; retries stop when the row
is visible, the screen loses focus or the hook unmounts. Date ordering is kept.
The saved id is consumed after the row becomes visible, so later visits don't
keep jumping back to it. Back without saving retains the previous view/search.

## Verification

```sh
npx tsc --noEmit
npx expo lint
npx jest --preset jest-expo --runInBand
```

The UI tests cover subject-only entry/defaults, optional schedule preservation,
validation on hidden details, duplicate submission, existing edit values,
save failure/retry, clearing a previous Completed/search view after creation,
and scrolling/retrying/cleanup for the saved row.

Emulator review:

1. Pull and reload the existing development build. No native rebuild is needed.
2. Tap +: check that Subject is first, the keyboard opens and Save Todo remains
   reachable above it. Enter just a subject and save once.
3. Open Show details, choose a due date/reminder/repeat, add notes, hide details
   and save. Reopen the todo and check that all details remain.
4. Select a repeat without a due date, hide details and save. Check the due-date
   validation message appears after details reopen.
5. From Completed with an active search, create a todo that doesn't match it.
   Check that Open appears with search cleared and the new todo visible.
6. Repeat with a longer list and a distant future due date, then with no due
   date. Check that the list reveals the saved row without changing date order.
7. Back out of New Todo without saving: the previous search/view should remain.
8. Edit an existing todo and verify Save Changes, reminders and repeat behavior.

Native keyboard positioning, transition timing and scrolling on the actual
emulator require device review; Jest does not exercise those native layouts.
