"use client";

import {
  ChangeEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as XLSX from "xlsx";
import {
  ExcelMmsDataSource,
  type MmsDataSource,
} from "./mms-data-source";
import {
  getMmsFilterOptions,
  queryMmsAnalytics,
} from "./mms";
import {
  createInitialMmsSyncState,
  MmsSynchronizationEngine,
} from "./synchronization-engine";
import type {
  CanonicalMmsData,
  DowntimeAggregate,
  FilteredMmsAnalytics,
  OeeAggregate,
  ProductionQueryAggregate,
} from "./mms";
import type {
  MmsSyncChanges,
  MmsSyncLogEntry,
  MmsSyncState,
} from "./synchronization-engine";

export type DashboardTab =
  | "overview"
  | "downtime"
  | "data-quality"
  | "machines"
  | "daily-report";

export type MachineStatus = "Running" | "Idle" | "Warning" | "Fault";

type NavigationItem = {
  id: DashboardTab;
  label: string;
  shortLabel: string;
  icon: string;
};

type MachineView = {
  id: string;
  name: string;
  status: MachineStatus;
  production: number;
  target: number;
  attainment: number | null;
  availability: number | null;
  performance: number | null;
  downtimeHours: number;
  financialLoss: number;
  rejected: number;
  reworked: number;
  estimatedScrap: number;
  issueCount: number;
  unreportedEvents: number;
};

type KpiCardProps = {
  label: string;
  value: string;
  detail: string;
  trend?: string;
  tone: "indigo" | "emerald" | "amber" | "rose";
  children?: ReactNode;
};

type BrowserFileHandle = {
  name: string;
  getFile(): Promise<File>;
};

type WorkbookPickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<BrowserFileHandle[]>;
};

type SyncNotice = {
  id: number;
  message: string;
};

const SYNC_LOG_STORAGE_KEY = "mms-intelligence-sync-logs-v1";
const SYNC_POLL_INTERVAL_MS = 60_000;
const SYNC_STALE_AFTER_MS = 5 * 60_000;

const NAVIGATION: NavigationItem[] = [
  { id: "overview", label: "Overview", shortLabel: "OV", icon: "⌁" },
  { id: "downtime", label: "Downtime", shortLabel: "DT", icon: "↯" },
  { id: "data-quality", label: "Data Quality", shortLabel: "DQ", icon: "◇" },
  { id: "machines", label: "Machines", shortLabel: "MC", icon: "▦" },
  { id: "daily-report", label: "Daily Report", shortLabel: "DR", icon: "▤" },
];

const numberFormat = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});
const integerFormat = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});
const currencyFormat = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function percent(value: number | null): string {
  return value == null ? "N/A" : `${numberFormat.format(value * 100)}%`;
}

function hours(seconds: number): number {
  return seconds / 3_600;
}

function readableDate(value: string | null): string {
  if (!value) return "Not selected";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function readableTimestamp(value: string | null): string {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function readStoredSyncLogs(): MmsSyncLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SYNC_LOG_STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed) ? parsed.slice(-250) : [];
  } catch {
    return [];
  }
}

function syncNoticeMessage(changes: MmsSyncChanges): string {
  return `${changes.added} new, ${changes.modified} modified and ${changes.removed} removed records synchronized.`;
}

function byLabel<T extends { label: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.label, item]));
}

function KpiCard({
  label,
  value,
  detail,
  trend,
  tone,
  children,
}: KpiCardProps) {
  return (
    <article className={`kpi-card kpi-${tone}`}>
      <div className="kpi-card-head">
        <span>{label}</span>
        <i aria-hidden="true" />
      </div>
      <div className="kpi-value-row">
        <strong>{value}</strong>
        {trend ? <span>{trend}</span> : null}
      </div>
      <p>{detail}</p>
      {children}
    </article>
  );
}

