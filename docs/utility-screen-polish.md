# Menu, backup and completed-history polish

The existing Home palette now continues through the options menu, Backup & restore, and Restore reminders. There is no new settings route or additional configuration to maintain.

- **Options menu:** Your todos and Tools groups, labelled icons, short descriptions, pressed feedback, and a scrollable menu constrained by the safe area. Back, tapping outside, and selecting an action retain the existing dismissal behavior.
- **Backup & restore:** separate Save and Restore cards, a remembered-folder panel, consistent primary/secondary buttons, an inline file preview and results beside their relevant action. Error dialogs name the failed operation. Folder selection, additive restore confirmation, retry/cancellation, busy guards, and Back protection remain.
- **Restore reminders:** matching cards, eligibility and pending counts, a distinct error/partial-failure notice, confirmation and retry. The copy explains verified deliveries without referring to an unspecified “this update”.
- **Completed:** quiet rows grouped by the local completion date, rather than due date. Existing repository order stays intact. Search remains available; each row offers Review and opens the existing edit screen with Reopen Todo. The creation button and reminder-permission notice are hidden while reviewing history. Toolbar and Android Back return to the prior open view.

Shared utility-screen components supply the same background, cards, typography, header treatment, 48-point buttons, safe-area padding and status notices. Icons use native Views, like the existing Home icons; no new font or native dependency is needed. Flexible heights and text wrapping accommodate longer labels and larger text.

No database, migration, backup format, reminder scheduling, recurrence, permissions or signing settings changed.

## Validation

TypeScript, Expo lint, Jest, backup integration and reminder-restoration integration checks pass. Coverage includes menu destinations/dismissal, completion-date grouping, review/reopen navigation, save/restore confirmations and cancellation, failure recovery, and disabled actions/Back protection during a pending save. A production Android JavaScript export succeeds. Android native layout and delivery still require a device review.

After pulling, rebuild the existing standalone installation with `npm.cmd run android:standalone`; do not uninstall or clear data. On the phone:

1. Open the three-dot menu. Review its icons/groups; close by tapping outside and with Android Back, then open each destination.
2. Save a backup in the remembered folder, change the folder and cancel once, then preview a backup. Cancel the restore confirmation to check that selecting a file alone does not import it.
3. Search Completed, review a todo, reopen it, and check it returns to Open. Return from Completed with both the toolbar and Android Back; the prior range should remain selected.
4. Check Restore reminders at zero eligibility and with an eligible card. Restoring still requires confirmation and remains silent.
5. Review portrait/landscape and larger system text for wrapping and scrolling, including the bottom navigation area.
