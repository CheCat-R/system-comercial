import { useMemo, useState } from "react";
import TableContainer from "@mui/material/TableContainer";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableSortLabel from "@mui/material/TableSortLabel";
import TablePagination from "@mui/material/TablePagination";
import LinearProgress from "@mui/material/LinearProgress";
import Checkbox from "@mui/material/Checkbox";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";

import "./DataTable.css";

/**
 * La tabla del panel. **Es la única**: ninguna pantalla arma un `<Table>` de MUI
 * a mano (auditoría §2.5).
 *
 * ── ⭐ Ordenar: se deduce, no se declara ────────────────────────────────
 *
 * Antes ninguna de las 52 tablas del panel se podía ordenar por columna, y era
 * el rasgo de "CRUD genérico" más caro en uso diario. Se resolvió acá una vez, y
 * **sin tocar las 52 pantallas**: una columna es ordenable si sus datos se
 * pueden ordenar. Se mira el valor crudo de la fila (`row[field]`), no lo que
 * pinta `renderCell` — así una columna de Estado que dibuja un badge ordena por
 * su valor, y una columna de acciones (que no tiene dato) no ofrece ordenarse.
 *
 * Para los casos que la deducción no cubre:
 *   `sortValue: (row) => …`  el valor por el que ordenar, cuando es derivado
 *   `sortable: false`        apagarlo explícitamente
 *
 * ⭐ **Si la paginación es externa, no se ordena.** Ordenar la página que
 * llegó daría un orden mentiroso: parece global y es de 10 filas. En ese caso
 * la tabla delega en `onSortChange` y, si nadie escucha, no muestra el control.
 *
 * @param {Object[]} columns  { field, headerName, align, width, renderCell, sortValue?, sortable? }
 * @param {Object[]} data     filas
 * @param {boolean}  loading  muestra el esqueleto de filas
 * @param {string}   emptyMessage  texto del vacío (compatibilidad)
 * @param {Object}   emptyState    { icon, title, description, action } — el vacío con forma
 * @param {Object}   pagination    { page, rowsPerPage, totalCount, onPageChange, onRowsPerPageChange }
 * @param {boolean}  selectable    casillas de selección múltiple
 * @param {Object}   sort          { field, direction } para controlarlo desde afuera
 * @param {function} onSortChange  ({ field, direction }) => void
 */
