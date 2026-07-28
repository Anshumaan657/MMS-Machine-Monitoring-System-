"use client";

import type { FilteredMmsAnalytics } from "./mms";
import type { OperationalAlert } from "./operational-alert-engine";
import type { ManagementSummary } from "./management-summary-engine";

export type PrintableMachine = {
  name: string;
  status: string;
  production: number;
  target: number;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  finalOee: number | null;
  downtimeHours: number;
  financialLoss: number;
};

export type PrintableReportMetadata = {
  company: string;
  plant?: string | null;
  sourceFileName: string;
  generatedAt: string;
  lastSuccessfulSyncAt: string | null;
  dataSource: string;
};

export type PrintableMmsReportProps = {
  analytics: FilteredMmsAnalytics;
  machines: PrintableMachine[];
  alerts: OperationalAlert[];
  managementSummary: ManagementSummary | null;
  metadata: PrintableReportMetadata;
};

const integer = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function percentage(value: number | null): string {
  return value == null ? "Not available" : `${decimal.format(value * 100)}%`;
}

function duration(seconds: number): string {
  return `${decimal.format(seconds / 3_600)} h`;
}

function list(values: string[]): string {
  return values.length ? values.join(", ") : "All";
}

function readableTime(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-IN");
}

export function PrintableMmsReport({
  analytics,
  machines,
  alerts,
  managementSummary,
  metadata,
}: PrintableMmsReportProps) {
  const policyIsProvisional = analytics.calculationPolicy.status !== "confirmed";
  const period = analytics.availabilityPerformance.period;
  const quality = analytics.quality.period.totals;
  const topReasons = analytics.downtime.reasonPareto.slice(0, 10);
  const findings = analytics.dataQuality.structuredFindings.slice(0, 100);

  return (
    <article className="print-report" aria-label="Printable MMS report">
      {policyIsProvisional ? (
        <div className="print-watermark" aria-hidden="true">
          PROVISIONAL
        </div>
      ) : null}

      <header className="print-cover">
        <div>
          <span>MMS Intelligence™</span>
          <h1>Operational Analytics Report</h1>
          <p>{metadata.company}</p>
        </div>
        <dl>
          <div>
            <dt>Report period</dt>
            <dd>
              {analytics.scope.dateFrom ?? "All"} to{" "}
              {analytics.scope.dateTo ?? "All"}
            </dd>
          </div>
          <div>
            <dt>Generated</dt>
            <dd>{readableTime(metadata.generatedAt)}</dd>
          </div>
          <div>
            <dt>Last synchronization</dt>
            <dd>{readableTime(metadata.lastSuccessfulSyncAt)}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{metadata.sourceFileName}</dd>
          </div>
        </dl>
      </header>

      <section className="print-section">
        <header>
          <span>01</span>
          <h2>Scope and verified performance</h2>
        </header>
        <div className="print-filter-grid">
          <div><span>Shifts</span><strong>{list(analytics.filters.shifts)}</strong></div>
          <div><span>Machines</span><strong>{list(analytics.filters.machines)}</strong></div>
          <div><span>Products</span><strong>{list(analytics.filters.products)}</strong></div>
          <div><span>Operators</span><strong>{list(analytics.filters.operators)}</strong></div>
          <div><span>Downtime reasons</span><strong>{list(analytics.filters.downtimeReasons)}</strong></div>
          <div><span>Data source</span><strong>{metadata.dataSource}</strong></div>
        </div>
        <div className="print-kpi-grid">
          <div><span>Production</span><strong>{integer.format(analytics.production.totals.producedQuantity)}</strong></div>
          <div><span>Shift target</span><strong>{integer.format(analytics.production.totals.shiftTarget)}</strong></div>
          <div><span>Availability</span><strong>{percentage(period.availability)}</strong></div>
          <div><span>Performance</span><strong>{percentage(period.performance)}</strong></div>
          <div><span>Quality</span><strong>{percentage(analytics.oee.period.quality)}</strong></div>
          <div><span>Final OEE</span><strong>{percentage(analytics.oee.period.finalOee)}</strong></div>
        </div>
        <div className="print-policy-note">
          <strong>
            Policy {analytics.calculationPolicy.version} ·{" "}
            {analytics.calculationPolicy.status.replaceAll("_", " ")}
          </strong>
          <span>{analytics.calculationPolicy.description}</span>
        </div>
      </section>

      <section className="print-section print-landscape">
        <header>
          <span>02</span>
          <h2>Machine and shift comparison</h2>
        </header>
        <table>
          <thead>
            <tr>
              <th>Machine</th>
              <th>State</th>
              <th>Output</th>
              <th>Target</th>
              <th>Availability</th>
              <th>Performance</th>
              <th>Quality</th>
              <th>Final OEE</th>
              <th>Downtime</th>
              <th>Loss</th>
            </tr>
          </thead>
          <tbody>
            {machines.map((machine) => (
              <tr key={machine.name}>
                <td>{machine.name}</td>
                <td>{machine.status}</td>
                <td>{integer.format(machine.production)}</td>
                <td>{integer.format(machine.target)}</td>
                <td>{percentage(machine.availability)}</td>
                <td>{percentage(machine.performance)}</td>
                <td>{percentage(machine.quality)}</td>
                <td>{percentage(machine.finalOee)}</td>
                <td>{decimal.format(machine.downtimeHours)} h</td>
                <td>{currency.format(machine.financialLoss)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="print-section">
        <header>
          <span>03</span>
          <h2>Downtime, quality and financial exposure</h2>
        </header>
        <div className="print-kpi-grid compact">
          <div><span>Downtime</span><strong>{duration(analytics.downtime.period.totals.downtimeSeconds)}</strong></div>
          <div><span>System Off</span><strong>{duration(analytics.downtime.period.totals.reportedSystemOffSeconds)}</strong></div>
          <div><span>Machine-hour loss</span><strong>{currency.format(analytics.downtime.period.totals.calculatedMachineHourLoss)}</strong></div>
          <div><span>Rejected</span><strong>{integer.format(quality.rejectedQuantity)}</strong></div>
          <div><span>Rework</span><strong>{integer.format(quality.reworkedQuantity)}</strong></div>
          <div><span>Estimated scrap</span><strong>{decimal.format(quality.estimatedScrap)}</strong></div>
        </div>
        <h3>Downtime reason Pareto</h3>
        <table>
          <thead>
            <tr><th>Reason</th><th>Events</th><th>Downtime</th><th>Share</th></tr>
          </thead>
          <tbody>
            {topReasons.map((reason) => (
              <tr key={reason.reason}>
                <td>{reason.reason}</td>
                <td>{integer.format(reason.eventCount)}</td>
                <td>{duration(reason.downtimeSeconds)}</td>
                <td>{decimal.format(reason.downtimePercentage)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="print-section print-landscape">
        <header>
          <span>04</span>
          <h2>Alerts and data-quality evidence</h2>
        </header>
        <h3>Operational alerts</h3>
        <table>
          <thead>
            <tr>
              <th>Severity</th><th>Machine</th><th>Shift</th><th>Alert</th>
              <th>Time</th><th>Status</th><th>Source</th>
            </tr>
          </thead>
          <tbody>
            {alerts.slice(0, 100).map((alert) => (
              <tr key={alert.id}>
                <td>{alert.severity}</td>
                <td>{alert.machine}</td>
                <td>{alert.shift}</td>
                <td>{alert.title}</td>
                <td>{readableTime(alert.time)}</td>
                <td>{alert.acknowledgementState}</td>
                <td>{alert.supportingRecord.sheet} row {alert.supportingRecord.rowNumber ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Data-quality findings</h3>
        <table>
          <thead>
            <tr>
              <th>Severity</th><th>Code</th><th>Machine</th><th>Shift</th>
              <th>Product</th><th>Source</th><th>Field</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((finding) => (
              <tr key={finding.id}>
                <td>{finding.severity}</td>
                <td>{finding.code}</td>
                <td>{finding.machine}</td>
                <td>{finding.shift}</td>
                <td>{finding.product}</td>
                <td>{finding.sourceSheet} row {finding.sourceRow}</td>
                <td>{finding.fieldName}</td>
                <td>{finding.recommendedAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {managementSummary ? (
        <section className="print-section">
          <header>
            <span>05</span>
            <h2>Evidence-backed management summary</h2>
          </header>
          <h3>{managementSummary.title}</h3>
          <ul>
            {managementSummary.executiveSummary.map((item, index) => (
              <li key={`${item.text}-${index}`}>{item.text}</li>
            ))}
          </ul>
          <h3>Recommended actions</h3>
          <ol>
            {managementSummary.recommendations.map((item, index) => (
              <li key={`${item.text}-${index}`}>
                <strong>{item.priority.toUpperCase()}:</strong> {item.text}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <footer className="print-report-footer">
        <span>MMS Intelligence™ · {metadata.company}</span>
        <span>Confidential operational report</span>
        <span className="print-page-number" />
      </footer>
    </article>
  );
}
