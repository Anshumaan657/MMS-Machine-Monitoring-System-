# Excel export and PDF printing guide

Reports always use the active dashboard filters and confirmed policy metadata.
Apply the intended filters before exporting.

## Excel export

Open **Daily Report** and select **Export Excel (.xlsx)**.

The generated workbook contains eleven worksheets:

1. **Daily Overview** — report scope and daily totals
2. **Machine Performance** — machine-level production and OEE components
3. **Shift Performance** — shift-level results
4. **Production Intervals** — filtered canonical production records
5. **Downtime Events** — filtered event evidence
6. **Financial Losses** — event and aggregate machine-hour loss
7. **Data-Quality Findings** — structured findings and recommended actions
8. **Alerts** — alert lifecycle and supporting records
9. **Management Summary** — deterministic or validated AI statements and evidence
10. **Rejection Rework Scrap** — separate quality quantities and rates
11. **Formula Policy and Metadata** — policy ID, version, status and formulas

The export includes:

- applied filters;
- generation timestamp;
- source filename;
- last synchronization time;
- calculation policy;
- provisional warning when applicable;
- dates and numeric values suitable for Excel analysis.

Worksheet text is sanitized to reduce spreadsheet-formula injection risk.

## Verifying Excel parity

Compare these values under identical filters:

- produced quantity and target;
- production loss;
- Availability and Performance;
- Quality/OEE readiness;
- downtime and System Off;
- machine-hour loss;
- rejection, rework and estimated scrap;
- alert and finding counts.

Automated tests verify dashboard/export parity for deterministic fixtures.

## Printable report and PDF

Open **Daily Report**, apply filters, then select **Print / Save PDF**.

The report includes:

- client/plant and report period;
- filters and data source;
- production and target;
- Availability, Performance and Quality/OEE status;
- machine and shift comparison;
- downtime Pareto and financial loss;
- rejection, rework and scrap;
- alerts and data-quality findings;
- evidence-backed management summary;
- policy version;
- generated and synchronization times.

## Saving as PDF

1. In the browser print dialog choose **Save as PDF**.
2. Use A4 paper.
3. Keep scale at 100% unless the preview shows clipping.
4. Enable background graphics for intended report colors.
5. Enable browser headers/footers only when physical page numbers are required.
6. Inspect portrait and landscape sections in preview.
7. Save using a client, period and generation-date filename.

Browser-native printing keeps the report local and avoids sending client data
to an external PDF service.

## Print limitations

Physical page numbering varies by browser and PDF renderer. Report section
numbers are embedded, but guaranteed page numbers require browser
headers/footers. Always inspect the preview before printing a hardcopy.

## Confidentiality

Exports and PDFs may contain client machine, operator and financial data.
Store them only in an approved location and delete temporary copies according
to 3D's retention policy.
