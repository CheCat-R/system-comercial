import { createContext, useContext, useState, useEffect, useCallback } from "react";

const UIContext = createContext(null);

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error("useUI debe usarse dentro de un UIProvider");
  }
  return context;
};

export const UIProvider = ({ children }) => {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notificationAnchorEl, setNotificationAnchorEl] = useState(null);

  const toggleCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen((prev) => !prev);
  }, []);

  const openNotifications = (event) => {
    setNotificationAnchorEl(event.currentTarget);
    setIsNotificationsOpen(true);
  };

  const closeNotifications = () => {
    setNotificationAnchorEl(null);
    setIsNotificationsOpen(false);
  };

  // Atajo global Ctrl+K para el Command Palette
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleCommandPalette]);

  return (
    <UIContext.Provider
      value={{
        isCommandPaletteOpen,
        toggleCommandPalette,
        setIsCommandPaletteOpen,
        isNotificationsOpen,
        openNotifications,
        closeNotifications,
        notificationAnchorEl,
      }}
    >
      {children}
    </UIContext.Provider>
  );
};