const DataTable = ({
  columns = [],
  data = [],
  loading = false,
  emptyMessage = "No se encontraron registros",
  emptyState = null,
  pagination,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  onRowClick,
  toolbar = null,
  stickyHeader = false,
  sort,
  onSortChange,
}) => {
  /* ------------------------------------------------------- ordenamiento */

  const [innerSort, setInnerSort] = useState(null);
  const activeSort = sort !== undefined ? sort : innerSort;

  // Paginación externa: `totalCount` habla de más filas de las que llegaron.
  const externalPaging = Boolean(pagination && pagination.totalCount > data.length);
  const canSortHere = !externalPaging || Boolean(onSortChange);

  /**
   * ⭐ Una columna ofrece ordenarse si **alguna fila tiene un valor ordenable**
   * ahí. Se mira sobre una muestra: recorrer 5.000 filas por columna en cada
   * render para decidir si se dibuja una flechita no vale la pena.
   */
  const sortableFields = useMemo(() => {
    const sample = data.slice(0, 30);
    const ok = new Set();
    columns.forEach((col) => {
      if (col.sortable === false) return;
      if (col.sortValue) { ok.add(col.field); return; }
      const sortable = sample.some((row) => {
        const v = row?.[col.field];
        return typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v instanceof Date;
      });
      if (sortable) ok.add(col.field);
    });
    return ok;
  }, [columns, data]);

  const valueOf = (row, col) => (col.sortValue ? col.sortValue(row) : row?.[col.field]);

  const sortedData = useMemo(() => {
    if (!activeSort?.field || externalPaging) return data;
    const col = columns.find((c) => c.field === activeSort.field);
    if (!col) return data;

    const dir = activeSort.direction === "desc" ? -1 : 1;
    const collator = new Intl.Collator("es-AR", { numeric: true, sensitivity: "base" });

    return [...data].sort((a, b) => {
      const va = valueOf(a, col);
      const vb = valueOf(b, col);

      // ⭐ Lo que no tiene valor va siempre al final, se ordene como se ordene:
      // un "—" arriba de todo al invertir el orden es ruido, no información.
      const emptyA = va == null || va === "";
      const emptyB = vb == null || vb === "";
      if (emptyA && emptyB) return 0;
      if (emptyA) return 1;
      if (emptyB) return -1;

      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      if (va instanceof Date || vb instanceof Date) return (new Date(va) - new Date(vb)) * dir;
      if (typeof va === "boolean") return (Number(va) - Number(vb)) * dir;
      return collator.compare(String(va), String(vb)) * dir;
    });
  }, [data, columns, activeSort, externalPaging]);

  const toggleSort = (field) => {
    const next = activeSort?.field === field && activeSort.direction === "asc"
      ? { field, direction: "desc" }
      : { field, direction: "asc" };
    if (onSortChange) onSortChange(next);
    if (sort === undefined) setInnerSort(next);
  };

  const rows = sortedData;
  const currentPageRowIds = rows.map((row) => row.id);
  const isAllSelected =
    currentPageRowIds.length > 0 && currentPageRowIds.every((id) => selectedIds.includes(id));
  const isSomeSelected =
    currentPageRowIds.some((id) => selectedIds.includes(id)) && !isAllSelected;

  const handleSelectAllClick = (event) => {
    if (!onSelectionChange) return;

    if (event.target.checked) {
      const newSelected = Array.from(new Set([...selectedIds, ...currentPageRowIds]));
      onSelectionChange(newSelected);
    } else {
      const newSelected = selectedIds.filter((id) => !currentPageRowIds.includes(id));
      onSelectionChange(newSelected);
    }
  };

  const handleRowSelectClick = (id, event) => {
    event.stopPropagation();
    if (!onSelectionChange) return;

    const selectedIndex = selectedIds.indexOf(id);
    let newSelected = [];

    if (selectedIndex === -1) {
      newSelected = [...selectedIds, id];
    } else {
      newSelected = selectedIds.filter((item) => item !== id);
    }

    onSelectionChange(newSelected);
  };

  const handleRowCellClick = (row, col, event) => {
    // Si el clic fue en un botón de acción o checkbox, no dispara el evento de fila
    if (event.target.closest("button") || event.target.closest(".MuiCheckbox-root")) {
      return;
    }
    if (onRowClick) {
      onRowClick(row, event);
    }
  };

  return (
    <Box className="data-table-container">
      {toolbar && <Box className="data-table-toolbar">{toolbar}</Box>}

      {/* La barra fina queda para la recarga: cuando YA hay filas en pantalla y
          se están refrescando. El vacío en carga usa esqueleto. */}
      {loading && rows.length > 0 && <LinearProgress color="primary" sx={{ height: 3 }} />}

      <TableContainer>
        <Table className="data-table" stickyHeader={stickyHeader}>
          <TableHead>
            <TableRow>
              {selectable && (
                <TableCell padding="checkbox" className="data-table-header-cell data-table-checkbox-cell">
                  <Checkbox
                    size="small"
                    color="primary"
                    indeterminate={isSomeSelected}
                    checked={isAllSelected}
                    onChange={handleSelectAllClick}
                  />
                </TableCell>
              )}

              {columns.map((col) => {
                const isSortable = canSortHere && sortableFields.has(col.field);
                const isActive = activeSort?.field === col.field;
                return (
                  <TableCell
                    key={col.field}
                    align={col.align || "left"}
                    className="data-table-header-cell"
                    style={{ width: col.width }}
                    sortDirection={isActive ? activeSort.direction : false}
                  >
                    {isSortable ? (
                      <TableSortLabel
                        active={isActive}
                        direction={isActive ? activeSort.direction : "asc"}
                        onClick={() => toggleSort(col.field)}
                      >
                        {col.headerName}
                      </TableSortLabel>
                    ) : col.headerName}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.length > 0 ? (
              rows.map((row, rowIndex) => {
                const isSelected = selectedIds.includes(row.id);

                return (
                  <TableRow
                    key={row.id || rowIndex}
                    selected={isSelected}
                    className={`data-table-row ${onRowClick ? "clickable-row" : ""}`}
                  >
                    {selectable && (
                      <TableCell padding="checkbox" className="data-table-body-cell data-table-checkbox-cell">
                        <Checkbox
                          size="small"
                          color="primary"
                          checked={isSelected}
                          onChange={(e) => handleRowSelectClick(row.id, e)}
                        />
                      </TableCell>
                    )}

                    {columns.map((col) => (
                      <TableCell
                        key={`${rowIndex}-${col.field}`}
                        align={col.align || "left"}
                        className="data-table-body-cell"
                        onClick={(e) => handleRowCellClick(row, col, e)}
                        // ⭐ El nombre de la columna viaja con la celda para que
                        // en mobile —donde la tabla se convierte en tarjetas y no
                        // hay encabezado— cada dato siga sabiendo qué es.
                        data-label={col.headerName || undefined}
                      >
                        {col.renderCell ? col.renderCell(row) : row[col.field]}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="data-table-empty"
                >
                  {loading ? (
                    /* ⭐ Esqueleto de filas, no barra de progreso.
                       Una barra dice "esperá"; el esqueleto dice "esperá, y va a
                       venir una tabla de este tamaño". */
                    <Box className="data-table-skeleton" aria-hidden="true">
                      {[0, 1, 2, 3, 4].map((i) => <span key={i} className="data-table-skeleton__row" />)}
                    </Box>
                  ) : (
                    <Box className="data-table-empty__inner">
                      <span className="data-table-empty__icon">
                        {emptyState?.icon || <InboxOutlinedIcon />}
                      </span>
                      <Typography variant="body2" className="data-table-empty__title">
                        {emptyState?.title || emptyMessage}
                      </Typography>
                      {emptyState?.description && (
                        <Typography variant="body2" className="data-table-empty__desc">
                          {emptyState.description}
                        </Typography>
                      )}
                      {emptyState?.action}
                    </Box>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {pagination && (
        <TablePagination
          className="data-table-pagination"
          component="div"
          count={pagination.totalCount || data.length}
          page={pagination.page || 0}
          onPageChange={pagination.onPageChange}
          rowsPerPage={pagination.rowsPerPage || 10}
          onRowsPerPageChange={pagination.onRowsPerPageChange}
          rowsPerPageOptions={[5, 10, 25, 50]}
          labelRowsPerPage="Filas por página:"
        />
      )}
    </Box>
  );
};

export default DataTable;
