import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Loader2, Route, Search } from "lucide-react";
import { apiFetch } from "../api/client";
import DataTable from "../components/DataTable";
import ModalitySelect from "../components/forms/ModalitySelect";
import DestinationNodePicker from "../components/nodes/DestinationNodePicker";
import NodeSelectField from "../components/nodes/NodeSelectField";
import TagMorphingRulePicker from "../components/tagMorphing/TagMorphingRulePicker";
import ActionButton from "../components/ui/ActionButton";
import DateRangeField from "../components/ui/DateRangeField";
import Modal from "../components/Modal";
import PageHeader from "../components/ui/PageHeader";
import { PageLoading } from "../components/ui/LoadingScreen";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { formatNotificationMessage } from "../lib/notificationMessages";
import { isSameNodePair, migrationSourceNodes, SAME_NODE_PAIR_MESSAGE } from "../lib/nodes";
import { useNotifications } from "../services/notifications";
import {
  Node,
  SourceStudy,
  SourceStudyActionResult,
  SourceStudyList,
  TagMorphingRule,
} from "../types/api";
import { TableColumnPrefs } from "../lib/tableColumnPrefs";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const STUDY_BROWSER_COLUMN_DEFAULTS: TableColumnPrefs = {
  hidden: [
    "study_uid",
    "patient_birth_date",
    "acquisition_date",
    "referring_physician",
    "station_name",
    "body_part_examined",
    "protocol_name",
    "acquisition_description",
    "requested_procedure",
    "patient_location",
  ],
  pinned: {},
};

