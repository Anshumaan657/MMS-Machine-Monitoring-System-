"use client";

import {
  ChangeEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ExcelMmsDataSource,
  type MmsDataSource,
  type MmsDataSourceKind,
} from "./mms-data-source";
import {
  getMmsFilterOptions,
  queryMmsAnalytics,
} from "./mms";
import {
  createInitialMmsSyncState,
  MmsSynchronizationEngine,
} from "./synchronization-engine";
import {
  DEFAULT_OPERATIONAL_ALERT_CONFIG,
  OPERATIONAL_ALERT_LABELS,
  buildOperationalAlerts,
  normalizeOperationalAlertConfig,
} from "./operational-alert-engine";
import {
  buildDeterministicManagementSummary,
  buildVerifiedManagementEvidence,
  managementEvidenceMap,
  type EvidenceBackedStatement,
  type ManagementRecommendation,
  type ManagementSummary,
  type VerifiedManagementEvidence,
} from "./management-summary-engine";
import { downloadFilteredReport } from "./report-export";
import {
  persistMmsAnalyticsFilters,
  restoreMmsAnalyticsFilters,
} from "./analytics-filter-state";
import type {
  CanonicalMmsData,
  DowntimeAggregate,
  FilteredMmsAnalytics,
  OeeAggregate,
  ProductionQueryAggregate,
} from "./mms";
import type {
  AlertAcknowledgements,
  AlertMetricValue,
  OperationalAlert,
  OperationalAlertConfig,
  OperationalAlertSeverity,
  OperationalAlertType,
} from "./operational-alert-engine";
import type {
  MmsSyncChanges,
  MmsSyncLogEntry,
  MmsSyncState,
} from "./synchronization-engine";

export type DashboardTab =
  | "overview"
  | "alerts"
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
  quality: number | null;
  finalOee: number | null;
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

type ManagementSummaryApiResponse = {
  summary: ManagementSummary;
  fallbackReason: string | null;
};

const SYNC_LOG_STORAGE_KEY = "mms-intelligence-sync-logs-v1";
const ALERT_CONFIG_STORAGE_KEY = "mms-intelligence-alert-config-v1";
const ALERT_ACKNOWLEDGEMENT_STORAGE_KEY =
  "mms-intelligence-alert-acknowledgements-v1";
const SYNC_POLL_INTERVAL_MS = 60_000;
const SYNC_STALE_AFTER_MS = 5 * 60_000;

const ALERT_THRESHOLD_FIELDS: Array<{
  key: keyof OperationalAlertConfig["thresholds"];
  label: string;
  unit: string;
  storedPerDisplayUnit: number;
  step: number;
}> = [
  {
    key: "excessiveDowntimeSeconds",
    label: "Excessive downtime",
    unit: "minutes",
    storedPerDisplayUnit: 60,
    step: 1,
  },
  {
    key: "systemOffSeconds",
    label: "System Off",
    unit: "minutes",
    storedPerDisplayUnit: 60,
    step: 1,
  },
  {
    key: "minimumProductionAttainment",
    label: "Minimum production attainment",
    unit: "percent",
    storedPerDisplayUnit: 0.01,
    step: 1,
  },
  {
    key: "maximumCycleTimeRatio",
    label: "Maximum cycle-time ratio",
    unit: "× standard",
    storedPerDisplayUnit: 1,
    step: 0.05,
  },
  {
    key: "highProductionLossQuantity",
    label: "High production loss",
    unit: "quantity",
    storedPerDisplayUnit: 1,
    step: 1,
  },
  {
    key: "highMachineHourLoss",
    label: "High machine-hour loss",
    unit: "INR",
    storedPerDisplayUnit: 1,
    step: 100,
  },
];

