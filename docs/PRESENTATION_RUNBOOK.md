# 3D Intelligence presentation runbook

## Purpose

This runbook keeps the internship demonstration reproducible, private and
recoverable. Use only the protected, commit-specific Vercel Preview link and a
non-confidential workbook approved for demonstration.

## Freeze the version

1. Run the full validation commands listed in `package.json`.
2. Push the reviewed presentation branch.
3. In Vercel, open the successful commit deployment—not the moving branch URL.
4. Create a Shareable Link for that exact commit deployment.
5. Tag the reviewed commit as `presentation-ready-v1` only after validation.
6. Do not push last-minute changes to the frozen presentation commit.

## Private-link check

1. Open the ordinary Preview URL in an incognito window. It must require Vercel
   authentication.
2. Open the exact Shareable Link. It must open the workbook connection page.
3. Never publish the Shareable Link in GitHub, documentation or social media.
4. Revoke the link after the review from **Deployment → Share → Only people
   with access**.

## Browser and workbook preparation

- Present with current Google Chrome or Microsoft Edge.
- Keep the approved `.xls` or `.xlsx` file in an easy-to-find local folder.
- A connected live workbook can be remembered through its browser file handle.
  The application asks for read permission again after a reload.
- Uploaded snapshots are not persisted; replace them manually when the source
  changes.
- The source workbook is never modified by the application.

## Complete demonstration path

1. Open the protected Shareable Link.
2. Connect the approved workbook.
3. Confirm the default scope is the latest available day.
4. Show Overview and explain verified Availability and Performance.
5. Show grouped operational alerts and their supporting record count.
6. Open Downtime, Data Quality and Machines.
7. Explain any blocked Quality or Final OEE value using the displayed readiness
   reason; never replace missing inputs with an invented value.
8. Open Daily Report.
9. Show the rule-based verified summary, then optionally try the AI narrative.
10. Export Excel and use Print / Save PDF.

## Expected fallback behaviour

- If external AI is unavailable, the verified rule-based summary remains
  available and the calculation engine remains the source of truth.
- If live-file access is unsupported, snapshot upload remains available.
- If quality inputs are incomplete, Quality is shown as **Not available** and
  Final OEE as **Blocked**, with a link to affected records.
- If a workbook is incompatible, the import compatibility error is displayed
  instead of calculating unsupported figures.

## Backup package

Before travelling or presenting, prepare a private local folder containing:

- the approved sample workbook;
- one exported Excel report;
- one saved PDF report;
- screenshots of all six dashboard views;
- a short recording of the complete workflow;
- the project overview and formula-policy documentation; and
- this runbook.

Do not commit the workbook, generated reports or client screenshots to the
public repository.

## Final acceptance checklist

- [ ] Exact Shareable Link tested in incognito Chrome
- [ ] Ordinary Preview URL still protected
- [ ] Workbook connection and reconnection verified
- [ ] Latest-day and all-history presets verified
- [ ] All six dashboard tabs opened
- [ ] Alert group and supporting-record counts explained
- [ ] Quality/OEE blocked-state explanation verified
- [ ] Rule-based summary verified without an API key
- [ ] Excel export downloaded and opened
- [ ] PDF printed or saved successfully
- [ ] Backup folder available offline
- [ ] Shareable Link scheduled for revocation

