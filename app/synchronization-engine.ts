import type {
  CanonicalMmsData,
  DowntimeEvent,
  ProductionInterval,
} from "./mms.ts";
import {
  MmsDataSourceError,
  type MmsDataSource,
} from "./mms-data-source.ts";
import { safeOperationalError } from "./security.ts";

export type MmsSyncStatus =
  | "idle"
  | "syncing"
  | "live"
  | "paused"
  | "stale"
  | "error";

export type MmsSyncLogLevel = "info" | "success" | "warning" | "error";

export type MmsSyncLogEntry = {
  id: string;
  timestamp: string;
  level: MmsSyncLogLevel;
  message: string;
};

export type MmsSyncCursor = {
  snapshotSequence: number;
  lastProcessedRecordKey: string | null;
  highWatermarkEpochMs: number | null;
  productionRecordCount: number;
  downtimeRecordCount: number;
};

export type MmsSyncChanges = {
  added: number;
  modified: number;
  removed: number;
  unchanged: number;
  duplicateKeys: number;
  changed: boolean;
};

export type MmsImportHistoryEntry = {
  id: string;
  sourceName: string;
  completedAt: string;
  status: "changed" | "unchanged" | "failed";
  productionRecordCount: number;
  downtimeRecordCount: number;
  changes: MmsSyncChanges;
  error: string | null;
};

export type MmsSyncState = {
  status: MmsSyncStatus;
  sourceName: string | null;
  lastAttemptAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastDataChangeAt: string | null;
  nextSyncAt: string | null;
  consecutiveFailures: number;
  cursor: MmsSyncCursor;
  lastChanges: MmsSyncChanges;
  error: string | null;
  logs: MmsSyncLogEntry[];
  history: MmsImportHistoryEntry[];
};

export type MmsSynchronizationOptions = {
  pollIntervalMs?: number;
  staleAfterMs?: number;
  retryDelaysMs?: readonly number[];
  logRetentionMs?: number;
  maxLogEntries?: number;
  initialLogs?: readonly MmsSyncLogEntry[];
  initialHistory?: readonly MmsImportHistoryEntry[];
  historyRetentionMs?: number;
  maxHistoryEntries?: number;
  now?: () => Date;
  wait?: (milliseconds: number) => Promise<void>;
  onData?: (
    data: CanonicalMmsData,
    changes: MmsSyncChanges,
    state: MmsSyncState,
  ) => void;
  onState?: (state: MmsSyncState) => void;
};

type IndexedRecord = {
  key: string;
  fingerprint: string;
  timestamp: number | null;
};

type SnapshotIndex = Map<string, IndexedRecord>;

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_STALE_AFTER_MS = 5 * 60_000;
const DEFAULT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000] as const;
const DEFAULT_LOG_RETENTION_MS = 24 * 60 * 60_000;
const DEFAULT_MAX_LOG_ENTRIES = 250;
const DEFAULT_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60_000;
const DEFAULT_MAX_HISTORY_ENTRIES = 100;

const EMPTY_CHANGES: MmsSyncChanges = {
  added: 0,
  modified: 0,
  removed: 0,
  unchanged: 0,
  duplicateKeys: 0,
  changed: false,
};

const EMPTY_CURSOR: MmsSyncCursor = {
  snapshotSequence: 0,
  lastProcessedRecordKey: null,
  highWatermarkEpochMs: null,
  productionRecordCount: 0,
  downtimeRecordCount: 0,
};

export function createInitialMmsSyncState(
  initialLogs: readonly MmsSyncLogEntry[] = [],
  initialHistory: readonly MmsImportHistoryEntry[] = [],
): MmsSyncState {
  return {
    status: "idle",
    sourceName: null,
    lastAttemptAt: null,
    lastSuccessfulSyncAt: null,
    lastDataChangeAt: null,
    nextSyncAt: null,
    consecutiveFailures: 0,
    cursor: { ...EMPTY_CURSOR },
    lastChanges: { ...EMPTY_CHANGES },
    error: null,
    logs: [...initialLogs],
    history: [...initialHistory],
  };
}

