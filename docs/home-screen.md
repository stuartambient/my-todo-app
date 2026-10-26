# Home screen

The default home view is the Open todo list, titled Todos. The former Open and
Completed tab bar is removed. The three-dot Todo options button in the header
opens a compact menu with View completed. Tapping outside it or Android Back
closes the menu without changing the current view or search.

Completed uses the same list screen with a Completed header and an Open back
button. The header button or Android Back returns to the Open list. The
Completed list retains its completion-history order; opening an item still
allows editing/reopening it. Returning from that editor keeps the current view.

Search remains visible and searches subjects and notes in the current view.
Search text is preserved when moving between Open and Completed, and Clear
restores all items in that view. As before, successfully creating a new todo
selects Open, clears search and reveals the new row. Canceling creation doesn't
change the previous view/search.

Open todos keep their full date headings and existing time/date-only ordering.
Future countdowns read Due in followed by their duration; overdue todos keep the
Overdue label. Completed todos don't show countdowns. Date headings have a
lighter divider, and removing the tab bar frees space for the list.

Notification notices and reminder behavior are unchanged. This update adds no
packages or native configuration and needs only git pull and an app reload.

## Review on device

1. Check that the first screen shows Todos, search and the date-grouped open list.
2. Open the three-dot menu; dismiss it without selecting anything, then reopen
   it and choose View completed. Confirm the header and search scope change.
3. Return with the Open header button, then repeat using Android Back. If the
   keyboard is open, Android may dismiss it before handling another Back press.
4. Search for a phrase, switch views and clear search. Check scope and results.
5. Edit a completed todo and return. Create a new todo from Completed and check
   that Open returns with the new item visible.
6. Check Due in and Overdue labels, menu spacing, larger system text and the
   notification-permission/precise-reminder notices when applicable.

UI tests cover default view, menu selection/dismissal, both return paths,
search/date headings, countdown wording and the new-todo return flow. Native
header rendering, modal position and actual Back gestures require device review.