function Panel({
  title,
  eyebrow,
  action,
  className = "",
  children,
}: {
  title: string;
  eyebrow: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`glass-panel ${className}`}>
      <header className="panel-heading">
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function StatusChip({ status }: { status: MachineStatus }) {
  return (
    <span className={`status-chip status-${status.toLowerCase()}`}>
      <i aria-hidden="true" />
      {status}
    </span>
  );
}

function PendingMetric({ label }: { label: string }) {
  return (
    <div className="pending-metric">
      <span>{label}</span>
      <strong>Pending</strong>
      <small>Reserved until the approved OEE phase is implemented</small>
    </div>
  );
}

function EmptyState({
  error,
  processing,
  onUpload,
  inputRef,
  onChange,
}: {
  error: string;
  processing: boolean;
  onUpload: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <main className="empty-state">
      <div className="empty-orbit" aria-hidden="true">
        <span>MI</span>
      </div>
      <span className="eyebrow">MMS Intelligence™</span>
      <h1>Upload a verified MMS workbook to begin.</h1>
      <p>
        Production, Availability, Performance, downtime, financial loss,
        quality records and data-quality findings are recalculated locally from
        the selected workbook. Supported browsers can continue monitoring that
        workbook for changes every minute.
      </p>
      {error ? <div className="inline-alert">{error}</div> : null}
      <button
        className="button button-primary"
        onClick={onUpload}
        disabled={processing}
      >
        {processing ? "Processing workbook…" : "Connect workbook"}
      </button>
      <small>
        Excel analysis happens locally. Manual upload remains available when
        live file access is unsupported.
      </small>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".xls,.xlsx"
        onChange={onChange}
        aria-label="Upload MMS workbook"
      />
    </main>
  );
}

function calculatedStatus(
  production: ProductionQueryAggregate | undefined,
  oee: OeeAggregate | undefined,
  downtime: DowntimeAggregate | undefined,
  issueCount: number,
): MachineStatus {
  if ((downtime?.overlappingEventCount ?? 0) > 0) return "Fault";
  if ((production?.totals.producedQuantity ?? 0) === 0) return "Idle";
  if (
    issueCount > 0 ||
    (downtime?.unreportedEventCount ?? 0) > 0 ||
    (oee?.availability != null && oee.availability < 0.5) ||
    (oee?.performance != null && oee.performance > 1.2)
  ) {
    return "Warning";
  }
  return "Running";
}

function buildMachineViews(
  analytics: FilteredMmsAnalytics,
): MachineView[] {
  const production = byLabel(analytics.production.machineWise);
  const oee = byLabel(analytics.availabilityPerformance.machineWise);
  const downtime = byLabel(analytics.downtime.machineWise);
  const quality = byLabel(analytics.quality.machineWise);
  const issueCounts = new Map<string, number>();
  const machineByRecord = new Map<string, string>();
  for (const record of analytics.records.productionIntervals) {
    machineByRecord.set(record.id, record.machine);
  }
  for (const record of analytics.records.downtimeEvents) {
    machineByRecord.set(record.id, record.machine);
  }
  for (const issue of analytics.dataQuality.validationIssues) {
    const machine = machineByRecord.get(issue.recordId);
    if (machine) issueCounts.set(machine, (issueCounts.get(machine) ?? 0) + 1);
  }
  const names = new Set([
    ...production.keys(),
    ...downtime.keys(),
    ...oee.keys(),
    ...quality.keys(),
  ]);

  return [...names]
    .sort((left, right) => left.localeCompare(right))
    .map((name, index) => {
      const productionValue = production.get(name);
      const oeeValue = oee.get(name);
      const downtimeValue = downtime.get(name);
      const qualityValue = quality.get(name);
      const issueCount = issueCounts.get(name) ?? 0;
      return {
        id: `M-${String(index + 1).padStart(3, "0")}`,
        name,
        status: calculatedStatus(
          productionValue,
          oeeValue,
          downtimeValue,
          issueCount,
        ),
        production: productionValue?.totals.producedQuantity ?? 0,
        target: productionValue?.totals.shiftTarget ?? 0,
        attainment: productionValue?.targetAttainment ?? null,
        availability: oeeValue?.availability ?? null,
        performance: oeeValue?.performance ?? null,
        downtimeHours: hours(downtimeValue?.totals.downtimeSeconds ?? 0),
        financialLoss:
          downtimeValue?.totals.calculatedMachineHourLoss ?? 0,
        rejected: qualityValue?.totals.rejectedQuantity ?? 0,
        reworked: qualityValue?.totals.reworkedQuantity ?? 0,
        estimatedScrap: qualityValue?.totals.estimatedScrap ?? 0,
        issueCount,
        unreportedEvents: downtimeValue?.unreportedEventCount ?? 0,
      };
    });
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [canonical, setCanonical] = useState<CanonicalMmsData | null>(null);
  const [processing, setProcessing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedShift, setSelectedShift] = useState("");
  const [selectedMachine, setSelectedMachine] = useState("");
  const [machineSearch, setMachineSearch] = useState("");
  const [machineStatus, setMachineStatus] = useState<MachineStatus | "All">(
    "All",
  );
  const [selectedMachineName, setSelectedMachineName] = useState("");
  const [syncState, setSyncState] = useState<MmsSyncState>(() =>
    createInitialMmsSyncState(),
  );
  const [syncNotice, setSyncNotice] = useState<SyncNotice | null>(null);
  const [sourceMode, setSourceMode] = useState<
    "live-file" | "uploaded-snapshot" | null
  >(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const syncEngine = useRef<MmsSynchronizationEngine | null>(null);
  const noticeSequence = useRef(0);

  useEffect(
    () => () => {
      syncEngine.current?.stop();
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined" || syncState.logs.length === 0) return;
    try {
      window.localStorage.setItem(
        SYNC_LOG_STORAGE_KEY,
        JSON.stringify(syncState.logs.slice(-250)),
      );
    } catch {
      // Synchronization continues when device-local storage is unavailable.
    }
  }, [syncState.logs]);

  useEffect(() => {
    if (!syncNotice) return;
    const timer = window.setTimeout(() => setSyncNotice(null), 7_000);
    return () => window.clearTimeout(timer);
  }, [syncNotice]);

  const filterOptions = useMemo(
    () => (canonical ? getMmsFilterOptions(canonical) : null),
    [canonical],
  );
  const analytics = useMemo(
    () =>
      canonical
        ? queryMmsAnalytics(canonical, {
            dateRange: {
              from: dateFrom || null,
              to: dateTo || null,
            },
            shift: selectedShift || null,
            machine: selectedMachine || null,
          })
        : null,
    [canonical, dateFrom, dateTo, selectedMachine, selectedShift],
  );
  const machines = useMemo(
    () => (analytics ? buildMachineViews(analytics) : []),
    [analytics],
  );
  const selectedMachineView =
    machines.find((machine) => machine.name === selectedMachineName) ??
    machines[0] ??
    null;
  const visibleMachines = useMemo(() => {
    const search = machineSearch.trim().toLowerCase();
    return machines.filter(
      (machine) =>
        (machineStatus === "All" || machine.status === machineStatus) &&
        (!search ||
          machine.name.toLowerCase().includes(search) ||
          machine.id.toLowerCase().includes(search)),
    );
  }, [machineSearch, machineStatus, machines]);

  function startSynchronization(
    source: MmsDataSource,
    mode: "live-file" | "uploaded-snapshot",
  ): void {
    const hadDataset = canonical != null;
    let hasPublishedDataset = hadDataset;
    syncEngine.current?.stop();
    setProcessing(true);
    setLoadError("");
    setSourceMode(mode);
    if (!hadDataset) {
      setDateFrom("");
      setDateTo("");
      setSelectedShift("");
      setSelectedMachine("");
      setSelectedMachineName("");
      setActiveTab("overview");
    }

    const engine = new MmsSynchronizationEngine(source, {
      pollIntervalMs: SYNC_POLL_INTERVAL_MS,
      staleAfterMs: SYNC_STALE_AFTER_MS,
      initialLogs: readStoredSyncLogs(),
      onData(data, changes) {
        setCanonical(data);
        if (hasPublishedDataset) {
          noticeSequence.current += 1;
          setSyncNotice({
            id: noticeSequence.current,
            message: syncNoticeMessage(changes),
          });
        }
        hasPublishedDataset = true;
      },
      onState(state) {
        setSyncState(state);
        setProcessing(state.status === "syncing" && !hasPublishedDataset);
        setLoadError(state.error ?? "");
      },
    });
    syncEngine.current = engine;
    engine.start();
  }

  async function connectWorkbook(): Promise<void> {
    const picker = (window as WorkbookPickerWindow).showOpenFilePicker;
    if (!picker) {
      fileInput.current?.click();
      return;
    }
    try {
      const [handle] = await picker({
        multiple: false,
        types: [
          {
            description: "MMS Excel workbook",
            accept: {
              "application/vnd.ms-excel": [".xls"],
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                [".xlsx"],
            },
          },
        ],
      });
      if (!handle) return;
      const source = new ExcelMmsDataSource(handle.name, async () => {
        const currentFile = await handle.getFile();
        return currentFile.arrayBuffer();
      });
      startSynchronization(source, "live-file");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadError(
        error instanceof Error
          ? error.message
          : "The workbook could not be connected.",
      );
    }
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    startSynchronization(
      new ExcelMmsDataSource(file.name, () => file.arrayBuffer()),
      "uploaded-snapshot",
    );
    event.target.value = "";
  }

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setSelectedShift("");
    setSelectedMachine("");
  }

  function exportFilteredReport() {
    if (!canonical || !analytics) return;
    const period = analytics.availabilityPerformance.period;
    const overview = XLSX.utils.aoa_to_sheet([
      ["MMS INTELLIGENCE — FILTERED OPERATIONS REPORT"],
      ["Company", canonical.source.company],
      ["Source workbook", canonical.source.fileName],
      ["Date from", analytics.scope.dateFrom ?? "All"],
      ["Date to", analytics.scope.dateTo ?? "All"],
      ["Shift", selectedShift || "All"],
      ["Machine", selectedMachine || "All"],
      [],
      ["Metric", "Value", "Unit / status"],
      [
        "Production",
        analytics.production.totals.producedQuantity,
        "Quantity",
      ],
      ["Shift target", analytics.production.totals.shiftTarget, "Quantity"],
      [
        "Target attainment",
        analytics.production.targetAttainment ?? "Not available",
        "Percent",
      ],
      [
        "Availability",
        period.availability == null ? "Not available" : period.availability * 100,
        "Percent",
      ],
      [
        "Performance",
        period.performance == null ? "Not available" : period.performance * 100,
        "Percent",
      ],
      ["Quality", "Pending", "Not used in Final OEE"],
      ["Final OEE", "Pending", "Not calculated"],
      [
        "Downtime",
        hours(analytics.downtime.period.totals.downtimeSeconds),
        "Hours",
      ],
      [
        "Calculated machine-hour loss",
        analytics.downtime.period.totals.calculatedMachineHourLoss,
        "INR",
      ],
      [
        "Rejected quantity",
        analytics.quality.period.totals.rejectedQuantity,
        "Quantity",
      ],
      [
        "Rework quantity",
        analytics.quality.period.totals.reworkedQuantity,
        "Quantity",
      ],
      [
        "Estimated scrap",
        analytics.quality.period.totals.estimatedScrap,
        "Source scrap unit",
      ],
      ["Data-quality errors", analytics.dataQuality.errorCount, "Count"],
      ["Data-quality warnings", analytics.dataQuality.warningCount, "Count"],
    ]);
    overview["!cols"] = [{ wch: 36 }, { wch: 24 }, { wch: 30 }];

    const productionByMachine = byLabel(analytics.production.machineWise);
    const oeeByMachine = byLabel(
      analytics.availabilityPerformance.machineWise,
    );
    const downtimeByMachine = byLabel(analytics.downtime.machineWise);
    const qualityByMachine = byLabel(analytics.quality.machineWise);
    const machineRows = machines.map((machine) => ({
      Machine: machine.name,
      "Calculated State": machine.status,
      Production: productionByMachine.get(machine.name)?.totals
        .producedQuantity,
      Target: productionByMachine.get(machine.name)?.totals.shiftTarget,
      "Target Attainment (%)":
        productionByMachine.get(machine.name)?.targetAttainment ??
        "Not available",
      "Availability (%)":
        oeeByMachine.get(machine.name)?.availability == null
          ? "Not available"
          : (oeeByMachine.get(machine.name)?.availability ?? 0) * 100,
      "Performance (%)":
        oeeByMachine.get(machine.name)?.performance == null
          ? "Not available"
          : (oeeByMachine.get(machine.name)?.performance ?? 0) * 100,
      "Downtime (hours)": hours(
        downtimeByMachine.get(machine.name)?.totals.downtimeSeconds ?? 0,
      ),
      "Calculated Financial Loss":
        downtimeByMachine.get(machine.name)?.totals
          .calculatedMachineHourLoss ?? 0,
      Rejected: qualityByMachine.get(machine.name)?.totals.rejectedQuantity ?? 0,
      Rework: qualityByMachine.get(machine.name)?.totals.reworkedQuantity ?? 0,
      "Estimated Scrap":
        qualityByMachine.get(machine.name)?.totals.estimatedScrap ?? 0,
    }));

    const productionByShift = byLabel(analytics.production.shiftWise);
    const oeeByShift = byLabel(analytics.availabilityPerformance.shiftWise);
    const downtimeByShift = byLabel(analytics.downtime.shiftWise);
    const qualityByShift = byLabel(analytics.quality.shiftWise);
    const shiftNames = new Set([
      ...productionByShift.keys(),
      ...oeeByShift.keys(),
      ...downtimeByShift.keys(),
      ...qualityByShift.keys(),
    ]);
    const shiftRows = [...shiftNames].map((shift) => ({
      Shift: shift,
      Production: productionByShift.get(shift)?.totals.producedQuantity ?? 0,
      Target: productionByShift.get(shift)?.totals.shiftTarget ?? 0,
      "Target Attainment (%)":
        productionByShift.get(shift)?.targetAttainment ?? "Not available",
      "Availability (%)":
        oeeByShift.get(shift)?.availability == null
          ? "Not available"
          : (oeeByShift.get(shift)?.availability ?? 0) * 100,
      "Performance (%)":
        oeeByShift.get(shift)?.performance == null
          ? "Not available"
          : (oeeByShift.get(shift)?.performance ?? 0) * 100,
      "Downtime (hours)": hours(
        downtimeByShift.get(shift)?.totals.downtimeSeconds ?? 0,
      ),
      "Financial Loss":
        downtimeByShift.get(shift)?.totals.calculatedMachineHourLoss ?? 0,
      Rejected: qualityByShift.get(shift)?.totals.rejectedQuantity ?? 0,
      Rework: qualityByShift.get(shift)?.totals.reworkedQuantity ?? 0,
      "Estimated Scrap":
        qualityByShift.get(shift)?.totals.estimatedScrap ?? 0,
    }));

    const downtimeRows = analytics.downtime.events.map((event) => ({
      "Event ID": event.id,
      Date: event.date,
      Machine: event.machine,
      Shift: event.shift,
      Product: event.productName,
      From: event.startAt,
      To: event.endAt,
      Classification: event.classification,
      "Duration (seconds)": event.durationSeconds,
      "Duration (hours)": hours(event.durationSeconds ?? 0),
      "Reason Type": event.reasonType,
      Reason: event.reason,
      Unreported: event.isUnreported ? "Yes" : "No",
      "Additional Over Time Threshold (seconds)":
        event.additionalOvertimeThresholdSeconds,
      "Machine-Hour Cost": event.machineHourCost,
      "Calculated Loss": event.calculatedMachineHourLoss,
      "Reported Loss": event.reportedMachineHourLoss,
      "Validation Findings": event.issueCodes.join(", "),
    }));

    const financialRows = [
      ...analytics.downtime.machineWise.map((item) => ({
        "Scope Type": "Machine",
        Scope: item.label,
        "Downtime (hours)": hours(item.totals.downtimeSeconds),
        "Calculated Loss": item.totals.calculatedMachineHourLoss,
        "Reported Loss": item.totals.reportedMachineHourLoss,
        "Unpriced Downtime (hours)": hours(
          item.totals.unpricedDowntimeSeconds,
        ),
      })),
      ...analytics.downtime.shiftWise.map((item) => ({
        "Scope Type": "Shift",
        Scope: item.label,
        "Downtime (hours)": hours(item.totals.downtimeSeconds),
        "Calculated Loss": item.totals.calculatedMachineHourLoss,
        "Reported Loss": item.totals.reportedMachineHourLoss,
        "Unpriced Downtime (hours)": hours(
          item.totals.unpricedDowntimeSeconds,
        ),
      })),
      ...analytics.downtime.daily.map((item) => ({
        "Scope Type": "Date",
        Scope: item.label,
        "Downtime (hours)": hours(item.totals.downtimeSeconds),
        "Calculated Loss": item.totals.calculatedMachineHourLoss,
        "Reported Loss": item.totals.reportedMachineHourLoss,
        "Unpriced Downtime (hours)": hours(
          item.totals.unpricedDowntimeSeconds,
        ),
      })),
    ];

    const qualityRows = analytics.quality.records.map((record) => ({
      "Record ID": record.id,
      Date: record.date,
      Machine: record.machine,
      Shift: record.shift,
      "Produced Quantity": record.producedQuantity,
      "Rejected Quantity": record.rejectedQuantity,
      "Rework Quantity": record.reworkedQuantity,
      "Scrap per Part": record.scrapPerPart,
      "Estimated Scrap": record.estimatedScrap,
      "Missing Entry": record.hasMissingEntry ? "Yes" : "No",
      "Possibly Unreported": record.isPossiblyUnreported ? "Yes" : "No",
      Findings: record.issueCodes.join(", "),
    }));

    const dataQualityRows = analytics.dataQuality.findings.map((finding) => ({
      Source: finding.source,
      Severity: finding.severity,
      Code: finding.code,
      Count: finding.count,
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, overview, "Daily Overview");
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(machineRows),
      "Machine Performance",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(shiftRows),
      "Shift Performance",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(downtimeRows),
      "Downtime Events",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(financialRows),
      "Financial Losses",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(dataQualityRows),
      "Data Quality",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(qualityRows),
      "Rejection Rework Scrap",
    );
    XLSX.writeFile(
      workbook,
      `MMS-Analytics-${analytics.scope.dateFrom ?? "all"}-${analytics.scope.dateTo ?? "all"}.xlsx`,
      { compression: true },
    );
  }

  if (!canonical || !analytics || !filterOptions) {
    return (
      <EmptyState
        error={loadError}
        processing={processing}
        onUpload={() => void connectWorkbook()}
        inputRef={fileInput}
        onChange={handleUpload}
      />
    );
  }

  const periodOee = analytics.availabilityPerformance.period;
  const dailyProduction = analytics.production.daily.slice(-14);
  const maxDailyTarget = Math.max(
    ...dailyProduction.map((day) => day.totals.shiftTarget),
    1,
  );
  const activeAlerts = machines.filter(
    (machine) => machine.status === "Fault" || machine.status === "Warning",
  ).length;
  const activeLabel =
    NAVIGATION.find((item) => item.id === activeTab)?.label ?? "Overview";
  const syncStatusLabel = {
    idle: "Waiting",
    syncing: "Synchronizing",
    live: "Live",
    paused: "Paused",
    stale: "Stale",
    error: "Connection error",
  }[syncState.status];
  const selectedScope =
    analytics.scope.dateFrom === analytics.scope.dateTo
      ? readableDate(analytics.scope.dateFrom)
      : `${readableDate(analytics.scope.dateFrom)} – ${readableDate(
          analytics.scope.dateTo,
        )}`;

  const renderOverview = () => (
    <div className="view-stack tab-enter">
      <section className="kpi-grid">
        <KpiCard
          label="Availability"
          value={percent(periodOee.availability)}
          detail="Operative time ÷ planned production time"
          tone="emerald"
        />
        <KpiCard
          label="Performance"
          value={percent(periodOee.performance)}
          detail="Produced quantity ÷ operative-time target"
          tone="indigo"
        />
        <KpiCard
          label="Quality"
          value="Pending"
          detail="Not included in this dashboard phase"
          tone="amber"
        />
        <KpiCard
          label="Final OEE"
          value="Pending"
          detail="Availability and Performance are verified"
          tone="rose"
        />
      </section>

      <div className="overview-grid">
        <Panel
          eyebrow="Filtered production"
          title="Output versus target"
          className="chart-panel"
          action={<span className="panel-badge">{selectedScope}</span>}
        >
          {dailyProduction.length ? (
            <>
              <div className="chart-legend">
                <span>
                  <i className="legend-production" />
                  Production
                </span>
                <span>
                  <i className="legend-target" />
                  Target
                </span>
              </div>
              <div className="comparison-chart">
                {dailyProduction.map((day) => (
                  <div className="comparison-column" key={day.key}>
                    <div className="comparison-bars">
                      <i
                        className="target-column"
                        style={{
                          height: `${Math.max(
                            4,
                            (day.totals.shiftTarget / maxDailyTarget) * 100,
                          )}%`,
                        }}
                        title={`Target: ${integerFormat.format(
                          day.totals.shiftTarget,
                        )}`}
                      />
                      <i
                        className="production-column"
                        style={{
                          height: `${Math.max(
                            4,
                            (day.totals.producedQuantity / maxDailyTarget) * 100,
                          )}%`,
                        }}
                        title={`Production: ${integerFormat.format(
                          day.totals.producedQuantity,
                        )}`}
                      />
                    </div>
                    <span>{day.label.slice(5)}</span>
                    <strong>{numberFormat.format(day.targetAttainment ?? 0)}%</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="panel-note">No production records match this selection.</p>
          )}
          <div className="chart-summary">
            <div>
              <span>Production</span>
              <strong>
                {integerFormat.format(
                  analytics.production.totals.producedQuantity,
                )}
              </strong>
            </div>
            <div>
              <span>Target</span>
              <strong>
                {integerFormat.format(analytics.production.totals.shiftTarget)}
              </strong>
            </div>
            <div>
              <span>Attainment</span>
              <strong>
                {numberFormat.format(
                  analytics.production.targetAttainment ?? 0,
                )}
                %
              </strong>
            </div>
          </div>
        </Panel>

        <Panel eyebrow="Command center" title="Filtered operational snapshot">
          <div className="quick-actions">
            <button onClick={() => setActiveTab("downtime")}>
              <span>↯</span>
              <div>
                <strong>Downtime</strong>
                <small>
                  {numberFormat.format(
                    hours(analytics.downtime.period.totals.downtimeSeconds),
                  )}{" "}
                  h classified
                </small>
              </div>
              <i>→</i>
            </button>
            <button onClick={() => setActiveTab("data-quality")}>
              <span>◇</span>
              <div>
                <strong>Data quality</strong>
                <small>
                  {integerFormat.format(analytics.dataQuality.warningCount)}{" "}
                  warnings
                </small>
              </div>
              <i>→</i>
            </button>
            <button onClick={() => setActiveTab("machines")}>
              <span>▦</span>
              <div>
                <strong>Machine states</strong>
                <small>{activeAlerts} assets require attention</small>
              </div>
              <i>→</i>
            </button>
            <button onClick={() => setActiveTab("daily-report")}>
              <span>⇩</span>
              <div>
                <strong>Export report</strong>
                <small>Seven verified Excel worksheets</small>
              </div>
              <i>→</i>
            </button>
          </div>
        </Panel>
      </div>

      <div className="overview-lower-grid">
        <Panel eyebrow="Calculated state" title="Machine status by selection">
          <div className="fleet-summary">
            {(["Running", "Idle", "Warning", "Fault"] as MachineStatus[]).map(
              (status) => {
                const count = machines.filter(
                  (machine) => machine.status === status,
                ).length;
                return (
                  <button
                    key={status}
                    onClick={() => {
                      setMachineStatus(status);
                      setActiveTab("machines");
                    }}
                  >
                    <span
                      className={`fleet-dot status-${status.toLowerCase()}`}
                    />
                    <strong>{count}</strong>
                    <small>{status}</small>
                  </button>
                );
              },
            )}
          </div>
          <p className="panel-note">
            States are calculated from filtered production, Availability,
            Performance, downtime and validation findings. They are not live PLC
            states.
          </p>
        </Panel>

        <Panel eyebrow="Management signal" title="Current findings">
          <div className="activity-feed">
            <article>
              <i className="activity-info" />
              <div>
                <span>Selection</span>
                <strong>
                  {integerFormat.format(analytics.scope.productionRecordCount)}{" "}
                  production records
                </strong>
                <p>{selectedScope}</p>
              </div>
            </article>
            <article>
              <i className="activity-critical" />
              <div>
                <span>Financial exposure</span>
                <strong>
                  {currencyFormat.format(
                    analytics.downtime.period.totals
                      .calculatedMachineHourLoss,
                  )}
                </strong>
                <p>Calculated from classified downtime and machine-hour cost.</p>
              </div>
            </article>
            <article>
              <i className="activity-warning" />
              <div>
                <span>Root-cause coverage</span>
                <strong>
                  {integerFormat.format(
                    analytics.dataQuality.unreportedDowntimeEvents,
                  )}{" "}
                  unreported events
                </strong>
                <p>Reason-wise conclusions remain provisional.</p>
              </div>
            </article>
          </div>
        </Panel>
      </div>
    </div>
  );

  const renderDowntime = () => {
    const downtime = analytics.downtime;
    const unclassifiedSeconds = downtime.events
      .filter((event) => event.classification === "unclassified")
      .reduce((sum, event) => sum + (event.durationSeconds ?? 0), 0);
    const maxMachineDowntime = Math.max(
      ...downtime.machineRanking.map((item) => item.totals.downtimeSeconds),
      1,
    );
    return (
      <div className="view-stack tab-enter">
        <section className="section-intro">
          <div>
            <span className="eyebrow">Loss intelligence</span>
            <h1>Downtime analysis</h1>
            <p>
              Threshold-classified stoppages, Pareto concentration and
              calculated machine-hour loss for the active selection.
            </p>
          </div>
        </section>

        <section className="category-grid">
          {[
            [
              "Short non-operative",
              downtime.period.totals.shortNonOperativeSeconds,
              "At or below Additional Over Time",
              "amber",
            ],
            [
              "Long downtime",
              downtime.period.totals.downtimeSeconds,
              "Above Additional Over Time",
              "rose",
            ],
            [
              "System Off",
              downtime.period.totals.reportedSystemOffSeconds,
              "Kept separate from downtime",
              "indigo",
            ],
            [
              "Unclassified",
              unclassifiedSeconds,
              "Missing usable context or threshold",
              "emerald",
            ],
          ].map(([label, seconds, note, tone]) => (
            <article
              className={`category-card category-${tone}`}
              key={String(label)}
            >
              <span>{label}</span>
              <strong>{numberFormat.format(hours(Number(seconds)))} h</strong>
              <p>{note}</p>
            </article>
          ))}
        </section>

        <div className="downtime-grid">
          <Panel eyebrow="Machine ranking" title="Highest downtime assets">
            <div className="pareto-list">
              {downtime.machineRanking.slice(0, 8).map((item, index) => (
                <article key={item.key}>
                  <span className="pareto-rank">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="pareto-name">
                    <strong>{item.label}</strong>
                    <small>{item.rawEventCount} source events</small>
                  </div>
                  <div className="pareto-track">
                    <i
                      style={{
                        width: `${Math.max(
                          3,
                          (item.totals.downtimeSeconds /
                            maxMachineDowntime) *
                            100,
                        )}%`,
                      }}
                    />
                  </div>
                  <strong>
                    {numberFormat.format(hours(item.totals.downtimeSeconds))} h
                  </strong>
                </article>
              ))}
            </div>
          </Panel>

          <Panel eyebrow="Financial exposure" title="Calculated production loss">
            <div className="loss-spotlight">
              <span>Machine-hour loss</span>
              <strong>
                {currencyFormat.format(
                  downtime.period.totals.calculatedMachineHourLoss,
                )}
              </strong>
              <p>Downtime hours × matched machine-hour cost.</p>
            </div>
            <div className="loss-list">
              {downtime.reasonPareto.slice(0, 5).map((reason) => (
                <div key={reason.reason}>
                  <span>{reason.reason}</span>
                  <strong>
                    {numberFormat.format(hours(reason.downtimeSeconds))} h
                  </strong>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel
          eyebrow="Event logger"
          title="Filtered stoppage events"
          action={
            <span className="panel-badge">
              {integerFormat.format(downtime.events.length)} events
            </span>
          }
        >
          <div className="designed-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Machine</th>
                  <th>Classification</th>
                  <th>Duration</th>
                  <th>Reason</th>
                  <th>Calculated loss</th>
                </tr>
              </thead>
              <tbody>
                {downtime.events.slice(0, 150).map((event) => (
                  <tr key={event.id}>
                    <td>{event.date ?? "Unknown"}</td>
                    <td>
                      <strong>{event.machine}</strong>
                      <small>{event.shift}</small>
                    </td>
                    <td>
                      <span className="table-chip neutral">
                        {event.classification.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td>
                      {numberFormat.format(hours(event.durationSeconds ?? 0))} h
                    </td>
                    <td className="cause-cell">{event.reason || "Missing"}</td>
                    <td>
                      {event.calculatedMachineHourLoss == null
                        ? "Unpriced"
                        : currencyFormat.format(
                            event.calculatedMachineHourLoss,
                          )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  };

  const renderDataQuality = () => (
    <div className="view-stack tab-enter">
      <section className="section-intro">
        <div>
          <span className="eyebrow">Trust layer</span>
          <h1>Data quality command center</h1>
          <p>
            Findings are recalculated from only the production and downtime
            records included by the active filters.
          </p>
        </div>
      </section>

      <section className="quality-kpi-grid">
        <KpiCard
          label="Errors"
          value={integerFormat.format(analytics.dataQuality.errorCount)}
          detail="Invalid records or calculation inputs"
          tone="rose"
        />
        <KpiCard
          label="Warnings"
          value={integerFormat.format(analytics.dataQuality.warningCount)}
          detail="Incomplete or suspicious source values"
          tone="amber"
        />
        <KpiCard
          label="Quantity mismatches"
          value={integerFormat.format(
            analytics.dataQuality.quantityMismatchRecords,
          )}
          detail="Reported Qty differs from Stroke × M. Factor"
          tone="indigo"
        />
        <KpiCard
          label="Unreported downtime"
          value={integerFormat.format(
            analytics.dataQuality.unreportedDowntimeEvents,
          )}
          detail="Downtime events without a usable reason"
          tone="emerald"
        />
      </section>

      <div className="quality-layout">
        <Panel eyebrow="Validation engine" title="Finding summary">
          <div className="anomaly-feed">
            {analytics.dataQuality.findings.slice(0, 20).map((finding) => (
              <article key={`${finding.source}:${finding.code}`}>
                <div
                  className={`anomaly-icon anomaly-${
                    finding.severity === "error"
                      ? "critical"
                      : finding.severity === "warning"
                        ? "warning"
                        : "info"
                  }`}
                >
                  !
                </div>
                <div>
                  <span>{finding.source.replaceAll("_", " ")}</span>
                  <strong>{finding.code.replaceAll("_", " ")}</strong>
                  <p>{finding.severity}</p>
                </div>
                <strong>{integerFormat.format(finding.count)}</strong>
              </article>
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Quality entry coverage" title="Rejection and rework data">
          <div className="loss-list quality-facts">
            <div>
              <span>Missing quality records</span>
              <strong>
                {integerFormat.format(
                  analytics.dataQuality.missingQualityRecords,
                )}
              </strong>
            </div>
            <div>
              <span>Possibly unreported quality</span>
              <strong>
                {integerFormat.format(
                  analytics.dataQuality.possiblyUnreportedQualityRecords,
                )}
              </strong>
            </div>
            <div>
              <span>Rejected quantity</span>
              <strong>
                {integerFormat.format(
                  analytics.quality.period.totals.rejectedQuantity,
                )}
              </strong>
            </div>
            <div>
              <span>Rework quantity</span>
              <strong>
                {integerFormat.format(
                  analytics.quality.period.totals.reworkedQuantity,
                )}
              </strong>
            </div>
            <div>
              <span>Estimated scrap</span>
              <strong>
                {numberFormat.format(
                  analytics.quality.period.totals.estimatedScrap,
                )}
              </strong>
            </div>
          </div>
          <p className="panel-note">
            No simulated sensor-health, latency, vibration or signal metrics are
            shown because those fields do not exist in the workbook.
          </p>
        </Panel>
      </div>
    </div>
  );

  const renderMachines = () => (
    <div className="view-stack tab-enter">
      <section className="section-intro machine-intro">
        <div>
          <span className="eyebrow">Asset intelligence</span>
          <h1>Machine fleet</h1>
          <p>
            Calculated states and verified operational metrics for the active
            date, shift and machine scope.
          </p>
        </div>
        <div className="machine-controls">
          <label>
            <span className="sr-only">Search machines</span>
            <input
              value={machineSearch}
              onChange={(event) => setMachineSearch(event.target.value)}
              placeholder="Search machine"
            />
          </label>
          <select
            value={machineStatus}
            onChange={(event) =>
              setMachineStatus(event.target.value as MachineStatus | "All")
            }
            aria-label="Filter calculated machine status"
          >
            <option value="All">All calculated states</option>
            <option value="Running">Running</option>
            <option value="Idle">Idle</option>
            <option value="Warning">Warning</option>
            <option value="Fault">Fault</option>
          </select>
        </div>
      </section>

      <div className="machine-layout">
        <section className="machine-grid" aria-label="Machine assets">
          {visibleMachines.map((machine) => (
            <button
              key={machine.name}
              className={`machine-card ${
                selectedMachineView?.name === machine.name ? "selected" : ""
              }`}
              onClick={() => setSelectedMachineName(machine.name)}
            >
              <div className="machine-card-head">
                <span>{machine.id}</span>
                <StatusChip status={machine.status} />
              </div>
              <div>
                <strong>{machine.name}</strong>
                <small>Calculated for current selection</small>
              </div>
              <div className="machine-card-metrics">
                <span>
                  <small>Availability</small>
                  <strong>{percent(machine.availability)}</strong>
                </span>
                <span>
                  <small>Performance</small>
                  <strong>{percent(machine.performance)}</strong>
                </span>
              </div>
              <div className="mini-progress">
                <i
                  style={{
                    width: `${Math.min(
                      Math.max((machine.availability ?? 0) * 100, 0),
                      100,
                    )}%`,
                  }}
                />
              </div>
            </button>
          ))}
        </section>

        {selectedMachineView ? (
          <aside className="machine-detail glass-panel">
            <header>
              <div>
                <span>{selectedMachineView.id} · Calculated state</span>
                <h2>{selectedMachineView.name}</h2>
              </div>
              <StatusChip status={selectedMachineView.status} />
            </header>
            <div className="verified-metric-grid">
              <article>
                <span>Production</span>
                <strong>
                  {integerFormat.format(selectedMachineView.production)}
                </strong>
                <small>
                  Target {integerFormat.format(selectedMachineView.target)}
                </small>
              </article>
              <article>
                <span>Availability</span>
                <strong>{percent(selectedMachineView.availability)}</strong>
                <small>Verified component</small>
              </article>
              <article>
                <span>Performance</span>
                <strong>{percent(selectedMachineView.performance)}</strong>
                <small>Verified component</small>
              </article>
              <article>
                <span>Downtime</span>
                <strong>
                  {numberFormat.format(selectedMachineView.downtimeHours)} h
                </strong>
                <small>
                  {currencyFormat.format(selectedMachineView.financialLoss)} loss
                </small>
              </article>
              <article>
                <span>Rejected / Rework</span>
                <strong>
                  {integerFormat.format(selectedMachineView.rejected)} /{" "}
                  {integerFormat.format(selectedMachineView.reworked)}
                </strong>
                <small>
                  Scrap {numberFormat.format(selectedMachineView.estimatedScrap)}
                </small>
              </article>
              <article>
                <span>Data findings</span>
                <strong>
                  {integerFormat.format(selectedMachineView.issueCount)}
                </strong>
                <small>
                  {selectedMachineView.unreportedEvents} unreported events
                </small>
              </article>
            </div>
            <div className="pending-row">
              <PendingMetric label="Quality" />
              <PendingMetric label="Final OEE" />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );

  const renderDailyReport = () => {
    const shiftProduction = byLabel(analytics.production.shiftWise);
    const shiftOee = byLabel(analytics.availabilityPerformance.shiftWise);
    const shiftDowntime = byLabel(analytics.downtime.shiftWise);
    const shifts = new Set([
      ...shiftProduction.keys(),
      ...shiftOee.keys(),
      ...shiftDowntime.keys(),
    ]);
    return (
      <div className="view-stack tab-enter">
        <section className="section-intro report-intro">
          <div>
            <span className="eyebrow">Management reporting</span>
            <h1>Filtered operations report</h1>
            <p>
              The report and all seven Excel worksheets use the current global
              date, shift and machine filters.
            </p>
          </div>
          <button
            className="button button-primary export-button"
            onClick={exportFilteredReport}
          >
            <span>⇩</span> Export Excel (.xlsx)
          </button>
        </section>

        <section className="report-kpi-grid">
          <KpiCard
            label="Throughput"
            value={integerFormat.format(
              analytics.production.totals.producedQuantity,
            )}
            detail={`Target ${integerFormat.format(
              analytics.production.totals.shiftTarget,
            )}`}
            tone="indigo"
          />
          <KpiCard
            label="Availability"
            value={percent(periodOee.availability)}
            detail="Verified OEE component"
            tone="emerald"
          />
          <KpiCard
            label="Performance"
            value={percent(periodOee.performance)}
            detail="Verified OEE component"
            tone="amber"
          />
          <KpiCard
            label="Downtime"
            value={`${numberFormat.format(
              hours(analytics.downtime.period.totals.downtimeSeconds),
            )} h`}
            detail={currencyFormat.format(
              analytics.downtime.period.totals.calculatedMachineHourLoss,
            )}
            tone="rose"
          />
        </section>

        <div className="report-layout">
          <Panel eyebrow="Shift performance" title="Verified component comparison">
            <div className="shift-performance">
              {[...shifts].map((shift) => {
                const production = shiftProduction.get(shift);
                const oee = shiftOee.get(shift);
                const downtime = shiftDowntime.get(shift);
                return (
                  <article key={shift}>
                    <div className="shift-name">
                      <span>{shift}</span>
                      <strong>
                        {numberFormat.format(
                          production?.targetAttainment ?? 0,
                        )}
                        %
                      </strong>
                    </div>
                    <div className="shift-values expanded-shift-values">
                      <span>
                        Output{" "}
                        <strong>
                          {integerFormat.format(
                            production?.totals.producedQuantity ?? 0,
                          )}
                        </strong>
                      </span>
                      <span>
                        Availability <strong>{percent(oee?.availability ?? null)}</strong>
                      </span>
                      <span>
                        Performance <strong>{percent(oee?.performance ?? null)}</strong>
                      </span>
                      <span>
                        Downtime{" "}
                        <strong>
                          {numberFormat.format(
                            hours(downtime?.totals.downtimeSeconds ?? 0),
                          )}{" "}
                          h
                        </strong>
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </Panel>

          <Panel eyebrow="Executive brief" title="Management summary">
            <div className="management-brief">
              <span className="brief-date">{selectedScope}</span>
              <p>
                Production reached{" "}
                <strong>
                  {integerFormat.format(
                    analytics.production.totals.producedQuantity,
                  )}
                </strong>{" "}
                against a target of{" "}
                <strong>
                  {integerFormat.format(
                    analytics.production.totals.shiftTarget,
                  )}
                </strong>
                .
              </p>
              <p>
                Availability is <strong>{percent(periodOee.availability)}</strong>{" "}
                and Performance is{" "}
                <strong>{percent(periodOee.performance)}</strong>.
              </p>
              <p>
                Calculated machine-hour loss is{" "}
                <strong>
                  {currencyFormat.format(
                    analytics.downtime.period.totals
                      .calculatedMachineHourLoss,
                  )}
                </strong>
                .
              </p>
              <div className="brief-warning">
                <i>!</i>
                <span>
                  Quality and Final OEE remain pending.{" "}
                  {integerFormat.format(
                    analytics.dataQuality.unreportedDowntimeEvents,
                  )}{" "}
                  downtime events are unreported.
                </span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="brand-lockup">
          <div className="brand-symbol">MI</div>
          <div>
            <strong>MMS Intelligence™</strong>
            <span>Industrial analytics</span>
          </div>
        </div>

        <div className="workspace-label">
          <span>Workspace</span>
          <strong>{canonical.source.company}</strong>
          <small>{machines.length} filtered assets</small>
        </div>

        <nav aria-label="Dashboard navigation">
          {NAVIGATION.map((item) => (
            <button
              key={item.id}
              className={activeTab === item.id ? "active" : ""}
              onClick={() => setActiveTab(item.id)}
              aria-current={activeTab === item.id ? "page" : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              <small>{item.shortLabel}</small>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="system-health">
            <span
              className={`health-pulse health-${syncState.status}`}
            />
            <div>
              <strong>{syncStatusLabel} synchronization</strong>
              <small>
                {sourceMode === "live-file"
                  ? "Live workbook · 60-second checks"
                  : "Uploaded snapshot · manual replacement"}
              </small>
            </div>
          </div>
        </div>
      </aside>

      <section className="dashboard-stage">
        <header className="dashboard-topbar">
          <div className="topbar-context">
            <span>Machine Monitoring System</span>
            <strong>{activeLabel}</strong>
          </div>
          <div className="topbar-actions">
            <div className={`dataset-health sync-${syncState.status}`}>
              <i />
              <span>
                <strong>{syncStatusLabel}</strong>
                <small>
                  Last sync{" "}
                  {readableTimestamp(syncState.lastSuccessfulSyncAt)}
                </small>
              </span>
            </div>
            <button
              className="button button-secondary"
              onClick={() => void syncEngine.current?.syncNow()}
              disabled={syncState.status === "syncing"}
            >
              Sync now
            </button>
            <button
              className="button button-secondary"
              onClick={() =>
                syncState.status === "paused"
                  ? syncEngine.current?.resume()
                  : syncEngine.current?.pause()
              }
            >
              {syncState.status === "paused" ? "Resume" : "Pause"}
            </button>
            <button
              className="button button-secondary"
              onClick={() => void connectWorkbook()}
              disabled={processing}
            >
              {processing ? "Processing…" : "Change workbook"}
            </button>
            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              accept=".xls,.xlsx"
              onChange={handleUpload}
              aria-label="Upload MMS workbook"
            />
          </div>
        </header>

        <section className="sync-strip" aria-label="Synchronization status">
          <div>
            <span>Source</span>
            <strong>{syncState.sourceName ?? canonical.source.fileName}</strong>
          </div>
          <div>
            <span>Last successful synchronization</span>
            <strong>
              {readableTimestamp(syncState.lastSuccessfulSyncAt)}
            </strong>
          </div>
          <div>
            <span>Last record watermark</span>
            <strong>
              {syncState.cursor.highWatermarkEpochMs == null
                ? "Not available"
                : readableTimestamp(
                    new Date(
                      syncState.cursor.highWatermarkEpochMs,
                    ).toISOString(),
                  )}
            </strong>
          </div>
          <div>
            <span>Latest change</span>
            <strong>
              +{syncState.lastChanges.added} · ~
              {syncState.lastChanges.modified} · −
              {syncState.lastChanges.removed}
            </strong>
          </div>
          <details className="sync-log-panel">
            <summary>Sync logs ({syncState.logs.length})</summary>
            <div>
              {syncState.logs
                .slice()
                .reverse()
                .slice(0, 12)
                .map((entry) => (
                  <article
                    key={entry.id}
                    className={`sync-log-${entry.level}`}
                  >
                    <span>{readableTimestamp(entry.timestamp)}</span>
                    <p>{entry.message}</p>
                  </article>
                ))}
            </div>
          </details>
        </section>

        <section className="global-filter-bar">
          <label>
            <span>Date from</span>
            <input
              type="date"
              value={dateFrom}
              min={filterOptions.dates[0]}
              max={filterOptions.dates.at(-1)}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label>
            <span>Date to</span>
            <input
              type="date"
              value={dateTo}
              min={filterOptions.dates[0]}
              max={filterOptions.dates.at(-1)}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
          <label>
            <span>Shift</span>
            <select
              value={selectedShift}
              onChange={(event) => setSelectedShift(event.target.value)}
            >
              <option value="">All shifts</option>
              {filterOptions.shifts.map((shift) => (
                <option key={shift} value={shift}>
                  {shift}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Machine</span>
            <select
              value={selectedMachine}
              onChange={(event) => setSelectedMachine(event.target.value)}
            >
              <option value="">All machines</option>
              {filterOptions.machines.map((machine) => (
                <option key={machine} value={machine}>
                  {machine}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-result">
            <span>{analytics.activeFilterCount} active filters</span>
            <strong>
              {integerFormat.format(analytics.scope.downtimeEventCount)} events
            </strong>
          </div>
          <button className="button button-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </section>

        {loadError ? <div className="error-banner">{loadError}</div> : null}
        {syncNotice ? (
          <div className="sync-notification" role="status">
            <div>
              <strong>Dashboard refreshed</strong>
              <span>{syncNotice.message}</span>
            </div>
            <button
              aria-label="Dismiss synchronization notification"
              onClick={() => setSyncNotice(null)}
            >
              ×
            </button>
          </div>
        ) : null}

        <main className="dashboard-content">
          <div className="content-frame">
            {activeTab === "overview" ? renderOverview() : null}
            {activeTab === "downtime" ? renderDowntime() : null}
            {activeTab === "data-quality" ? renderDataQuality() : null}
            {activeTab === "machines" ? renderMachines() : null}
            {activeTab === "daily-report" ? renderDailyReport() : null}
          </div>
        </main>

        <footer className="dashboard-footer">
          <div className="footer-brand">
            <span>MI</span>
            <strong>MMS Intelligence™</strong>
          </div>
          <p>
            © 2026 MMS Intelligence™. All rights reserved. MMS Intelligence™
            and associated analytics engines are registered trademarks.
          </p>
          <span>Standalone intelligence module · v1.0</span>
        </footer>
      </section>
    </div>
  );
}
