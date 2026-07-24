import * as XLSX from "xlsx";

export type MachineSummary = {
  machine: string;
  production: number;
  target: number;
  attainment: number | null;
  downtimeHours: number;
  revenueLoss: number;
  downtimeEvents: number;
  unreportedRate: number;
};

export type ShiftSummary = {
  shift: string;
  production: number;
  target: number;
  attainment: number | null;
  downtimeHours: number;
  revenueLoss: number;
};

export type MonthlySummary = ShiftSummary & { month: string };

export type MmsSummary = {
  source: {
    company: string;
    fileName: string;
    generatedAt: string;
    productDateRange: [string, string];
    downtimeDateRange: [string, string];
  };
  overview: {
    machines: number;
    productRecords: number;
    downtimeEvents: number;
    totalProduction: number;
    totalTarget: number;
    targetAttainment: number | null;
    downtimeHours: number;
    reportedRevenueLoss: number;
  };
  quality: {
    unreportedDowntimeEvents: number;
    unreportedDowntimeRate: number;
    missingProductRecords: number;
    missingDowntimeProducts: number;
    noOperatorProductRecords: number;
    noOperatorDowntimeEvents: number;
    invalidDurations: number;
    zeroRejectRecords: number;
    zeroReworkRecords: number;
  };
  machines: MachineSummary[];
  shifts: ShiftSummary[];
  monthly: MonthlySummary[];
  latestDay: {
    date: string;
    production: number;
    target: number;
    attainment: number | null;
    downtimeHours: number;
    reportedRevenueLoss: number;
    topDowntimeMachine: string;
    topDowntimeMachineHours: number;
  };
};

type SheetRow = Record<string, unknown>;

const NULLS = new Set(["", "NULL", "NONE", "N/A", "NA", "-"]);

function clean(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function missing(value: unknown): boolean {
  return NULLS.has(clean(value).toUpperCase());
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = clean(value).replaceAll(",", "");
  if (!raw || NULLS.has(raw.toUpperCase())) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsedDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const decoded = XLSX.SSF.parse_date_code(value);
    if (decoded) return new Date(decoded.y, decoded.m - 1, decoded.d, decoded.H, decoded.M, decoded.S);
  }
  const raw = clean(value).replace(/\s+/g, " ");
  const match = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i,
  );
  if (!match) return null;
  const [, dd, mm, yyyy, hh = "0", min = "0", sec = "0", meridiem] = match;
  let hour = Number(hh);
  if (meridiem?.toUpperCase() === "PM" && hour < 12) hour += 12;
  if (meridiem?.toUpperCase() === "AM" && hour === 12) hour = 0;
  const result = new Date(Number(yyyy), Number(mm) - 1, Number(dd), hour, Number(min), Number(sec));
  return Number.isNaN(result.getTime()) ? null : result;
}

function durationHours(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value * 24;
  const match = clean(value).match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60 + Number(match[3] ?? 0) / 3600;
}

