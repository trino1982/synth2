import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  // Detect OS preference
  const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  const [darkMode, setDarkMode] = useState(prefersDarkMode);

  const toggleTheme = () => {
    setDarkMode(prevMode => !prevMode);
  };

  // Update when OS preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e) => {
      setDarkMode(e.matches);
    };
    
    // Add event listener
    mediaQuery.addEventListener('change', handleChange);
    
    // Apply theme to body
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Cleanup
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [darkMode]);

  const value = {
    darkMode,
    toggleTheme
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
