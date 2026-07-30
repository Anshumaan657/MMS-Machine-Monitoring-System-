# Excel input guide

## Supported files

- `.xls`
- `.xlsx`
- Maximum file size: 50 MB
- Maximum rows per sheet: 200,000
- Maximum rows across the two required sheets: 300,000
- Maximum columns per sheet: 256

The parser searches the first 50 rows for a recognized header row and preserves
the original uploaded file unchanged.

## Required sheets

### Product Log Book

Accepted minor name variations include `Product Log`, `Production Log Book`,
`Production Log` and `ProductLogBook`.

Mandatory columns:

| Column | Meaning |
|---|---|
| Date | Production date |
| Machine | Machine identifier/name |
| Shift | Shift identifier |
| From Time | Interval start |
| Till Time | Interval end |
| Qty | Reported production quantity |
| Opr. Time | Operative/running duration |
| Std. Cycle Time | Management-approved standard cycle time |

### Down Time Details

Accepted minor name variations include `Downtime Details`, `Downtime Detail`,
`Down Time Detail` and `Downtime Log`.

Mandatory columns:

| Column | Meaning |
|---|---|
| Date | Event date |
| Machine | Machine identifier/name |
| Shift | Shift identifier |
| From Time | Event start |
| Till Time | Event end |
| Duration | Reported event duration |

## Optional production columns

The contract recognizes:

`Part No.`, `Part Name`, `Part ERP Code`, `Part Cost`, `Product Name`,
`Machine Type`, `Running Hrs Cost`, `Setup Time`, `M. Factor`,
`Prod Gap Between`, `Additional Over Time`, `Component Cost`, `Scrap part`,
`Approved Cycle Time`, `Quality Interlock`, `ERP Code`,
`Process Dependency`, `Operator`, `Address`, `Mobile`,
`Operator Per Hrs Cost`, `Stroke`, `Achieve Cycle Time`, `Shift Target`,
`Opr. Time Target`, `Proxy`, `Shift Time`, `Allowed Time`,
`Non Opr. Time`, `Down Time`, `System Off`, `Product Loss`, `Reject Qty`,
`Rework Qty`, `Error Stroke` and `Tool Yes/No`.

Missing optional columns generate compatibility information or data-quality
findings where relevant; they do not crash the import.

## Optional downtime columns

`Revenue`, `Reason_Type`, `Reason`, `Product Name` and `Operator Name`.

## Normalization

The contract tolerates:

- header capitalization differences;
- leading or trailing spaces;
- repeated spaces;
- punctuation differences such as `.`, `_`, `/` and `-`;
- documented aliases such as `Quantity` for `Qty`;
- Excel date/time values and MMS text date/time formats;
- duration text used by MMS exports.

Time durations are converted to seconds internally. Cycle-time fields are
treated as seconds.

## Special values

- `NULL` and `NULL TURN` are preserved as valid user-defined product names and
  also reported as informational placeholders.
- `NO OPERATOR`, empty operator cells and equivalent missing values are
  retained but flagged as missing operator data.
- `No Type` is treated as an absent machine type.
- Blank required identity fields create validation findings.
- Report totals and reporting-only `Total` rows are excluded.

## Compatibility outcomes

- **Compatible:** required sheets and columns are present.
- **Compatible with warnings:** import can continue, but optional or unknown
  fields require review.
- **Rejected:** required structure is missing, ambiguous or beyond safe limits.

An unrelated or incomplete workbook is rejected before analytics are produced.

## Preparing a new workbook

1. Export directly from MMS.
2. Do not manually merge cells in the data area.
3. Keep one record per production interval or continuous downtime event.
4. Keep machine and shift names consistent.
5. Preserve numerical values as numbers where possible.
6. Enter rejection and rework explicitly; blank is different from zero.
7. Enter a downtime reason instead of `UNREPORTED` whenever known.
8. Save as `.xls` or `.xlsx`.
9. Keep a backup of the original export.

## Generalization boundary

The importer supports workbooks with the same MMS meaning and documented
aliases. It is not a universal spreadsheet importer. A workbook with unrelated
sheets or different business semantics must be mapped explicitly rather than
forced through the parser.