function productionKey(record: ProductionInterval): string {
  return [
    "production",
    record.machine,
    record.shift,
    record.startAt,
    record.product.partNumber,
    record.product.productName,
  ].join("|");
}

function downtimeKey(record: DowntimeEvent): string {
  return [
    "downtime",
    record.machine,
    record.shift,
    record.startAt,
    record.productName,
  ].join("|");
}

function recordFingerprint(
  record: ProductionInterval | DowntimeEvent,
): string {
  return JSON.stringify(record);
}

export function indexMmsSnapshot(data: CanonicalMmsData): {
  index: SnapshotIndex;
  duplicateKeys: number;
} {
  const index: SnapshotIndex = new Map();
  let duplicateKeys = 0;

  function add(
    baseKey: string,
    record: ProductionInterval | DowntimeEvent,
  ): void {
    let key = baseKey;
    if (index.has(key)) {
      duplicateKeys += 1;
      key = `${baseKey}|duplicate-row:${record.sourceRow}`;
      let suffix = 2;
      while (index.has(key)) {
        key = `${baseKey}|duplicate-row:${record.sourceRow}:${suffix}`;
        suffix += 1;
      }
    }
    index.set(key, {
      key,
      fingerprint: recordFingerprint(record),
      timestamp: record.endEpochMs ?? record.startEpochMs,
    });
  }

  for (const record of data.productionIntervals) {
    add(productionKey(record), record);
  }
  for (const record of data.downtimeEvents) {
    add(downtimeKey(record), record);
  }
  return { index, duplicateKeys };
}

export function reconcileMmsSnapshots(
  previous: SnapshotIndex | null,
  data: CanonicalMmsData,
): {
  index: SnapshotIndex;
  changes: MmsSyncChanges;
  lastProcessedRecordKey: string | null;
  highWatermarkEpochMs: number | null;
} {
  const current = indexMmsSnapshot(data);
  let added = 0;
  let modified = 0;
  let unchanged = 0;
  let removed = 0;

  for (const [key, record] of current.index) {
    const oldRecord = previous?.get(key);
    if (!oldRecord) added += 1;
    else if (oldRecord.fingerprint !== record.fingerprint) modified += 1;
    else unchanged += 1;
  }
  if (previous) {
    for (const key of previous.keys()) {
      if (!current.index.has(key)) removed += 1;
    }
  }

  const ordered = [...current.index.values()].sort((left, right) => {
    const timestampDifference =
      (left.timestamp ?? Number.NEGATIVE_INFINITY) -
      (right.timestamp ?? Number.NEGATIVE_INFINITY);
    return timestampDifference || left.key.localeCompare(right.key);
  });
  const highWatermarkEpochMs = ordered.reduce<number | null>(
    (latest, record) =>
      record.timestamp != null && (latest == null || record.timestamp > latest)
        ? record.timestamp
        : latest,
    null,
  );

  return {
    index: current.index,
    changes: {
      added,
      modified,
      removed,
      unchanged,
      duplicateKeys: current.duplicateKeys,
      changed: previous == null || added > 0 || modified > 0 || removed > 0,
    },
    lastProcessedRecordKey: ordered.at(-1)?.key ?? null,
    highWatermarkEpochMs,
  };
}

function publicState(state: MmsSyncState): MmsSyncState {
  return {
    ...state,
    cursor: { ...state.cursor },
    lastChanges: { ...state.lastChanges },
    logs: [...state.logs],
    history: state.history.map((entry) => ({
      ...entry,
      changes: { ...entry.changes },
    })),
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof MmsDataSourceError) {
    return safeOperationalError(
      error,
      "Synchronization failed while reading the MMS source.",
    );
  }
  return "Synchronization failed while reading the MMS source.";
}

function isRetryable(error: unknown): boolean {
  return (
    (error instanceof MmsDataSourceError && error.retryable) ||
    error instanceof TypeError
  );
}

