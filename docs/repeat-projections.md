# Future repeats in date-range planning

Finite home views (Today, Next 7 days, Next 30 days, and Custom) combine saved open occurrences with calculated future **due-date-based** repeats. A weekly series starting in two weeks and ending in March 2030 appears on every scheduled date within a Custom range through March 2030, including its end date when that date falls on the schedule.

The projection uses the series' original calendar anchor, interval, current template, inclusive end date and skipped dates. Saved dates, including completed occurrences, suppress duplicate previews. Inactive series and completion-based repeats are not projected: the latter depend on a completion date that is not yet known. Previously skipped legacy gaps are not reconstructed.

## Planning versus reminder preparation

Browsing a range does not save the projected occurrences or schedule their notifications. The existing rolling 30-day preparation still runs on its normal refresh triggers; only saved occurrences participate in notification reconciliation. Future preview reminder times describe the planned schedule, not an already-registered Android alarm.

Today is the default view. Today, Next 7 days, Next 30 days, and Custom share one row; All open has been removed. Presets include overdue todos and keep undated todos in the No due date section. Custom shows only the selected inclusive date boundaries, including manually scheduled distant dates and calculated repeats. After creating a future-dated todo, the home screen selects a bounded Custom range from today through its due date so the saved todo can still be revealed. A request exceeding 10,000 projected occurrences produces a message asking for a shorter range rather than silently omitting dates.

## Opening and acting on a future occurrence

Calculated rows have a **Planned** label. Opening one shows its subject, type, due date/time, planned reminder and notes. **Edit repeating todo** opens an existing saved occurrence, using the established edit behavior for that occurrence and the series' applicable upcoming dates. The preview itself is read-only so editing a distant date cannot move the generation cursor years ahead.

- **Complete Todo** saves that single occurrence and marks it completed. Repeated completion requests resolve to the same saved row. The rolling generation cursor does not advance.
- **Delete this occurrence** records its date as skipped. It stays absent on refresh and when the preparation window later reaches it.
- **Delete entire series** stops the rule and removes its open saved occurrences; completed history remains.

A preview ID deterministically identifies its series and date. If normal preparation reaches that date while the preview is open, lookups and actions resolve to the saved occurrence. Mutations share the existing SQLite writer lock and transaction. Reopening a completed distant occurrence retains the preview's edit protection until normal generation reaches its date.

No schema, backup format, dependency, native configuration or signing changes are required. Backups contain actual rows and repeat rules; previews are recalculated after restore.

## Verification

Automated coverage includes a weekly series through March 2030, inclusive end dates, month-end anchors, skipped and completed dates, inactive and completion-based rules, very distant bounded ranges, the preview count limit, and stable preview IDs. SQLite integration checks verify that browsing does not change saved rows/cursors/notification requests beyond normal preparation, concurrent completion creates one row, deletion remains excluded, backups retain state, and later rolling generation does not duplicate a previously completed preview. Screen tests cover opening a preview, following its edit link and completing it.

On the phone:

1. Back up existing todos, pull the change and rebuild the standalone app with `npm.cmd run android:standalone`. Install over the existing app; keep its data.
2. Use the weekly repeat starting in two weeks with an end date in March 2030. Apply a Custom range through that end date and check every expected week appears.
3. Open a distant Planned row. Check its full date/time and planned reminder. Follow Edit repeating todo, then back out without changing it.
4. Complete one distant preview and delete a different occurrence. Reapply the range: both disappear from open results, the completed occurrence appears in history, and other scheduled dates remain.
5. Check Today is selected on launch, all four choices share a row, and overdue/undated todos are accessible in presets. Check ordinary editing and a near-term reminder still behave as before.

TypeScript, lint, Jest, the repository's SQLite/reminder scripts and a production Android JavaScript export are checked during implementation. Native delivery and the final standalone APK require the phone review above.
