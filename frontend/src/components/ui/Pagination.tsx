interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, pageSize, total, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);

  if (totalPages <= 1 && total <= pageSize) return null;

  return (
    <div className="table-pagination">
      <span className="table-pagination-meta">
        {total === 0 ? "No results" : `Showing ${start}–${end} of ${total}`}
      </span>
      <div className="table-pagination-actions">
        <button
          type="button"
          className="btn-sm btn-secondary"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span className="table-pagination-page">
          Page {page + 1} of {totalPages}
        </span>
        <button
          type="button"
          className="btn-sm btn-secondary"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