const NAVIGATION: NavigationItem[] = [
  { id: "overview", label: "Overview", shortLabel: "OV", icon: "⌁" },
  { id: "alerts", label: "Operational Alerts", shortLabel: "AL", icon: "!" },
  { id: "downtime", label: "Downtime", shortLabel: "DT", icon: "↯" },
  { id: "data-quality", label: "Data Quality", shortLabel: "DQ", icon: "◇" },
  { id: "machines", label: "Machines", shortLabel: "MC", icon: "▦" },
  { id: "daily-report", label: "Daily Report", shortLabel: "DR", icon: "▤" },
];

function EvidenceChips({
  statement,
  evidence,
}: {
  statement: EvidenceBackedStatement | ManagementRecommendation;
  evidence: VerifiedManagementEvidence;
}) {
  const lookup = managementEvidenceMap(evidence);
  return (
    <div className="summary-evidence">
      {statement.evidenceIds.map((id) => {
        const item = lookup.get(id);
        return item ? (
          <span key={id} title={`${item.label} · ${id}`}>
            <b>{item.label}</b>
            {item.display}
          </span>
        ) : null;
      })}
    </div>
  );
}

function SummaryStatements({
  statements,
  evidence,
}: {
  statements: EvidenceBackedStatement[];
  evidence: VerifiedManagementEvidence;
}) {
  if (!statements.length) return <p className="summary-empty">No finding.</p>;
  return (
    <div className="summary-statement-list">
      {statements.map((statement, index) => (
        <article key={`${statement.text}-${index}`}>
          <p>{statement.text}</p>
          <EvidenceChips statement={statement} evidence={evidence} />
        </article>
      ))}
    </div>
  );
}

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

function readAlertConfig(): OperationalAlertConfig {
  if (typeof window === "undefined") return DEFAULT_OPERATIONAL_ALERT_CONFIG;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(ALERT_CONFIG_STORAGE_KEY) ?? "{}",
    );
    return normalizeOperationalAlertConfig(stored);
  } catch {
    return DEFAULT_OPERATIONAL_ALERT_CONFIG;
  }
}

function readAlertAcknowledgements(): AlertAcknowledgements {
  if (typeof window === "undefined") return {};
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(ALERT_ACKNOWLEDGEMENT_STORAGE_KEY) ?? "{}",
    );
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

function readDashboardFilters(): {
  dateFrom: string;
  dateTo: string;
  shift: string;
  machine: string;
} {
  if (typeof window === "undefined") {
    return { dateFrom: "", dateTo: "", shift: "", machine: "" };
  }
  try {
    const filters = restoreMmsAnalyticsFilters(window.localStorage);
    const shifts = Array.isArray(filters.shift)
      ? filters.shift
      : filters.shift
        ? [filters.shift]
        : [];
    const machines = Array.isArray(filters.machine)
      ? filters.machine
      : filters.machine
        ? [filters.machine]
        : [];
    return {
      dateFrom: filters.dateRange?.from ?? "",
      dateTo: filters.dateRange?.to ?? "",
      shift: shifts[0] ?? "",
      machine: machines[0] ?? "",
    };
  } catch {
    return { dateFrom: "", dateTo: "", shift: "", machine: "" };
  }
}

