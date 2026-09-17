import { useState } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";

import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import CallOutlinedIcon from "@mui/icons-material/CallOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";

import Button from "../../../components/Button/Button";
import { useToast } from "../../../components/Toast/ToastContext";
import ActivityTimeline from "./ActivityTimeline";
import { addActivity } from "../api/clientsApi";
import "./ActivityTab.css";

const KINDS = [
  { value: "note", label: "Nota", icon: <EditNoteOutlinedIcon fontSize="small" /> },
  { value: "call", label: "Llamada", icon: <CallOutlinedIcon fontSize="small" /> },
  { value: "meeting", label: "Reunión", icon: <GroupsOutlinedIcon fontSize="small" /> },
  { value: "task", label: "Tarea", icon: <TaskAltOutlinedIcon fontSize="small" /> },
];

const ActivityTab = ({ accountId, activities, onChange }) => {
  const { showToast } = useToast();
  const [kind, setKind] = useState("note");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const submit = () => {
    if (!title.trim()) {
      showToast("Escribí un título para la actividad", "warning");
      return;
    }
    addActivity(accountId, { type: kind, title, description });
    setTitle("");
    setDescription("");
    setKind("note");
    onChange();
    showToast("Actividad registrada", "success");
  };

  return (
    <Box className="act-tab">
      <Box className="act-form">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={kind}
          onChange={(_, v) => v && setKind(v)}
          className="act-form__kinds"
        >
          {KINDS.map((k) => (
            <ToggleButton key={k.value} value={k.value}>
              {k.icon}<span>{k.label}</span>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <TextField
          size="small"
          fullWidth
          placeholder={kind === "task" ? "Qué hay que hacer…" : "Título de la actividad…"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextField
          size="small"
          fullWidth
          multiline
          minRows={2}
          placeholder="Detalle (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="primary" size="small" onClick={submit}>Registrar</Button>
        </Box>
      </Box>

      <ActivityTimeline activities={activities} variant="full" />
    </Box>
  );
};

export default ActivityTab;
