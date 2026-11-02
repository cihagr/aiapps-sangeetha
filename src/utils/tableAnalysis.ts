export interface TableAnalysisData {
  Columns: string[];   // first entry is always "S.no"
  Rows: (string | number)[][];
  SortableColumns?: string[];
}

export function getSortedRows(
  table: TableAnalysisData,
  sortColumn: string | null
): (string | number)[][] {
  if (!sortColumn || sortColumn === 'S.no') return table.Rows;
  const colIndex = table.Columns.indexOf(sortColumn);
  if (colIndex === -1) return table.Rows;
  return [...table.Rows].sort((a, b) => {
    const av = a[colIndex]; const bv = b[colIndex];
    const an = Number(av); const bn = Number(bv);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
    return String(av).localeCompare(String(bv));
  });
}

const parseMaybeJson = (value: any): any => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const toCellText = (cell: any): string | number => {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'number') return cell;
  if (typeof cell === 'object') return String(cell.text ?? cell.value ?? cell.label ?? '');
  return String(cell);
};

/**
 * Reads the reference table off a question.
 *
 * The API returns `TableAnalysis` as a JSON *string* on the generate path (it is
 * only parsed on the repository path), and casing varies between `Columns`/
 * `columns`. The previous strict check returned null for both shapes, so the
 * table was missing from the screen and from the Word/Excel exports.
 */
export function getTableAnalysis(question: any): TableAnalysisData | null {
  const raw = question?.TableAnalysis
    ?? question?.tableAnalysis
    ?? question?.tableanalysis
    ?? question?.[2]?.TableAnalysis
    ?? question?.[2]?.tableAnalysis
    ?? question?.raw?.[2]?.TableAnalysis
    ?? question?.questiondata?.TableAnalysis;

  const t = typeof raw === 'string' ? parseMaybeJson(raw) : raw;
  if (!t || typeof t !== 'object') return null;

  const columnsRaw = Array.isArray(t.Columns) ? t.Columns : (Array.isArray(t.columns) ? t.columns : null);
  const rowsRaw = Array.isArray(t.Rows) ? t.Rows : (Array.isArray(t.rows) ? t.rows : null);
  if (!columnsRaw || !rowsRaw) return null;

  const Columns = columnsRaw.map(c => String(toCellText(c)));
  const Rows = rowsRaw.map((row: any) =>
    Array.isArray(row)
      ? row.map(toCellText)
      // Object rows are keyed by column name.
      : Columns.map(col => toCellText(row?.[col] ?? row?.[col?.toLowerCase?.()]))
  );

  const sortableRaw = Array.isArray(t.SortableColumns)
    ? t.SortableColumns
    : (Array.isArray(t.sortableColumns) ? t.sortableColumns : undefined);

  return {
    Columns,
    Rows,
    ...(sortableRaw ? { SortableColumns: sortableRaw.map((c: any) => String(toCellText(c))) } : {}),
  };
}

export function getSortOptions(table: TableAnalysisData): string[] {
  const sortable = Array.isArray(table.SortableColumns) && table.SortableColumns.length > 0
    ? table.SortableColumns
    : table.Columns.filter(c => c !== 'S.no');
  return ['S.no', ...sortable];
}

