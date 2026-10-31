"use client";

import { useState } from "react";
import { useApiResource } from "@/hooks/useApiResource";
import { api } from "@/lib/api";
import { formatDate, shortHash } from "@/lib/format";
import { Button, PageHeader, Panel, Stat } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import snapshot from "@/lib/snapshot.json";

function statusOf(verification) {
  if (!verification) return { label: "unverified", tone: "text-amber" };
  if (verification.integrity !== "valid") {
    return { label: "rejected", tone: "text-danger" };
  }
  if (verification.revoked) return { label: "valid · revoked", tone: "text-amber" };
  if (verification.expired) return { label: "valid · expired", tone: "text-amber" };
  return { label: "valid · active", tone: "text-teal" };
}

const DEFAULT_REASONS = {
  vouch: "newcomer_sponsor_vouch",
  denounce: "repeated_low_quality_patch",
  revoke: "corrected_evidence",
};

function RecordForm({ projects, defaultProjectId, onSigned }) {
  const [type, setType] = useState("vouch");
  const [issuerProjectId, setIssuerProjectId] = useState("");
  const [subjectContributorId, setSubjectContributorId] = useState("c_new_good");
  const [reasonCode, setReasonCode] = useState(DEFAULT_REASONS.vouch);
  const [evidenceRef, setEvidenceRef] = useState("manually signed demo record");
  const [subjectRecordId, setSubjectRecordId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const issuer = issuerProjectId || defaultProjectId || projects[0]?.id || "";
  const revokeNeedsRecord = type === "revoke";
  const canSubmit =
    Boolean(issuer) &&
    subjectContributorId.trim().length > 0 &&
    reasonCode.trim().length > 0 &&
    (!revokeNeedsRecord || subjectRecordId.trim().length > 0) &&
    !busy;

  function changeType(nextType) {
    setType(nextType);
    setResult(null);
    setError(null);
    if (Object.values(DEFAULT_REASONS).includes(reasonCode) || !reasonCode.trim()) {
      setReasonCode(DEFAULT_REASONS[nextType]);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = {
        issuerProjectId: issuer,
        subjectContributorId: subjectContributorId.trim(),
        type,
        reasonCode: reasonCode.trim(),
        evidence: evidenceRef.trim()
          ? [{ kind: "note", ref: evidenceRef.trim() }]
          : [],
      };
      if (revokeNeedsRecord) body.subjectRecordId = subjectRecordId.trim();
      const response = await api.postRecord(body);
      setResult(response);
      onSigned?.(response);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Add a signed note"
      description="A record is a signed note a project adds to its list: support, a concern, or a correction. This only changes the demo's in-memory data; rebuild from the Simulator to reset."
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <label
              htmlFor="record-type"
              className="block text-[10px] uppercase tracking-wide text-muted"
            >
              What kind of note
            </label>
            <select
              id="record-type"
              value={type}
              onChange={(event) => changeType(event.target.value)}
              data-testid="record-type"
              className="mt-1 min-h-9 w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-xs text-ink"
            >
              <option value="vouch">vouch (support someone)</option>
              <option value="denounce">denounce (raise a concern)</option>
              <option value="revoke">revoke (cancel an earlier note)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="record-issuer"
              className="block text-[10px] uppercase tracking-wide text-muted"
            >
              Signed by project
            </label>
            <select
              id="record-issuer"
              value={issuer}
              onChange={(event) => setIssuerProjectId(event.target.value)}
              data-testid="record-issuer"
              className="mt-1 min-h-9 w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-xs text-ink"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.id} · {project.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="record-subject"
              className="block text-[10px] uppercase tracking-wide text-muted"
            >
              Person&apos;s id
            </label>
            <input
              id="record-subject"
              value={subjectContributorId}
              onChange={(event) => setSubjectContributorId(event.target.value)}
              data-testid="record-subject"
              placeholder="c_new_good"
              className="mt-1 min-h-9 w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-xs text-ink"
            />
          </div>

          <div>
            <label
              htmlFor="record-reason"
              className="block text-[10px] uppercase tracking-wide text-muted"
            >
              Reason
            </label>
            <input
              id="record-reason"
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value)}
              data-testid="record-reason"
              className="mt-1 min-h-9 w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-xs text-ink"
            />
          </div>

          <div>
            <label
              htmlFor="record-evidence"
              className="block text-[10px] uppercase tracking-wide text-muted"
            >
              Evidence note
            </label>
            <input
              id="record-evidence"
              value={evidenceRef}
              onChange={(event) => setEvidenceRef(event.target.value)}
              data-testid="record-evidence"
              className="mt-1 min-h-9 w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-xs text-ink"
            />
          </div>

          {revokeNeedsRecord && (
            <div>
              <label
                htmlFor="record-subject-record"
                className="block text-[10px] uppercase tracking-wide text-muted"
              >
                Note to cancel
              </label>
              <input
                id="record-subject-record"
                value={subjectRecordId}
                onChange={(event) => setSubjectRecordId(event.target.value)}
                data-testid="record-subject-record"
                placeholder="r_p10_1"
                className="mt-1 min-h-9 w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-xs text-ink"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canSubmit} data-testid="record-submit">
            {busy ? "Signing…" : `Sign ${type}`}
          </Button>
          <p className="text-[10px] text-muted">
            {revokeNeedsRecord
              ? "A revocation must reference a record issued by the same project."
              : "Denouncements need evidence; a single weak signal cannot flag an account."}
          </p>
        </div>

        {result && (
          <p
            role="status"
            data-testid="record-result"
            className="break-words rounded border border-teal/40 bg-teal/5 px-3 py-2 font-mono text-[10px] text-teal"
          >
            Signed {result.record?.type} · {result.record?.id} · signature{" "}
            {result.verification?.signatureValid ? "valid" : "invalid"} ·{" "}
            {result.verification?.active ? "active" : "inactive"}
          </p>
        )}
        {error && (
          <p
            role="alert"
            data-testid="record-error"
            className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger"
          >
            {error.message}
            {error.code ? ` (${error.code})` : ""}
          </p>
        )}
      </form>
    </Panel>
  );
}

export function RecordsView({
  version,
  projectId: selectedProjectId = "",
  tamper = "none",
  onProjectChange,
  onTamperChange,
  onRecordChange,
}) {
  const summaries = useApiResource(
    (signal) => api.getRecordSummaries(signal),
    `record-summaries:${version}`,
    version === 0 ? snapshot.recordSummaries : null,
  );

  const fallbackProjectId =
    summaries.data?.defaultProjectId ??
    summaries.data?.projects?.find(
      (project) =>
        (project.counts?.valid ?? 0) + (project.counts?.invalid ?? 0) > 0,
    )?.id ??
    "";
  const effectiveProjectId = selectedProjectId || fallbackProjectId;

  const records = useApiResource(
    (signal) =>
      effectiveProjectId
        ? api.getRecords(effectiveProjectId, tamper, signal)
        : Promise.resolve(null),
    `records:${effectiveProjectId}:${tamper}:${version}`,
    version === 0 && effectiveProjectId === "p07"
      ? snapshot.records[tamper]
      : null,
  );

  const typeTotals = (summaries.data?.projects ?? []).reduce(
    (totals, project) => {
      for (const [type, count] of Object.entries(project.types ?? {})) {
        totals[type] = (totals[type] ?? 0) + count;
      }
      return totals;
    },
    {},
  );

  const summariesLoading = summaries.loading && !summaries.data;
  const log = records.data?.log;
  const counts = log?.counts;

  return (
    <div className="min-w-0">
      <PageHeader
        title="Records"
        description="Each project keeps a list of signed notes that cannot be quietly edited. Every note is checked again when another project reads the list."
      >
        <span
          className="rounded border border-teal/40 bg-teal/10 px-2 py-1 font-mono text-[10px] text-teal"
          data-testid="records-summary"
        >
          {typeTotals.vouch ?? 0} vouch · {typeTotals.denounce ?? 0} denounce ·{" "}
          {typeTotals.revoke ?? 0} revoke
        </span>
      </PageHeader>

      <div
        className="mb-4 grid grid-cols-2 divide-x divide-y divide-line rounded-lg border border-line bg-panel sm:grid-cols-4 sm:divide-y-0"
        data-testid="record-type-totals"
      >
        <Stat
          label="Vouches"
          value={typeTotals.vouch ?? 0}
          hint="signed support notes"
        />
        <Stat
          label="Denouncements"
          value={typeTotals.denounce ?? 0}
          hint="signed concern notes"
        />
        <Stat
          label="Revocations"
          value={typeTotals.revoke ?? 0}
          hint="notes that correct an earlier one"
        />
        <Stat
          label="Logs checked"
          value={summaries.data?.projects?.length ?? 0}
          hint="one per project"
        />
      </div>

      <div className="mb-4">
        <RecordForm
          projects={summaries.data?.projects ?? []}
          defaultProjectId={effectiveProjectId}
          onSigned={(response) => {
            const issuer = response?.record?.issuerProjectId;
            if (issuer) onProjectChange?.(issuer);
            onRecordChange?.();
          }}
        />
      </div>

      {summariesLoading ? (
        <LoadingState label="Loading record logs" />
      ) : summaries.error && !summaries.data ? (
        <ErrorState error={summaries.error} onRetry={summaries.refetch} />
      ) : records.error && !records.data ? (
        <ErrorState error={records.error} onRetry={records.refetch} />
      ) : (
        <>
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
            onChange={(event) => onProjectChange?.(event.target.value)}
            className="mt-1 min-h-9 max-w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-xs text-ink"
          >
            {(summaries.data?.projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.id} · {project.name} ·{" "}
                {(project.counts?.valid ?? 0) + (project.counts?.invalid ?? 0)}{" "}
                record(s) · {project.types?.vouch ?? 0} vouch /{" "}
                {project.types?.denounce ?? 0} denounce
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
                onClick={() => onTamperChange?.(mode.id)}
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
              ? "Each note is checked against the one before it and the project's signature."
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
        </>
      )}
    </div>
  );
}
