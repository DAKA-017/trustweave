"use client";

import { useState } from "react";
import { useApiResource } from "@/hooks/useApiResource";
import { api } from "@/lib/api";
import { formatDate, shortHash } from "@/lib/format";
import { PageHeader, Panel, Stat } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";

function statusOf(verification) {
  if (!verification) return { label: "unverified", tone: "text-amber" };
  if (verification.integrity !== "valid") {
    return { label: "rejected", tone: "text-danger" };
  }
  if (verification.revoked) return { label: "valid · revoked", tone: "text-amber" };
  if (verification.expired) return { label: "valid · expired", tone: "text-amber" };
  return { label: "valid · active", tone: "text-teal" };
}

export function RecordsView({ version }) {
  const summaries = useApiResource(
    (signal) => api.getRecordSummaries(signal),
    `record-summaries:${version}`,
  );
  const [projectId, setProjectId] = useState("");
  const [tamper, setTamper] = useState("none");

  const fallbackProjectId =
    summaries.data?.projects?.find(
      (project) =>
        (project.counts?.valid ?? 0) + (project.counts?.invalid ?? 0) >= 3,
    )?.id ??
    summaries.data?.defaultProjectId ??
    "";
  const effectiveProjectId = projectId || fallbackProjectId;

  const records = useApiResource(
    (signal) =>
      effectiveProjectId
        ? api.getRecords(effectiveProjectId, tamper, signal)
        : Promise.resolve(null),
    `records:${effectiveProjectId}:${tamper}:${version}`,
  );

  if (summaries.loading && !summaries.data) {
    return <LoadingState label="Loading record logs" />;
  }
  if (summaries.error) {
    return (
      <ErrorState error={summaries.error} onRetry={summaries.refetch} />
    );
  }
  if (records.error) {
    return <ErrorState error={records.error} onRetry={records.refetch} />;
  }

  const log = records.data?.log;
  const counts = log?.counts;

  return (
    <div className="min-w-0">
      <PageHeader
        title="Records"
        description="Each project keeps an append-only hash chain. Every record is signed with its issuer's Ed25519 key and verified again when another project pulls the log."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-panel p-4">
        <div className="min-w-0">
          <label
            htmlFor="records-project"
            className="block text-[10px] uppercase tracking-wide text-muted"
          >
            Project log
          </label>
          <select
            id="records-project"
            value={effectiveProjectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="mt-1 min-h-9 max-w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-xs text-ink"
          >
            {(summaries.data?.projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.id} · {project.name} ·{" "}
                {(project.counts?.valid ?? 0) + (project.counts?.invalid ?? 0)}{" "}
                record(s)
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="block text-[10px] uppercase tracking-wide text-muted">
            Verification mode
          </span>
          <div
            role="group"
            aria-label="Record verification mode"
            className="mt-1 flex flex-wrap gap-1"
          >
            {[
              { id: "none", label: "Verified" },
              { id: "signature", label: "Tamper signature" },
              { id: "chain", label: "Break chain" },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                aria-pressed={tamper === mode.id}
                onClick={() => setTamper(mode.id)}
                className={`min-h-9 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  tamper === mode.id
                    ? "border-amber/50 bg-amber/10 text-amber"
                    : "border-line-strong text-muted hover:text-ink"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tamper !== "none" && (
        <div className="mb-4 rounded-lg border border-amber/40 bg-amber/5 px-4 py-3">
          <p className="text-xs font-medium text-amber">
            Tamper demo: verification is running on a modified copy of the log.
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            The stored log is unchanged. Rejected entries below show which check
            failed, so invalid records are visible rather than silently dropped.
          </p>
        </div>
      )}

      {records.loading && !records.data ? (
        <LoadingState label="Verifying the log" />
      ) : !log ? (
        <EmptyState title="No log loaded" />
      ) : (
        <Panel
          title={`${records.data.project.name} · ${records.data.project.id}`}
          description={
            tamper === "none"
              ? "Every entry is verified against the previous hash and the issuer signature."
              : "Demonstration only. Stored records were not modified."
          }
          actions={
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[10px] ${
                log.valid
                  ? "border-teal/40 bg-teal/10 text-teal"
                  : "border-danger/45 bg-danger/10 text-danger"
              }`}
            >
              {log.valid ? "log valid" : "log rejected"}
            </span>
          }
          contentClassName="p-0"
        >
          <div className="grid grid-cols-2 divide-x divide-line border-b border-line sm:grid-cols-5">
            <Stat label="Entries" value={log.entries.length} />
            <Stat label="Valid" value={counts?.valid ?? 0} />
            <Stat label="Invalid" value={counts?.invalid ?? 0} />
            <Stat label="Expired" value={counts?.expired ?? 0} />
            <Stat label="Revoked" value={counts?.revoked ?? 0} />
          </div>

          {log.entries.length === 0 ? (
            <div className="p-4">
              <EmptyState title="This project has no records" />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {log.entries.map((entry) => {
                const { record, verification } = entry;
                const status = statusOf(verification);
                return (
                  <li key={record.id} className="min-w-0 px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] text-muted">
                            #{entry.index}
                          </span>
                          <span className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink">
                            {record.type}
                          </span>
                          <span className="break-all font-mono text-[11px] text-ink">
                            {record.id}
                          </span>
                        </div>
                        <p className="mt-1 break-words text-xs text-muted">
                          subject {record.subjectContributorId} ·{" "}
                          {record.reasonCode} · {formatDate(record.createdAt)}
                          {record.expiresAt
                            ? ` · expires ${formatDate(record.expiresAt)}`
                            : ""}
                        </p>
                      </div>
                      <span className={`font-mono text-[10px] ${status.tone}`}>
                        {status.label}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted">
                      <span>signature {verification?.signatureValid ? "ok" : "invalid"}</span>
                      <span>hash {verification?.hashIntact ? "intact" : "mismatch"}</span>
                      <span>chain {verification?.chainIntact ? "intact" : "broken"}</span>
                      <span>prev {shortHash(record.previousRecordHash, 16)}</span>
                      <span>entry {shortHash(entry.hash, 16)}</span>
                      <span>{record.evidence.length} evidence ref(s)</span>
                    </div>

                    {verification?.issues?.length > 0 && (
                      <p className="mt-2 break-words rounded border border-danger/40 bg-danger/5 px-2 py-1 font-mono text-[10px] text-danger">
                        rejected: {verification.issues.join(", ")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        {records.data?.note ??
          "Verification status is computed from the log copy returned by this request."}
      </p>
    </div>
  );
}