function cellText(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function toQidoDate(iso: string): string | null {
  if (!iso) return null;
  return iso.replace(/-/g, "");
}

function formatStudyDateTime(study: SourceStudy): string {
  if (!study.study_date) return "—";
  if (study.study_time) {
    return `${study.study_date} ${study.study_time}`;
  }
  return study.study_date;
}

function SelectAllHeader({
  checked,
  indeterminate,
  disabled,
  onToggle,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      aria-label="Select all on page"
      checked={checked}
      disabled={disabled}
      onChange={onToggle}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

export default function StudyBrowser() {
  const queryClient = useQueryClient();
  const { success, warning, error: notifyError } = useNotifications();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [sourceNodeId, setSourceNodeId] = useState("");
  const [draftSourceNodeId, setDraftSourceNodeId] = useState("");
  const [modality, setModality] = useState("");
  const [patientId, setPatientId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [searchNonce, setSearchNonce] = useState(0);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [migrateName, setMigrateName] = useState("");
  const [migrateDestinationIds, setMigrateDestinationIds] = useState<string[]>([]);
  const [migrateMorphIds, setMigrateMorphIds] = useState<string[]>([]);

  const { data: nodes = [] } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => apiFetch<Node[]>("/api/v1/nodes"),
  });

  const { data: morphRules = [] } = useQuery({
    queryKey: ["tag-morphing-rules"],
    queryFn: () => apiFetch<TagMorphingRule[]>("/api/v1/tag-morphing-rules"),
  });

  const sourceNodes = useMemo(() => migrationSourceNodes(nodes), [nodes]);

  useEffect(() => {
    setPage(0);
    setSelectedUids(new Set());
  }, [sourceNodeId, modality, patientId, dateFrom, dateTo, pageSize, searchNonce]);

  const studiesQuery = useQuery({
    queryKey: [
      "source-studies",
      sourceNodeId,
      modality,
      patientId,
      dateFrom,
      dateTo,
      pageSize,
      page,
      searchNonce,
    ],
    enabled: Boolean(sourceNodeId) && searchNonce > 0,
    queryFn: () => {
      const params = new URLSearchParams({
        source_node_id: sourceNodeId,
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (modality) params.set("modality", modality);
      if (patientId.trim()) params.set("patient_id", patientId.trim());
      const from = toQidoDate(dateFrom);
      const to = toQidoDate(dateTo);
      if (from) params.set("date_from", from);
      if (to) params.set("date_to", to);
      return apiFetch<SourceStudyList>(`/api/v1/source-studies?${params}`);
    },
  });

  const studies = studiesQuery.data?.items ?? [];
  const hasMore = studiesQuery.data?.has_more ?? false;
  const estimatedTotal = hasMore ? (page + 1) * pageSize + 1 : page * pageSize + studies.length;

  const allOnPageSelected =
    studies.length > 0 && studies.every((study) => selectedUids.has(study.study_uid));

  const someOnPageSelected =
    studies.some((study) => selectedUids.has(study.study_uid)) && !allOnPageSelected;

  const toggleAllOnPage = useCallback(() => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      const selectAll = !studies.every((study) => next.has(study.study_uid));
      studies.forEach((study) => {
        if (selectAll) next.add(study.study_uid);
        else next.delete(study.study_uid);
      });
      return next;
    });
  }, [studies]);

  const toggleStudy = (studyUid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(studyUid)) next.delete(studyUid);
      else next.add(studyUid);
      return next;
    });
  };

  const selectedList = useMemo(() => Array.from(selectedUids), [selectedUids]);

  const runSearch = () => {
    if (!draftSourceNodeId) {
      notifyError("Choose a source node before searching.");
      return;
    }
    setSourceNodeId(draftSourceNodeId);
    setSearchNonce((value) => value + 1);
  };

  const clearFilters = () => {
    setDraftSourceNodeId("");
    setSourceNodeId("");
    setModality("");
    setPatientId("");
    setDateFrom("");
    setDateTo("");
    setPage(0);
    setPageSize(25);
    setSearchNonce(0);
    setSelectedUids(new Set());
  };

  const migrateMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      source_node_id: string;
      destination_node_ids: string[];
      study_uids: string[];
      tag_morphing_rule_ids: string[];
    }) =>
      apiFetch<SourceStudyActionResult>("/api/v1/source-studies/migrate", {
        method: "POST",
        body: JSON.stringify({ ...payload, start: true }),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
      const jobCount = result.job_ids?.length ?? (result.job_id ? 1 : 0);
      success(
        formatNotificationMessage(
          jobCount > 1
            ? `Created ${jobCount} migration jobs for ${result.enqueued} ${result.enqueued === 1 ? "study" : "studies"}. Job #1 started; start the rest when the active job finishes.`
            : `Migration job created for ${result.enqueued} ${result.enqueued === 1 ? "study" : "studies"}.`,
        ),
      );
      setMigrateOpen(false);
      setSelectedUids(new Set());
    },
    onError: (error: Error) => {
      notifyError(error.message);
    },
  });

  const routeMutation = useMutation({
    mutationFn: (payload: { source_node_id: string; study_uids: string[] }) =>
      apiFetch<SourceStudyActionResult>("/api/v1/source-studies/route", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["routing-transactions"] });
      success(
        formatNotificationMessage(
          `Queued ${result.enqueued} ${result.enqueued === 1 ? "study" : "studies"} for routing.`,
        ),
      );
      setSelectedUids(new Set());
    },
    onError: (error: Error) => {
      notifyError(error.message);
    },
  });

  const openMigrate = () => {
    if (!sourceNodeId || selectedList.length === 0) return;
    const sourceName = sourceNodes.find((node) => node.id === sourceNodeId)?.name ?? "source";
    setMigrateName(`Study browser · ${sourceName} · ${selectedList.length} studies`);
    setMigrateDestinationIds([]);
    setMigrateMorphIds([]);
    setMigrateOpen(true);
  };

  const submitMigrate = () => {
    const destinationIds = migrateDestinationIds.filter(
      (id) => id && id !== sourceNodeId,
    );
    if (destinationIds.length === 0) {
      warning("Choose at least one destination node.");
      return;
    }
    if (destinationIds.some((id) => isSameNodePair(sourceNodeId, id))) {
      notifyError(SAME_NODE_PAIR_MESSAGE);
      return;
    }
    migrateMutation.mutate({
      name: migrateName.trim() || "Study browser migration",
      source_node_id: sourceNodeId,
      destination_node_ids: destinationIds,
      study_uids: selectedList,
      tag_morphing_rule_ids: migrateMorphIds,
    });
  };

  const submitRoute = () => {
    if (!sourceNodeId || selectedList.length === 0) return;
    confirm({
      title: "Route selected studies",
      message: `Pull ${selectedList.length} ${selectedList.length === 1 ? "study" : "studies"} from the source PACS and route through active rules?`,
      confirmLabel: "Route",
      variant: "default",
      onConfirm: () => routeMutation.mutate({ source_node_id: sourceNodeId, study_uids: selectedList }),
    });
  };

  const columns = useMemo(
    () => [
      {
        key: "select",
        header: "Selection",
        width: 44,
        minWidth: 44,
        hideable: false,
        sortable: false,
        renderHeader: () => (
          <SelectAllHeader
            checked={allOnPageSelected}
            indeterminate={someOnPageSelected}
            disabled={studies.length === 0}
            onToggle={toggleAllOnPage}
          />
        ),
        render: (row: SourceStudy) => (
          <input
            type="checkbox"
            aria-label={`Select study ${row.study_uid}`}
            checked={selectedUids.has(row.study_uid)}
            onChange={() => toggleStudy(row.study_uid)}
            onClick={(event) => event.stopPropagation()}
          />
        ),
      },
      {
        key: "patient_name",
        header: "Patient Name",
        minWidth: 160,
        sortable: true,
        sortValue: (row: SourceStudy) => row.patient_name,
        render: (row: SourceStudy) => cellText(row.patient_name),
      },
      {
        key: "patient_id",
        header: "Patient ID",
        minWidth: 120,
        sortable: true,
        sortValue: (row: SourceStudy) => row.patient_id,
        render: (row: SourceStudy) => cellText(row.patient_id),
      },
      {
        key: "study_description",
        header: "Study Description",
        minWidth: 180,
        sortable: true,
        sortValue: (row: SourceStudy) => row.study_description,
        render: (row: SourceStudy) => cellText(row.study_description),
      },
      {
        key: "num_instances",
        header: "Images",
        minWidth: 72,
        sortable: true,
        sortValue: (row: SourceStudy) => row.num_instances,
        render: (row: SourceStudy) => cellText(row.num_instances),
      },
      {
        key: "num_series",
        header: "Series",
        minWidth: 72,
        sortable: true,
        sortValue: (row: SourceStudy) => row.num_series,
        render: (row: SourceStudy) => cellText(row.num_series),
      },
      {
        key: "study_date",
        header: "Study Date",
        minWidth: 170,
        sortable: true,
        sortValue: (row: SourceStudy) => row.study_date,
        render: (row: SourceStudy) => formatStudyDateTime(row),
      },
      {
        key: "modality",
        header: "Modality",
        minWidth: 90,
        sortable: true,
        sortValue: (row: SourceStudy) => row.modality,
        render: (row: SourceStudy) => cellText(row.modality),
      },
      {
        key: "accession_number",
        header: "Acc.#",
        minWidth: 110,
        sortable: true,
        sortValue: (row: SourceStudy) => row.accession_number,
        render: (row: SourceStudy) => cellText(row.accession_number),
      },
      {
        key: "study_uid",
        header: "Study Instance UID",
        minWidth: 220,
        sortable: true,
        sortValue: (row: SourceStudy) => row.study_uid,
        render: (row: SourceStudy) => (
          <span title={row.study_uid}>
            {row.study_uid.length > 36 ? `${row.study_uid.slice(0, 36)}…` : row.study_uid}
          </span>
        ),
      },
      {
        key: "patient_birth_date",
        header: "DoB",
        minWidth: 110,
        sortable: true,
        sortValue: (row: SourceStudy) => row.patient_birth_date,
        render: (row: SourceStudy) => cellText(row.patient_birth_date),
      },
      {
        key: "acquisition_date",
        header: "Acquisition Date",
        minWidth: 130,
        sortable: true,
        sortValue: (row: SourceStudy) => row.acquisition_date,
        render: (row: SourceStudy) => cellText(row.acquisition_date),
      },
      {
        key: "referring_physician",
        header: "Referring",
        minWidth: 150,
        sortable: true,
        sortValue: (row: SourceStudy) => row.referring_physician,
        render: (row: SourceStudy) => cellText(row.referring_physician),
      },
      {
        key: "station_name",
        header: "Station",
        minWidth: 120,
        sortable: true,
        sortValue: (row: SourceStudy) => row.station_name,
        render: (row: SourceStudy) => cellText(row.station_name),
      },
      {
        key: "body_part_examined",
        header: "Body Part Examined",
        minWidth: 140,
        sortable: true,
        sortValue: (row: SourceStudy) => row.body_part_examined,
        render: (row: SourceStudy) => cellText(row.body_part_examined),
      },
      {
        key: "protocol_name",
        header: "Protocol Name",
        minWidth: 150,
        sortable: true,
        sortValue: (row: SourceStudy) => row.protocol_name,
        render: (row: SourceStudy) => cellText(row.protocol_name),
      },
      {
        key: "acquisition_description",
        header: "Acquisition Description",
        minWidth: 180,
        sortable: true,
        sortValue: (row: SourceStudy) => row.acquisition_description,
        render: (row: SourceStudy) => cellText(row.acquisition_description),
      },
      {
        key: "requested_procedure",
        header: "Requested Procedure",
        minWidth: 170,
        sortable: true,
        sortValue: (row: SourceStudy) => row.requested_procedure,
        render: (row: SourceStudy) => cellText(row.requested_procedure),
      },
      {
        key: "patient_location",
        header: "Pat.Loc.",
        minWidth: 120,
        sortable: true,
        sortValue: (row: SourceStudy) => row.patient_location,
        render: (row: SourceStudy) => cellText(row.patient_location),
      },
    ],
    [allOnPageSelected, someOnPageSelected, selectedUids, studies, toggleAllOnPage],
  );

  const sourceLabel = studiesQuery.data?.source_node_name ?? sourceNodes.find((n) => n.id === sourceNodeId)?.name;

  return (
    <div className="page study-browser-page">
      <PageHeader
        title="Study Browser"
        description="Query studies from a source PACS and migrate or route selected studies."
      />

      <div className="card">
        <div className="card-filters-toolbar study-browser-filters">
          <div className="study-browser-source-field">
            <NodeSelectField
              label="Source"
              value={draftSourceNodeId}
              onChange={setDraftSourceNodeId}
              nodes={sourceNodes}
              nodeType="source"
              required
              emptyHint="Add an active source node with a DICOMweb URL under Configuration → Nodes."
            />
          </div>

          <div className="form-field study-browser-per-page">
            <label>Per page</label>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="study-browser-modality-field">
            <ModalitySelect label="Modality" value={modality} onChange={setModality} includeAny />
          </div>

          <div className="form-field study-browser-patient-field">
            <label>Patient ID</label>
            <input
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="Any"
            />
          </div>

          <DateRangeField
            label="Study date"
            from={dateFrom}
            to={dateTo}
            onFromChange={setDateFrom}
            onToChange={setDateTo}
          />

          <ActionButton variant="ghost" className="card-filters-clear" onClick={clearFilters}>
            Clear
          </ActionButton>

          <ActionButton icon={<Search size={16} />} onClick={runSearch} disabled={studiesQuery.isFetching}>
            {studiesQuery.isFetching ? <Loader2 size={16} className="spin" /> : null}
            Search
          </ActionButton>
        </div>

        {searchNonce === 0 ? (
          <p className="table-empty-hint">Choose a source node and run Search to load studies.</p>
        ) : studiesQuery.isLoading ? (
          <PageLoading label="Loading studies…" />
        ) : (
          <DataTable
            tableId="study-browser"
            columns={columns}
            data={studies}
            keyField="study_uid"
            paginate={false}
            resizable
            columnManagement
            columnPrefsDefaults={STUDY_BROWSER_COLUMN_DEFAULTS}
            toolbarStart={
              selectedList.length > 0 ? (
                <span className="study-browser-selection-count">
                  {selectedList.length} {selectedList.length === 1 ? "study" : "studies"} selected
                </span>
              ) : undefined
            }
            toolbarEnd={
              selectedList.length > 0 ? (
                <>
                  <ActionButton
                    variant="secondary"
                    icon={<ArrowLeftRight size={16} />}
                    onClick={openMigrate}
                    disabled={!sourceNodeId}
                  >
                    Migrate
                  </ActionButton>
                  <ActionButton
                    variant="secondary"
                    icon={<Route size={16} />}
                    onClick={submitRoute}
                    disabled={routeMutation.isPending || !sourceNodeId}
                  >
                    {routeMutation.isPending ? "Routing…" : "Route"}
                  </ActionButton>
                </>
              ) : undefined
            }
            emptyMessage={sourceLabel ? `No studies found on ${sourceLabel}.` : "No studies found."}
            serverPagination={{
              page,
              pageSize,
              total: estimatedTotal,
              onPageChange: setPage,
            }}
          />
        )}
      </div>

      <Modal open={migrateOpen} title="Migrate selected studies" onClose={() => setMigrateOpen(false)}>
        <div className="form-grid">
          <div className="form-field full-width">
            <label>Job name</label>
            <input value={migrateName} onChange={(e) => setMigrateName(e.target.value)} />
          </div>
          <DestinationNodePicker
            variant="migration"
            nodes={nodes}
            selectedIds={migrateDestinationIds}
            onChange={setMigrateDestinationIds}
            excludeNodeIds={sourceNodeId ? [sourceNodeId] : []}
          />
          <div className="form-field full-width">
            <TagMorphingRulePicker
              rules={morphRules}
              selectedIds={migrateMorphIds}
              onChange={setMigrateMorphIds}
            />
          </div>
          <p className="form-field-hint full-width">
            Creates {migrateDestinationIds.length > 1 ? `${migrateDestinationIds.length} batch jobs` : "a batch migration job"} for{" "}
            {selectedList.length} {selectedList.length === 1 ? "study" : "studies"}
            {migrateDestinationIds.length > 1 ? " (names suffixed #1, #2, …)" : ""} and starts the first job immediately.
          </p>
        </div>
        <div className="form-actions">
          <ActionButton
            icon={migrateMutation.isPending ? <Loader2 size={16} className="spin" /> : <ArrowLeftRight size={16} />}
            onClick={submitMigrate}
            disabled={migrateMutation.isPending}
          >
            Create & start {migrateDestinationIds.length > 1 ? "jobs" : "job"}
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => setMigrateOpen(false)}>
            Cancel
          </ActionButton>
        </div>
      </Modal>

      <ConfirmDialog loading={routeMutation.isPending} />
    </div>
  );
}
