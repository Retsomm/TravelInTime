import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DARK_THEME,
  LIGHT_THEME,
  ThemeContext,
  loadDarkModePreference,
  saveDarkModePreference,
} from '../lib/theme';

const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    loadDarkModePreference().then(setDarkMode);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      saveDarkModePreference(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ darkMode, toggleDarkMode, colors: darkMode ? DARK_THEME : LIGHT_THEME }),
    [darkMode, toggleDarkMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export default ThemeProvider;
