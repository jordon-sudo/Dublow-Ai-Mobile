// src/theme.ts
// Dublow Hatz palette. Supports dark + light, with optional system-follow
// mode resolved via React Native's Appearance API.
import { useEffect, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import { useSettings } from './store/settingsStore';

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radii = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const fontSize = { xs: 12, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26 };

export type ThemeMode = 'dark' | 'light' | 'system';

export interface Theme {
  mode: 'dark' | 'light';
  colors: {
    bg: string; surface: string; surfaceAlt: string; border: string;
    text: string; textMuted: string;
    primary: string; primaryText: string; primarySoft: string;
    bubbleUser: string; bubbleUserText: string;
    assistantText: string;
    danger: string; success: string;
  };
}

const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    bg: '#212121',
    surface: '#292929',
    surfaceAlt: '#383838',
    border: '#3a3a3a',
    text: '#FFFFFF',
    textMuted: '#B3B2B2',
    primary: '#7818D8',
    primaryText: '#FFFFFF',
    primarySoft: '#3a1f5c',
    bubbleUser: '#7818D8',
    bubbleUserText: '#FFFFFF',
    assistantText: '#FFFFFF',
    danger: '#ff5252',
    success: '#10b981',
  },
};

const lightTheme: Theme = {
  mode: 'light',
  colors: {
    bg: '#F7F7F8',           // page background — warm off-white
    surface: '#FFFFFF',      // cards, composer, drawer rows
    surfaceAlt: '#EDEDEF',   // subtle fills: search bars, muted chips
    border: '#E3E3E6',       // hairlines
    text: '#111113',         // primary text — near-black for contrast
    textMuted: '#6B6B72',    // secondary text
    primary: '#7818D8',      // Hatz purple carries over untouched
    primaryText: '#FFFFFF',
    primarySoft: '#EDE3FA',  // tinted purple for selected/filled states
    bubbleUser: '#7818D8',
    bubbleUserText: '#FFFFFF',
    assistantText: '#111113',
    danger: '#D92D20',
    success: '#10B981',
  },
};

/**
 * Resolve a ThemeMode to the concrete palette in use right now.
 * - 'dark' / 'light': explicit user pick.
 * - 'system': mirror the OS color scheme; falls back to dark if unknown.
 */
function resolveTheme(mode: ThemeMode, system: ColorSchemeName): Theme {
  if (mode === 'dark') return darkTheme;
  if (mode === 'light') return lightTheme;
  return system === 'light' ? lightTheme : darkTheme;
}

/**
 * Hook: returns the active theme and re-renders on user toggle or OS change.
 * - Subscribes to the settings store's themeMode via the store selector, so
 *   any component calling useTheme() re-renders when the user toggles.
 * - Additionally subscribes to Appearance change events when mode is
 *   'system', so the UI tracks dark↔light at the OS level in real time.
 */
export function useTheme(): Theme {
  const mode = useSettings((s) => s.themeMode);
  const [system, setSystem] = useState<ColorSchemeName>(
    Appearance.getColorScheme(),
  );

  useEffect(() => {
    if (mode !== 'system') return;
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystem(colorScheme);
    });
    return () => sub.remove();
  }, [mode]);

  return resolveTheme(mode, system);
}