export class MmsSynchronizationEngine {
  readonly #source: MmsDataSource;
  readonly #pollIntervalMs: number;
  readonly #staleAfterMs: number;
  readonly #retryDelaysMs: readonly number[];
  readonly #logRetentionMs: number;
  readonly #maxLogEntries: number;
  readonly #historyRetentionMs: number;
  readonly #maxHistoryEntries: number;
  readonly #now: () => Date;
  readonly #wait: (milliseconds: number) => Promise<void>;
  readonly #onData?: MmsSynchronizationOptions["onData"];
  readonly #onState?: MmsSynchronizationOptions["onState"];
  #state: MmsSyncState;
  #index: SnapshotIndex | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #running = false;
  #inFlight: Promise<void> | null = null;
  #logSequence = 0;

  constructor(
    source: MmsDataSource,
    options: MmsSynchronizationOptions = {},
  ) {
    this.#source = source;
    this.#pollIntervalMs = Math.max(
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      1_000,
    );
    this.#staleAfterMs = Math.max(
      options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS,
      this.#pollIntervalMs,
    );
    this.#retryDelaysMs =
      options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.#logRetentionMs =
      options.logRetentionMs ?? DEFAULT_LOG_RETENTION_MS;
    this.#maxLogEntries =
      options.maxLogEntries ?? DEFAULT_MAX_LOG_ENTRIES;
    this.#historyRetentionMs =
      options.historyRetentionMs ?? DEFAULT_HISTORY_RETENTION_MS;
    this.#maxHistoryEntries =
      options.maxHistoryEntries ?? DEFAULT_MAX_HISTORY_ENTRIES;
    this.#now = options.now ?? (() => new Date());
    this.#wait =
      options.wait ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#onData = options.onData;
    this.#onState = options.onState;
    this.#state = {
      ...createInitialMmsSyncState(
        options.initialLogs,
        options.initialHistory,
      ),
      sourceName: source.name,
    };
    this.#pruneLogs();
    this.#pruneHistory();
  }

  get state(): MmsSyncState {
    return publicState(this.#state);
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#addLog("info", `Automatic synchronization started for ${this.#source.name}.`);
    void this.syncNow();
  }

  pause(): void {
    this.#running = false;
    this.#clearTimer();
    this.#state = {
      ...this.#state,
      status: "paused",
      nextSyncAt: null,
    };
    this.#addLog("warning", "Automatic synchronization paused by the user.");
    this.#emit();
  }

  resume(): void {
    if (this.#running) return;
    this.#running = true;
    this.#addLog("info", "Automatic synchronization resumed.");
    void this.syncNow();
  }

  stop(): void {
    this.#running = false;
    this.#clearTimer();
  }

  async syncNow(): Promise<void> {
    if (this.#inFlight) return this.#inFlight;
    this.#clearTimer();
    this.#inFlight = this.#performSync().finally(() => {
      this.#inFlight = null;
      if (this.#running) this.#scheduleNext();
    });
    return this.#inFlight;
  }

  #scheduleNext(): void {
    this.#clearTimer();
    const next = new Date(this.#now().getTime() + this.#pollIntervalMs);
    this.#state = { ...this.#state, nextSyncAt: next.toISOString() };
    this.#emit();
    this.#timer = setTimeout(() => void this.syncNow(), this.#pollIntervalMs);
  }

  #clearTimer(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  async #performSync(): Promise<void> {
    const attemptAt = this.#now();
    this.#state = {
      ...this.#state,
      status: "syncing",
      lastAttemptAt: attemptAt.toISOString(),
      nextSyncAt: null,
      error: null,
    };
    this.#emit();

    let data: CanonicalMmsData | null = null;
    let finalError: unknown = null;
    const attempts = this.#retryDelaysMs.length + 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        data = await this.#source.load();
        finalError = null;
        break;
      } catch (error) {
        finalError = error;
        const retryDelay = this.#retryDelaysMs[attempt];
        if (
          retryDelay == null ||
          !isRetryable(error)
        ) {
          break;
        }
        this.#addLog(
          "warning",
          `Temporary source failure. Retrying in ${Math.round(retryDelay / 1_000)} seconds.`,
        );
        await this.#wait(retryDelay);
      }
    }

    if (!data) {
      const failedAt = this.#now();
      const lastSuccess = this.#state.lastSuccessfulSyncAt
        ? new Date(this.#state.lastSuccessfulSyncAt).getTime()
        : null;
      const stale =
        lastSuccess != null &&
        failedAt.getTime() - lastSuccess >= this.#staleAfterMs;
      const synchronizationError = errorMessage(finalError);
      this.#state = {
        ...this.#state,
        status: stale ? "stale" : "error",
        consecutiveFailures: this.#state.consecutiveFailures + 1,
        error: synchronizationError,
      };
      this.#addHistory({
        id: `import-${failedAt.getTime()}-failed`,
        sourceName: this.#source.name,
        completedAt: failedAt.toISOString(),
        status: "failed",
        productionRecordCount: this.#state.cursor.productionRecordCount,
        downtimeRecordCount: this.#state.cursor.downtimeRecordCount,
        changes: { ...EMPTY_CHANGES },
        error: synchronizationError,
      });
      this.#addLog("error", synchronizationError);
      this.#emit();
      return;
    }

    const completedAt = this.#now();
    const reconciliation = reconcileMmsSnapshots(this.#index, data);
    this.#index = reconciliation.index;
    const nextCursor: MmsSyncCursor = {
      snapshotSequence: this.#state.cursor.snapshotSequence + 1,
      lastProcessedRecordKey: reconciliation.lastProcessedRecordKey,
      highWatermarkEpochMs: reconciliation.highWatermarkEpochMs,
      productionRecordCount: data.productionIntervals.length,
      downtimeRecordCount: data.downtimeEvents.length,
    };
    this.#state = {
      ...this.#state,
      status: this.#running ? "live" : "paused",
      lastSuccessfulSyncAt: completedAt.toISOString(),
      lastDataChangeAt: reconciliation.changes.changed
        ? completedAt.toISOString()
        : this.#state.lastDataChangeAt,
      consecutiveFailures: 0,
      cursor: nextCursor,
      lastChanges: reconciliation.changes,
      error: null,
    };
    this.#addHistory({
      id: `import-${completedAt.getTime()}-${nextCursor.snapshotSequence}`,
      sourceName: this.#source.name,
      completedAt: completedAt.toISOString(),
      status: reconciliation.changes.changed ? "changed" : "unchanged",
      productionRecordCount: data.productionIntervals.length,
      downtimeRecordCount: data.downtimeEvents.length,
      changes: { ...reconciliation.changes },
      error: null,
    });
    if (reconciliation.changes.changed) {
      this.#addLog(
        "success",
        `Synchronized ${reconciliation.changes.added} new, ${reconciliation.changes.modified} modified and ${reconciliation.changes.removed} removed records.`,
      );
      this.#onData?.(data, reconciliation.changes, this.state);
    } else {
      this.#addLog("info", "Synchronization completed with no record changes.");
    }
    if (reconciliation.changes.duplicateKeys > 0) {
      this.#addLog(
        "warning",
        `${reconciliation.changes.duplicateKeys} duplicate synchronization keys were isolated.`,
      );
    }
    this.#emit();
  }

  #addLog(level: MmsSyncLogLevel, message: string): void {
    const now = this.#now();
    this.#logSequence += 1;
    this.#state = {
      ...this.#state,
      logs: [
        ...this.#state.logs,
        {
          id: `${now.getTime()}-${this.#logSequence}`,
          timestamp: now.toISOString(),
          level,
          message,
        },
      ],
    };
    this.#pruneLogs();
  }

  #pruneLogs(): void {
    const oldestAllowed = this.#now().getTime() - this.#logRetentionMs;
    this.#state = {
      ...this.#state,
      logs: this.#state.logs
        .filter((entry) => new Date(entry.timestamp).getTime() >= oldestAllowed)
        .slice(-this.#maxLogEntries),
    };
  }

  #addHistory(entry: MmsImportHistoryEntry): void {
    this.#state = {
      ...this.#state,
      history: [...this.#state.history, entry],
    };
    this.#pruneHistory();
  }

  #pruneHistory(): void {
    const oldestAllowed = this.#now().getTime() - this.#historyRetentionMs;
    this.#state = {
      ...this.#state,
      history: this.#state.history
        .filter(
          (entry) =>
            new Date(entry.completedAt).getTime() >= oldestAllowed,
        )
        .slice(-this.#maxHistoryEntries),
    };
  }

  #emit(): void {
    this.#onState?.(this.state);
  }
}
