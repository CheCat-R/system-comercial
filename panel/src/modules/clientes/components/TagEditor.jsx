import { useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";

import { saveTags, getAllTags } from "../api/clientsApi";
import "./TagEditor.css";

/**
 * Editor de etiquetas de una cuenta. Autocomplete sobre las etiquetas ya
 * usadas en la cartera + creación libre.
 */
const TagEditor = ({ account, onChange }) => {
  const [value, setValue] = useState(account.tags || []);
  const options = getAllTags().map((t) => t.name);

  const commit = (next) => {
    const clean = [...new Set(next.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
    setValue(clean);
    onChange(saveTags(account.id, clean));
  };

  return (
    <Autocomplete
      multiple
      freeSolo
      size="small"
      options={options}
      value={value}
      onChange={(_, next) => commit(next)}
      className="tag-editor"
      renderValue={(vals, getItemProps) =>
        vals.map((option, index) => {
          const { key, ...itemProps } = getItemProps({ index });
          return <Chip key={key} variant="outlined" size="small" label={option} {...itemProps} />;
        })
      }
      renderInput={(params) => (
        <TextField {...params} placeholder={value.length ? "" : "Agregar etiqueta…"} />
      )}
    />
  );
};

export default TagEditor;