function formatAlertMetric(metric: AlertMetricValue): string {
  if (typeof metric.value === "number") {
    return `${numberFormat.format(metric.value)} ${metric.unit}`;
  }
  return `${metric.value ?? "Not available"} · ${metric.unit}`;
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
  const policyOee = byLabel(analytics.oee.machineWise);
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
    ...policyOee.keys(),
  ]);

  return [...names]
    .sort((left, right) => left.localeCompare(right))
    .map((name, index) => {
      const productionValue = production.get(name);
      const oeeValue = oee.get(name);
      const downtimeValue = downtime.get(name);
      const qualityValue = quality.get(name);
      const policyOeeValue = policyOee.get(name);
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
        quality: policyOeeValue?.quality ?? null,
        finalOee: policyOeeValue?.finalOee ?? null,
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
  const [initialFilters] = useState(readDashboardFilters);
  const [canonical, setCanonical] = useState<CanonicalMmsData | null>(null);
  const [processing, setProcessing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [dateFrom, setDateFrom] = useState(initialFilters.dateFrom);
  const [dateTo, setDateTo] = useState(initialFilters.dateTo);
  const [selectedShift, setSelectedShift] = useState(initialFilters.shift);
  const [selectedMachine, setSelectedMachine] = useState(
    initialFilters.machine,
  );
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
  const [sourceKind, setSourceKind] =
    useState<MmsDataSourceKind>("excel");
  const [alertConfig, setAlertConfig] = useState<OperationalAlertConfig>(
    () => readAlertConfig(),
  );
  const [alertAcknowledgements, setAlertAcknowledgements] =
    useState<AlertAcknowledgements>(() => readAlertAcknowledgements());
  const [selectedAlertType, setSelectedAlertType] = useState<
    OperationalAlertType | "All"
  >("All");
  const [selectedAlertSeverity, setSelectedAlertSeverity] = useState<
    OperationalAlertSeverity | "All"
  >("All");
  const [showAcknowledgedAlerts, setShowAcknowledgedAlerts] = useState(true);
  const [aiManagementSummary, setAiManagementSummary] =
    useState<ManagementSummary | null>(null);
  const [managementSummaryLoading, setManagementSummaryLoading] =
    useState(false);
  const [managementSummaryNotice, setManagementSummaryNotice] = useState("");
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
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        ALERT_CONFIG_STORAGE_KEY,
        JSON.stringify(alertConfig),
      );
    } catch {
      // Alert calculation continues with in-memory configuration.
    }
  }, [alertConfig]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const bounded = Object.fromEntries(
        Object.entries(alertAcknowledgements).slice(-2_000),
      );
      window.localStorage.setItem(
        ALERT_ACKNOWLEDGEMENT_STORAGE_KEY,
        JSON.stringify(bounded),
      );
    } catch {
      // Acknowledgements remain available for the current browser session.
    }
  }, [alertAcknowledgements]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      persistMmsAnalyticsFilters(window.localStorage, {
        dateRange: {
          from: dateFrom || null,
          to: dateTo || null,
        },
        shift: selectedShift || null,
        machine: selectedMachine || null,
      });
    } catch {
      // Filters remain active in memory when device storage is unavailable.
    }
  }, [dateFrom, dateTo, selectedMachine, selectedShift]);

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
  const managementEvidence = useMemo(
    () => (analytics ? buildVerifiedManagementEvidence(analytics) : null),
    [analytics],
  );
  const deterministicManagementSummary = useMemo(
    () =>
      managementEvidence
        ? buildDeterministicManagementSummary(managementEvidence)
        : null,
    [managementEvidence],
  );
  const machines = useMemo(
    () => (analytics ? buildMachineViews(analytics) : []),
    [analytics],
  );
  const operationalAlerts = useMemo(
    () =>
      canonical
        ? buildOperationalAlerts(canonical, alertConfig, {
            acknowledgements: alertAcknowledgements,
            synchronization: {
              sourceKind,
              sourceName: syncState.sourceName,
              status: syncState.status,
              lastAttemptAt: syncState.lastAttemptAt,
              error: syncState.error,
            },
            analytics: analytics ?? undefined,
          })
        : [],
    [
      alertAcknowledgements,
      alertConfig,
      analytics,
      canonical,
      sourceKind,
      syncState.error,
      syncState.lastAttemptAt,
      syncState.sourceName,
      syncState.status,
    ],
  );
  const scopedOperationalAlerts = useMemo(
    () =>
      operationalAlerts.filter((alert) => {
        if (dateFrom && alert.date && alert.date < dateFrom) return false;
        if (dateTo && alert.date && alert.date > dateTo) return false;
        if (
          selectedShift &&
          alert.shift !== selectedShift &&
          alert.shift !== "All shifts"
        ) {
          return false;
        }
        if (
          selectedMachine &&
          alert.machine !== selectedMachine &&
          alert.machine !== "All machines"
        ) {
          return false;
        }
        return true;
      }),
    [
      dateFrom,
      dateTo,
      operationalAlerts,
      selectedMachine,
      selectedShift,
    ],
  );
  const visibleOperationalAlerts = useMemo(
    () =>
      scopedOperationalAlerts.filter(
        (alert) =>
          (selectedAlertType === "All" ||
            alert.type === selectedAlertType) &&
          (selectedAlertSeverity === "All" ||
            alert.severity === selectedAlertSeverity) &&
          (showAcknowledgedAlerts ||
            alert.acknowledgementState === "unacknowledged"),
      ),
    [
      scopedOperationalAlerts,
      selectedAlertSeverity,
      selectedAlertType,
      showAcknowledgedAlerts,
    ],
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

  async function requestAiManagementSummary(): Promise<void> {
    if (!managementEvidence) return;
    setManagementSummaryLoading(true);
    setManagementSummaryNotice("");
    try {
      const response = await fetch("/api/management-summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evidence: managementEvidence }),
      });
      const result = (await response.json()) as
        | ManagementSummaryApiResponse
        | { error?: string };
      if (!response.ok || !("summary" in result)) {
        throw new Error(
          "error" in result && result.error
            ? result.error
            : "Management summary request failed.",
        );
      }
      setAiManagementSummary(result.summary);
      setManagementSummaryNotice(
        result.fallbackReason
          ? `Verified deterministic fallback used: ${result.fallbackReason}`
          : "AI narrative validated against the verified evidence contract.",
      );
    } catch (error) {
      setAiManagementSummary(null);
      setManagementSummaryNotice(
        `Verified deterministic fallback used: ${
          error instanceof Error ? error.message : "AI service unavailable."
        }`,
      );
    } finally {
      setManagementSummaryLoading(false);
    }
  }

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
    setSourceKind(source.kind);
    if (!hadDataset) {
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

  function acknowledgeAlerts(alerts: OperationalAlert[]): void {
    const acknowledgedAt = new Date().toISOString();
    setAlertAcknowledgements((current) => {
      const next = { ...current };
      for (const alert of alerts) next[alert.id] = acknowledgedAt;
      return Object.fromEntries(Object.entries(next).slice(-2_000));
    });
  }

  function updateAlertThreshold(
    key: keyof OperationalAlertConfig["thresholds"],
    value: number,
  ): void {
    setAlertConfig((current) =>
      normalizeOperationalAlertConfig({
        ...current,
        thresholds: {
          ...current.thresholds,
          [key]: value,
        },
      }),
    );
  }

  function toggleAlertType(type: OperationalAlertType): void {
    setAlertConfig((current) => ({
      ...current,
      enabled: {
        ...current.enabled,
        [type]: !current.enabled[type],
      },
    }));
  }

  function exportFilteredReport() {
    if (!canonical || !analytics) return;
    downloadFilteredReport({
      analytics,
      company: canonical.source.company,
      sourceFileName: canonical.source.fileName,
      selectedShift,
      selectedMachine,
      machines,
    });
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
  const machineAttentionCount = machines.filter(
    (machine) => machine.status === "Fault" || machine.status === "Warning",
  ).length;
  const unacknowledgedAlertCount = scopedOperationalAlerts.filter(
    (alert) => alert.acknowledgementState === "unacknowledged",
  ).length;
  const criticalAlertCount = scopedOperationalAlerts.filter(
    (alert) =>
      alert.severity === "critical" &&
      alert.acknowledgementState === "unacknowledged",
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
          value={percent(analytics.oee.period.quality)}
          detail="(Reported − rejected − rework) ÷ reported"
          tone="amber"
        />
        <KpiCard
          label="Final OEE"
          value={percent(analytics.oee.period.finalOee)}
          detail="Availability × Performance × Quality"
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
            <button onClick={() => setActiveTab("alerts")}>
              <span>!</span>
              <div>
                <strong>Operational alerts</strong>
                <small>
                  {unacknowledgedAlertCount} unacknowledged ·{" "}
                  {criticalAlertCount} critical
                </small>
              </div>
              <i>→</i>
            </button>
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
                <small>{machineAttentionCount} assets require attention</small>
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

  const renderAlerts = () => {
    const acknowledgedCount = scopedOperationalAlerts.length -
      unacknowledgedAlertCount;
    const displayedAlerts = visibleOperationalAlerts.slice(0, 200);
    return (
      <div className="view-stack tab-enter">
        <section className="section-intro alert-intro">
          <div>
            <span className="eyebrow">Operational response</span>
            <h1>Alert center</h1>
            <p>
              Record-level operational conditions for the active date, shift
              and machine selection. Every alert links back to its source row.
            </p>
          </div>
          <button
            className="button button-primary"
            onClick={() =>
              acknowledgeAlerts(
                visibleOperationalAlerts
                  .filter(
                    (alert) =>
                      alert.acknowledgementState === "unacknowledged",
                  )
                  .slice(0, 200),
              )
            }
            disabled={unacknowledgedAlertCount === 0}
          >
            Acknowledge visible
          </button>
        </section>

        <section className="kpi-grid alert-kpi-grid">
          <KpiCard
            label="Unacknowledged"
            value={integerFormat.format(unacknowledgedAlertCount)}
            detail="Active alerts awaiting review"
            tone="rose"
          />
          <KpiCard
            label="Critical"
            value={integerFormat.format(criticalAlertCount)}
            detail="Unacknowledged critical conditions"
            tone="amber"
          />
          <KpiCard
            label="Acknowledged"
            value={integerFormat.format(acknowledgedCount)}
            detail="Reviewed on this device"
            tone="emerald"
          />
          <KpiCard
            label="Total active"
            value={integerFormat.format(scopedOperationalAlerts.length)}
            detail="Alerts in the current global scope"
            tone="indigo"
          />
        </section>

        <section className="alert-toolbar glass-panel">
          <label>
            <span>Alert type</span>
            <select
              value={selectedAlertType}
              onChange={(event) =>
                setSelectedAlertType(
                  event.target.value as OperationalAlertType | "All",
                )
              }
            >
              <option value="All">All alert types</option>
              {(
                Object.entries(OPERATIONAL_ALERT_LABELS) as Array<
                  [OperationalAlertType, string]
                >
              ).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Severity</span>
            <select
              value={selectedAlertSeverity}
              onChange={(event) =>
                setSelectedAlertSeverity(
                  event.target.value as OperationalAlertSeverity | "All",
                )
              }
            >
              <option value="All">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
            </select>
          </label>
          <label className="alert-checkbox">
            <input
              type="checkbox"
              checked={showAcknowledgedAlerts}
              onChange={(event) =>
                setShowAcknowledgedAlerts(event.target.checked)
              }
            />
            <span>Show acknowledged alerts</span>
          </label>
          <div className="filter-result">
            <span>Displaying</span>
            <strong>
              {integerFormat.format(
                Math.min(visibleOperationalAlerts.length, 200),
              )}{" "}
              of {integerFormat.format(visibleOperationalAlerts.length)}
            </strong>
          </div>
        </section>

        <div className="alert-layout">
          <Panel
            eyebrow="Active conditions"
            title="Supporting operational records"
          >
            {displayedAlerts.length ? (
              <div className="operational-alert-list">
                {displayedAlerts.map((alert) => (
                  <article
                    key={alert.id}
                    className={`operational-alert alert-${alert.severity} ${
                      alert.acknowledgementState === "acknowledged"
                        ? "alert-acknowledged"
                        : ""
                    }`}
                  >
                    <div className="alert-record-head">
                      <div>
                        <span>{alert.type.replaceAll("_", " ")}</span>
                        <strong>{alert.title}</strong>
                      </div>
                      <span className={`alert-severity ${alert.severity}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <p>{alert.message}</p>
                    <div className="alert-context-grid">
                      <span>
                        <small>Machine</small>
                        <strong>{alert.machine}</strong>
                      </span>
                      <span>
                        <small>Shift</small>
                        <strong>{alert.shift}</strong>
                      </span>
                      <span>
                        <small>Time</small>
                        <strong>{readableTimestamp(alert.time)}</strong>
                      </span>
                      <span>
                        <small>Triggering value</small>
                        <strong>
                          {formatAlertMetric(alert.triggeringValue)}
                        </strong>
                      </span>
                      <span>
                        <small>Threshold</small>
                        <strong>{formatAlertMetric(alert.threshold)}</strong>
                      </span>
                      <span>
                        <small>Supporting record</small>
                        <strong>
                          {alert.supportingRecord.sheet}
                          {alert.supportingRecord.rowNumber == null
                            ? ""
                            : ` · row ${alert.supportingRecord.rowNumber}`}
                        </strong>
                      </span>
                    </div>
                    <footer>
                      <span>
                        Status: {alert.status} ·{" "}
                        {alert.acknowledgementState}
                      </span>
                      {alert.acknowledgementState === "unacknowledged" ? (
                        <button
                          className="button button-secondary"
                          onClick={() => acknowledgeAlerts([alert])}
                        >
                          Acknowledge
                        </button>
                      ) : (
                        <small>
                          Acknowledged{" "}
                          {readableTimestamp(alert.acknowledgedAt)}
                        </small>
                      )}
                    </footer>
                  </article>
                ))}
              </div>
            ) : (
              <p className="panel-note">
                No operational alerts match the current filters.
              </p>
            )}
          </Panel>

          <aside>
            <details className="alert-settings glass-panel" open>
              <summary>Alert thresholds</summary>
              <p>
                Settings are stored only on this browser and apply to every
                compatible MMS workbook.
              </p>
              <div className="alert-threshold-grid">
                {ALERT_THRESHOLD_FIELDS.map((field) => (
                  <label key={field.key}>
                    <span>{field.label}</span>
                    <div>
                      <input
                        type="number"
                        min="0"
                        step={field.step}
                        value={
                          alertConfig.thresholds[field.key] /
                          field.storedPerDisplayUnit
                        }
                        onChange={(event) =>
                          updateAlertThreshold(
                            field.key,
                            Number(event.target.value) *
                              field.storedPerDisplayUnit,
                          )
                        }
                      />
                      <small>{field.unit}</small>
                    </div>
                  </label>
                ))}
              </div>
              <button
                className="button button-secondary"
                onClick={() =>
                  setAlertConfig(DEFAULT_OPERATIONAL_ALERT_CONFIG)
                }
              >
                Restore defaults
              </button>
            </details>

            <details className="alert-settings glass-panel">
              <summary>Enabled alert rules</summary>
              <div className="alert-rule-list">
                {(
                  Object.entries(OPERATIONAL_ALERT_LABELS) as Array<
                    [OperationalAlertType, string]
                  >
                ).map(([type, label]) => (
                  <label key={type}>
                    <input
                      type="checkbox"
                      checked={alertConfig.enabled[type]}
                      onChange={() => toggleAlertType(type)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </details>
          </aside>
        </div>
      </div>
    );
  };

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
              <div className="pending-metric">
                <span>Quality</span>
                <strong>{percent(selectedMachineView.quality)}</strong>
                <small>3D-confirmed direct-quantity policy</small>
              </div>
              <div className="pending-metric">
                <span>Final OEE</span>
                <strong>{percent(selectedMachineView.finalOee)}</strong>
                <small>Availability × Performance × Quality</small>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );

  const renderDailyReport = () => {
    const shiftProduction = byLabel(analytics.production.shiftWise);
    const shiftOee = byLabel(analytics.availabilityPerformance.shiftWise);
    const shiftPolicyOee = byLabel(analytics.oee.shiftWise);
    const shiftDowntime = byLabel(analytics.downtime.shiftWise);
    const shifts = new Set([
      ...shiftProduction.keys(),
      ...shiftOee.keys(),
      ...shiftPolicyOee.keys(),
      ...shiftDowntime.keys(),
    ]);
    const managementSummary =
      aiManagementSummary?.evidenceDigest === managementEvidence?.evidenceDigest
        ? aiManagementSummary
        : deterministicManagementSummary;
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
                const policyOee = shiftPolicyOee.get(shift);
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
                        Quality <strong>{percent(policyOee?.quality ?? null)}</strong>
                      </span>
                      <span>
                        Final OEE <strong>{percent(policyOee?.finalOee ?? null)}</strong>
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

          <Panel
            eyebrow="Executive brief"
            title="Evidence-backed management summary"
            action={
              <button
                className="button button-secondary summary-generate-button"
                disabled={managementSummaryLoading}
                onClick={() => void requestAiManagementSummary()}
              >
                {managementSummaryLoading ? "Validating…" : "Generate AI narrative"}
              </button>
            }
          >
            {managementSummary && managementEvidence ? (
              <div className="management-brief">
                <div className="summary-meta">
                  <span className="brief-date">{selectedScope}</span>
                  <span
                    className={`summary-source ${managementSummary.source}`}
                  >
                    {managementSummary.source === "ai"
                      ? `AI · ${managementSummary.model}`
                      : "Verified deterministic"}
                  </span>
                </div>
                <h3>{managementSummary.title}</h3>
                <SummaryStatements
                  statements={managementSummary.executiveSummary}
                  evidence={managementEvidence}
                />

                <details className="summary-details" open>
                  <summary>Production losses and comparisons</summary>
                  <SummaryStatements
                    statements={[
                      ...managementSummary.productionLosses,
                      ...managementSummary.comparisons,
                    ]}
                    evidence={managementEvidence}
                  />
                </details>
                <details className="summary-details">
                  <summary>Bottlenecks and downtime concentration</summary>
                  <SummaryStatements
                    statements={managementSummary.bottlenecks}
                    evidence={managementEvidence}
                  />
                </details>
                <details className="summary-details">
                  <summary>Data reliability</summary>
                  <SummaryStatements
                    statements={managementSummary.dataCaveats}
                    evidence={managementEvidence}
                  />
                </details>
                <div className="summary-recommendations">
                  <strong>Evidence-backed recommendations</strong>
                  {managementSummary.recommendations.map(
                    (recommendation, index) => (
                      <article key={`${recommendation.text}-${index}`}>
                        <span className={`priority-${recommendation.priority}`}>
                          {recommendation.priority}
                        </span>
                        <p>{recommendation.text}</p>
                        <EvidenceChips
                          statement={recommendation}
                          evidence={managementEvidence}
                        />
                      </article>
                    ),
                  )}
                </div>
                <div className="brief-warning">
                  <i>✓</i>
                  <span>
                    Quality and Final OEE use the 3D-confirmed calculation
                    policy. The AI is not permitted to recalculate figures;
                    exact values come only from verified analytics evidence.
                  </span>
                </div>
                {managementSummaryNotice ? (
                  <p className="summary-notice" role="status">
                    {managementSummaryNotice}
                  </p>
                ) : null}
              </div>
            ) : null}
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
            {analytics ? (
              <small title={analytics.calculationPolicy.description}>
                Calculation policy {analytics.calculationPolicy.version} ·{" "}
                {analytics.calculationPolicy.status.replaceAll("_", " ")}
              </small>
            ) : null}
          </div>
          <div className="topbar-actions">
            <button
              className="topbar-alert-count"
              onClick={() => setActiveTab("alerts")}
              aria-label={`${unacknowledgedAlertCount} unacknowledged operational alerts`}
            >
              <span>!</span>
              <strong>{integerFormat.format(unacknowledgedAlertCount)}</strong>
              <small>alerts</small>
            </button>
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
            {activeTab === "alerts" ? renderAlerts() : null}
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