function isoDay(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function rounded(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function extractRows(workbook: XLSX.WorkBook, requestedName: string): SheetRow[] {
  const sheetName =
    workbook.SheetNames.find((name) => name.trim().toLowerCase() === requestedName.toLowerCase()) ??
    workbook.SheetNames.find((name) => name.toLowerCase().includes(requestedName.toLowerCase()));
  if (!sheetName) throw new Error(`The workbook does not contain a “${requestedName}” sheet.`);

  const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
  });
  const headerIndex = grid.findIndex(
    (row) => clean(row?.[0]).toLowerCase() === "date" && clean(row?.[1]).toLowerCase() === "machine",
  );
  if (headerIndex < 0) throw new Error(`Could not find the data headers in “${sheetName}”.`);

  const headers = grid[headerIndex].map(clean);
  return grid
    .slice(headerIndex + 1)
    .filter((row) => row.some((value) => !missing(value)))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

type Accumulator = {
  production: number;
  target: number;
  downtimeHours: number;
  revenueLoss: number;
  productRecords: number;
  downtimeEvents: number;
  unreportedEvents: number;
};

const emptyAccumulator = (): Accumulator => ({
  production: 0,
  target: 0,
  downtimeHours: 0,
  revenueLoss: 0,
  productRecords: 0,
  downtimeEvents: 0,
  unreportedEvents: 0,
});

export function summarizeWorkbook(workbook: XLSX.WorkBook, fileName: string): MmsSummary {
  const productRows = extractRows(workbook, "Product Log Book").filter(
    (row) => clean(row["Part No."]).toUpperCase() !== "TOTAL === >",
  );
  const downtimeRows = extractRows(workbook, "Down Time Details").filter(
    (row) => clean(row.Shift).toUpperCase() !== "TOTAL",
  );

  const machines = new Map<string, Accumulator>();
  const shifts = new Map<string, Accumulator>();
  const months = new Map<string, Accumulator>();
  const days = new Map<string, Accumulator>();
  const productDates: Date[] = [];
  const downtimeDates: Date[] = [];

  const get = (map: Map<string, Accumulator>, key: string) => {
    if (!map.has(key)) map.set(key, emptyAccumulator());
    return map.get(key)!;
  };

  for (const row of productRows) {
    const machine = clean(row.Machine);
    const shift = clean(row.Shift);
    const date = parsedDate(row.Date);
    const production = numeric(row.Qty) ?? 0;
    const target = numeric(row["Shift Target"]) ?? 0;
    if (!machine) continue;

    const machineValue = get(machines, machine);
    machineValue.production += production;
    machineValue.target += target;
    machineValue.productRecords += 1;

    const shiftValue = get(shifts, shift);
    shiftValue.production += production;
    shiftValue.target += target;

    if (date) {
      productDates.push(date);
      const monthValue = get(months, monthKey(date));
      monthValue.production += production;
      monthValue.target += target;
      const dayValue = get(days, isoDay(date));
      dayValue.production += production;
      dayValue.target += target;
    }
  }

  let invalidDurations = 0;
  for (const row of downtimeRows) {
    const machine = clean(row.Machine);
    const shift = clean(row.Shift);
    const date = parsedDate(row.Date);
    let duration = durationHours(row.Duration);
    const revenueLoss = numeric(row.Revenue) ?? 0;
    const unreported = clean(row.Reason).toUpperCase() === "UNREPORTED";
    if (!machine) continue;
    if (duration == null) {
      duration = 0;
      invalidDurations += 1;
    }

    const machineValue = get(machines, machine);
    machineValue.downtimeHours += duration;
    machineValue.revenueLoss += revenueLoss;
    machineValue.downtimeEvents += 1;
    if (unreported) machineValue.unreportedEvents += 1;

    const shiftValue = get(shifts, shift);
    shiftValue.downtimeHours += duration;
    shiftValue.revenueLoss += revenueLoss;

    if (date) {
      downtimeDates.push(date);
      const monthValue = get(months, monthKey(date));
      monthValue.downtimeHours += duration;
      monthValue.revenueLoss += revenueLoss;
      const dayValue = get(days, isoDay(date));
      dayValue.downtimeHours += duration;
      dayValue.revenueLoss += revenueLoss;
    }
  }

  const machineSummaries: MachineSummary[] = Array.from(machines, ([machine, value]) => ({
    machine,
    production: Math.round(value.production),
    target: rounded(value.target),
    attainment: value.target ? rounded((value.production / value.target) * 100) : null,
    downtimeHours: rounded(value.downtimeHours),
    revenueLoss: Math.round(value.revenueLoss),
    downtimeEvents: value.downtimeEvents,
    unreportedRate: value.downtimeEvents
      ? rounded((value.unreportedEvents / value.downtimeEvents) * 100, 2)
      : 0,
  })).sort((a, b) => b.downtimeHours - a.downtimeHours);

  const shiftSummaries: ShiftSummary[] = Array.from(shifts, ([shift, value]) => ({
    shift,
    production: Math.round(value.production),
    target: rounded(value.target),
    attainment: value.target ? rounded((value.production / value.target) * 100) : null,
    downtimeHours: rounded(value.downtimeHours),
    revenueLoss: Math.round(value.revenueLoss),
  })).filter((item) => item.shift);

  const monthlySummaries: MonthlySummary[] = Array.from(months, ([month, value]) => ({
    month,
    shift: month,
    production: Math.round(value.production),
    target: rounded(value.target),
    attainment: value.target ? rounded((value.production / value.target) * 100) : null,
    downtimeHours: rounded(value.downtimeHours),
    revenueLoss: Math.round(value.revenueLoss),
  })).sort((a, b) => a.month.localeCompare(b.month));

  const totalProduction = machineSummaries.reduce((sum, item) => sum + item.production, 0);
  const totalTarget = machineSummaries.reduce((sum, item) => sum + item.target, 0);
  const downtimeHoursTotal = machineSummaries.reduce((sum, item) => sum + item.downtimeHours, 0);
  const revenueLossTotal = machineSummaries.reduce((sum, item) => sum + item.revenueLoss, 0);
  const unreported = downtimeRows.filter((row) => clean(row.Reason).toUpperCase() === "UNREPORTED").length;

  const latestDate = Array.from(days.keys()).sort().at(-1) ?? "";
  const latest = days.get(latestDate) ?? emptyAccumulator();
  const latestMachineValues = new Map<string, number>();
  for (const row of downtimeRows) {
    const date = parsedDate(row.Date);
    if (date && isoDay(date) === latestDate) {
      const machine = clean(row.Machine);
      latestMachineValues.set(machine, (latestMachineValues.get(machine) ?? 0) + (durationHours(row.Duration) ?? 0));
    }
  }
  const [topDowntimeMachine = "Not available", topDowntimeMachineHours = 0] =
    Array.from(latestMachineValues.entries()).sort((a, b) => b[1] - a[1])[0] ?? [];

  const range = (dates: Date[]): [string, string] => {
    const sorted = dates.map((date) => date.getTime()).sort((a, b) => a - b);
    return sorted.length
      ? [isoDay(new Date(sorted[0])), isoDay(new Date(sorted.at(-1)!))]
      : ["Not available", "Not available"];
  };

  return {
    source: {
      company: clean(workbook.Sheets[workbook.SheetNames[0]]?.A1?.v) || "Imported MMS dataset",
      fileName,
      generatedAt: new Date().toISOString(),
      productDateRange: range(productDates),
      downtimeDateRange: range(downtimeDates),
    },
    overview: {
      machines: machineSummaries.length,
      productRecords: productRows.length,
      downtimeEvents: downtimeRows.length,
      totalProduction,
      totalTarget: rounded(totalTarget),
      targetAttainment: totalTarget ? rounded((totalProduction / totalTarget) * 100) : null,
      downtimeHours: rounded(downtimeHoursTotal),
      reportedRevenueLoss: Math.round(revenueLossTotal),
    },
    quality: {
      unreportedDowntimeEvents: unreported,
      unreportedDowntimeRate: downtimeRows.length ? rounded((unreported / downtimeRows.length) * 100, 2) : 0,
      missingProductRecords: productRows.filter((row) => missing(row["Product Name"])).length,
      missingDowntimeProducts: downtimeRows.filter((row) => missing(row["Product Name"])).length,
      noOperatorProductRecords: productRows.filter((row) =>
        clean(row.Operator).toUpperCase().includes("NO OPERATOR"),
      ).length,
      noOperatorDowntimeEvents: downtimeRows.filter((row) =>
        clean(row["Operator Name"]).toUpperCase().includes("NO OPERATOR"),
      ).length,
      invalidDurations,
      zeroRejectRecords: productRows.filter((row) => (numeric(row["Reject Qty"]) ?? 0) === 0).length,
      zeroReworkRecords: productRows.filter((row) => (numeric(row["Rework Qty"]) ?? 0) === 0).length,
    },
    machines: machineSummaries,
    shifts: shiftSummaries,
    monthly: monthlySummaries,
    latestDay: {
      date: latestDate,
      production: Math.round(latest.production),
      target: rounded(latest.target),
      attainment: latest.target ? rounded((latest.production / latest.target) * 100) : null,
      downtimeHours: rounded(latest.downtimeHours),
      reportedRevenueLoss: Math.round(latest.revenueLoss),
      topDowntimeMachine,
      topDowntimeMachineHours: rounded(topDowntimeMachineHours),
    },
  };
}

export function parseMmsFile(buffer: ArrayBuffer, fileName: string): MmsSummary {
  const workbook = XLSX.read(buffer, { cellDates: true, type: "array" });
  return summarizeWorkbook(workbook, fileName);
}
