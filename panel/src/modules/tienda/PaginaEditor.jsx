/**
 * Store Builder — la pantalla principal del módulo.
 *
 * Tres paneles: estructura (izq.) · vista previa (centro) · inspector (der.).
 * El árbol vive en estado local mientras se edita y sólo baja a `tiendaApi` al
 * guardar; eso hace que deshacer sea una pila en memoria y que el borrador nunca
 * quede a medias. Ver docs/MODULO-TIENDA-CMS.md §9.4.
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import TextField from "@mui/material/TextField";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import UndoIcon from "@mui/icons-material/Undo";

import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";

import SectionOutline from "./components/builder/SectionOutline";
import BlockPicker from "./components/builder/BlockPicker";
import SectionPicker from "./components/builder/SectionPicker";
import BlockInspector from "./components/builder/BlockInspector";
import ViewAsBar from "./components/builder/ViewAsBar";
import PagePreview from "./components/preview/PagePreview";
import PageSettingsModal from "./components/PageSettingsModal";

import {
  getPage, savePageDraft, publishPage, discardDraft, getReferenceOptions,
  validateSections, PAGE_STATE_META, listPageVersions, restoreVersion,
  listSavedSections, saveSectionAsTemplate, instantiateSavedSection, schedulePage,
} from "./api/tiendaApi";
import { useAuth } from "../../context/AuthContext";
import {
  clone, createSection, createBlock, findBlock, findSection,
  addSection, addBlock, updateSection, updateBlock, updateBlockProps,
  removeSection, removeBlock, duplicateSection, duplicateBlock,
  moveSection, moveBlock,
} from "./lib/blocks";
import { evaluateVisibility, defaultViewAs } from "./lib/visibility";
import { formatDateTime, relativeFromToday } from "./lib/time";
import "./Tienda.css";

const PaginaEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  // El embed externo sólo se ofrece a quien puede hacerse cargo de lo que pega
  // adentro (§11).
  const isAdmin = /admin/i.test(user?.role || "");

  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const page = useMemo(() => getPage(id), [id, version]);

  const [sections, setSections] = useState(() => clone(getPage(id)?.draft?.sections || []));
  const [history, setHistory] = useState([]);
  const [selection, setSelection] = useState(null);
  const [viewAs, setViewAs] = useState(defaultViewAs);
  const [picker, setPicker] = useState(null);
  const [sectionPicker, setSectionPicker] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(null);

  // Se recalcula al refrescar: las opciones dependen del estado de `tiendaApi`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refs = useMemo(() => getReferenceOptions(), [version]);
  const issues = useMemo(() => validateSections(sections), [sections]);
  const errorCount = issues.filter((i) => i.level === "error").length;

  const dirty = useMemo(
    () => JSON.stringify(sections) !== JSON.stringify(page?.draft?.sections || []),
    [sections, page]
  );

  /** Toda mutación pasa por acá: apila el estado anterior para deshacer. */
  const commit = useCallback((next) => {
    setHistory((h) => [...h.slice(-29), sections]);
    setSections(next);
  }, [sections]);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      setSections(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);

  /* ------------------------------------------------------------ acciones */

  const handleSave = useCallback(() => {
    savePageDraft(id, sections);
    refresh();
    showToast("Borrador guardado", "success");
  }, [id, sections, refresh, showToast]);

  const handlePublish = () => {
    savePageDraft(id, sections);
    const result = publishPage(id);
    refresh();
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast("Página publicada", "success");
  };

  /**
   * Programar guarda el borrador y deja la fecha: la publicación la hace
   * `ensureScheduledPublish()` en la primera lectura posterior (regla §10.8).
   */
  const handleSchedule = () => {
    savePageDraft(id, sections);
    schedulePage(id, `${scheduleAt}:00`);
    setScheduleAt(null);
    refresh();
    showToast("Publicación programada", "success");
  };

  const handleDiscard = () => {
    const restored = discardDraft(id);
    setSections(clone(restored?.draft?.sections || []));
    setHistory([]);
    setSelection(null);
    refresh();
    showToast("Cambios descartados", "info");
  };

  const handleRestore = (versionId) => {
    const result = restoreVersion(versionId);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    setSections(clone(result.page.draft.sections));
    setHistory([]);
    setSelection(null);
    setVersionsOpen(false);
    refresh();
    showToast("Versión restaurada en el borrador. Revisala y publicá cuando quieras.", "success");
  };

  /* ----------------------------------------------------------- atajos */

  useEffect(() => {
    const onKey = (e) => {
      const typing = ["INPUT", "TEXTAREA"].includes(e.target?.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, undo]);

  /* ---------------------------------------------------------- selección */

  const selected = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === "section") {
      const section = findSection(sections, selection.id);
      return section ? { kind: "section", section } : null;
    }
    const { block, section } = findBlock(sections, selection.id);
    return block ? { kind: "block", block, section } : null;
  }, [selection, sections]);

  const selectedIssues = useMemo(
    () => issues.filter((i) => (selection ? i.blockId === selection.id || (i.blockId === null && i.sectionId === selection.id) : false)),
    [issues, selection]
  );

  /* -------------------------------------------------- árbol para el preview */

  const visibleTree = useMemo(() => {
    let hidden = 0;
    const out = [];
    sections.forEach((s) => {
      if (!evaluateVisibility(s.visibility, viewAs).visible) { hidden += 1 + s.blocks.length; return; }
      const blocks = s.blocks.filter((b) => {
        const ok = evaluateVisibility(b.visibility, viewAs).visible;
        if (!ok) hidden += 1;
        return ok;
      });
      out.push({ ...s, blocks });
    });
    return { sections: out, hidden };
  }, [sections, viewAs]);

  if (!page) {
    return (
      <Box className="page">
        <Typography variant="h5" fontWeight={700}>Página no encontrada</Typography>
        <Button variant="secondary" onClick={() => navigate("/tienda/paginas")} sx={{ mt: 2 }}>
          Volver a Páginas
        </Button>
      </Box>
    );
  }

  const stateMeta = PAGE_STATE_META[page.state] || { label: page.state, tone: "neutral" };
  const versions = listPageVersions(page.id);

  /* -------------------------------------------------- handlers del árbol */

  const addAndSelect = (section) => {
    commit(addSection(sections, section));
    setSelection({ kind: "section", id: section.id });
    setSectionPicker(false);
  };

  const onSaveAsTemplate = () => {
    const section = findSection(sections, selection.id);
    saveSectionAsTemplate(section);
    refresh();
    showToast(`«${section.name}» quedó disponible para otras páginas`, "success");
  };

  const onPickBlock = (type) => {
    const block = createBlock(type);
    commit(addBlock(sections, picker.sectionId, block));
    setSelection({ kind: "block", id: block.id });
    setPicker(null);
  };

  const toggleVisibility = (node) => (node?.visibility?.mode === "hidden" ? { mode: "always" } : { mode: "hidden" });

  return (
    <Box className="st-editor">
      {/* ------------------------------------------------------ barra superior */}
      <Box className="st-topbar">
        <Box className="st-topbar__left">
          <IconButton size="small" onClick={() => navigate("/tienda/paginas")} aria-label="volver">
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Box>
            <Typography className="st-topbar__title">{page.title}</Typography>
            <Typography variant="caption" className="st-topbar__meta">
              <span className="mono">{page.slug}</span> · editada {relativeFromToday(page.updatedAt)}
            </Typography>
          </Box>
          <StatusBadge tone={dirty ? "warning" : stateMeta.tone} label={dirty ? "Sin guardar" : stateMeta.label} />
          {errorCount > 0 && <StatusBadge tone="danger" label={`${errorCount} error(es)`} />}
        </Box>

        <Box className="st-topbar__right">
          <ViewAsBar
            viewAs={viewAs} audiences={refs.audiences}
            onChange={setViewAs} hiddenCount={visibleTree.hidden}
          />
          <Tooltip title="Deshacer (Ctrl+Z)">
            <span>
              <IconButton size="small" onClick={undo} disabled={!history.length} aria-label="deshacer">
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Button variant="secondary" size="small" onClick={handleSave} disabled={!dirty}>Guardar</Button>
          <Button variant="primary" size="small" onClick={handlePublish} disabled={errorCount > 0}>Publicar</Button>
          <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="más acciones">
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* ------------------------------------------------------- tres paneles */}
      <Box className="st-editor__body">
        <SectionOutline
          sections={sections}
          selectedId={selection?.id}
          issues={issues}
          onSelect={setSelection}
          onAddSection={() => setSectionPicker(true)}
          onAddBlock={(sectionId) => setPicker({ sectionId })}
          onMoveSection={(sid, d) => commit(moveSection(sections, sid, d))}
          onMoveBlock={(bid, d) => commit(moveBlock(sections, bid, d))}
          onToggleSection={(sid) => {
            const section = findSection(sections, sid);
            commit(updateSection(sections, sid, { visibility: toggleVisibility(section) }));
          }}
          onToggleBlock={(bid) => {
            const { block } = findBlock(sections, bid);
            commit(updateBlock(sections, bid, { visibility: toggleVisibility(block) }));
          }}
        />

        <Box className="st-editor__canvas" onClick={() => setSelection(null)}>
          <PagePreview
            sections={visibleTree.sections}
            page={page}
            viewport={viewAs.device}
            at={viewAs.at}
            fit
            chrome
            selectable
            selectedId={selection?.id}
            onSelect={(blockId) => setSelection({ kind: "block", id: blockId })}
          />
        </Box>

        <Box className="st-editor__inspector">
          <BlockInspector
            selection={selected}
            refs={refs}
            issues={selectedIssues}
            onChangeProps={(patch) => commit(updateBlockProps(sections, selection.id, patch))}
            onChangeVisibility={(visibility) =>
              commit(
                selected.kind === "section"
                  ? updateSection(sections, selection.id, { visibility })
                  : updateBlock(sections, selection.id, { visibility })
              )
            }
            onChangeSectionName={(name) => commit(updateSection(sections, selection.id, { name }))}
            onChangeSectionLayout={(layout) => commit(updateSection(sections, selection.id, { layout }))}
            onDuplicate={() =>
              commit(selected.kind === "section" ? duplicateSection(sections, selection.id) : duplicateBlock(sections, selection.id))
            }
            onDelete={() => {
              commit(selected.kind === "section" ? removeSection(sections, selection.id) : removeBlock(sections, selection.id));
              setSelection(null);
            }}
            onSaveAsTemplate={onSaveAsTemplate}
          />
        </Box>
      </Box>

      {/* ------------------------------------------------------------ menús */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => { setSettingsOpen(true); setMenuAnchor(null); }}>
          Datos de la página y SEO
        </MenuItem>
        <MenuItem
          disabled={errorCount > 0}
          onClick={() => {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            setScheduleAt(`${d.toISOString().slice(0, 10)}T09:00`);
            setMenuAnchor(null);
          }}
        >
          Programar publicación
        </MenuItem>
        <MenuItem onClick={() => { setVersionsOpen(true); setMenuAnchor(null); }}>
          Ver historial ({versions.length})
        </MenuItem>
        <MenuItem
          disabled={!page.published}
          onClick={() => { handleDiscard(); setMenuAnchor(null); }}
        >
          Descartar cambios del borrador
        </MenuItem>
        <MenuItem onClick={() => { navigate("/tienda/paginas"); setMenuAnchor(null); }}>
          Volver a Páginas
        </MenuItem>
      </Menu>

      {picker && (
        <BlockPicker
          open pageType={page.type} sections={sections} isAdmin={isAdmin}
          onPick={onPickBlock} onClose={() => setPicker(null)}
        />
      )}

      {sectionPicker && (
        <SectionPicker
          open savedSections={listSavedSections()}
          onPickBlank={() => addAndSelect(createSection({ name: `Sección ${sections.length + 1}` }))}
          onPickSaved={(id) => {
            const section = instantiateSavedSection(id);
            if (section) addAndSelect(section);
          }}
          onClose={() => setSectionPicker(false)}
        />
      )}

      {scheduleAt !== null && (
        <Modal
          open onClose={() => setScheduleAt(null)} maxWidth="xs"
          title="Programar publicación"
          subtitle="Se guarda el borrador y la página se publica sola en esa fecha."
          actions={
            <>
              <Button variant="ghost" onClick={() => setScheduleAt(null)}>Cancelar</Button>
              <Button variant="primary" disabled={!scheduleAt} onClick={handleSchedule}>Programar</Button>
            </>
          }
        >
          <TextField
            size="small" fullWidth type="datetime-local" label="Publicar el"
            slotProps={{ inputLabel: { shrink: true } }}
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
          />
        </Modal>
      )}

      {settingsOpen && (
        <PageSettingsModal
          page={page}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => { setSettingsOpen(false); refresh(); showToast("Datos de la página actualizados", "success"); }}
        />
      )}

      {versionsOpen && (
        <Modal
          open onClose={() => setVersionsOpen(false)} maxWidth="sm"
          title="Historial de versiones"
          subtitle="Restaurar copia la versión al borrador; no publica sola."
          actions={<Button variant="ghost" onClick={() => setVersionsOpen(false)}>Cerrar</Button>}
        >
          {versions.length === 0 ? (
            <Typography variant="body2" className="text-tertiary">
              Todavía no hay publicaciones de esta página.
            </Typography>
          ) : (
            <Box className="st-versions">
              {versions.map((v) => (
                <Box className="st-versions__row" key={v.id}>
                  <Box>
                    <strong>{v.label}</strong>
                    {v.note && <span className="st-versions__note">{v.note}</span>}
                    <span className="st-versions__meta">
                      {formatDateTime(v.publishedAt)} · {v.publishedBy}
                    </span>
                  </Box>
                  <Button
                    variant="secondary" size="small"
                    disabled={!v.tree}
                    onClick={() => handleRestore(v.id)}
                  >
                    {v.tree ? "Restaurar" : "Sin contenido"}
                  </Button>
                </Box>
              ))}
            </Box>
          )}
        </Modal>
      )}
    </Box>
  );
};

export default PaginaEditor;
