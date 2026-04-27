// src/theme.ts
// Dublow Hatz palette, extracted from dublow.hatz.ai CSS variables.
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radii = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const fontSize = { xs: 12, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26 };

export interface Theme {
  mode: 'dark';
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
    bg: '#212121',           // --background
    surface: '#292929',      // --card
    surfaceAlt: '#383838',   // --muted
    border: '#3a3a3a',       // slightly softer than --border for subtlety
    text: '#FFFFFF',
    textMuted: '#B3B2B2',    // --muted-foreground
    primary: '#7818D8',      // --primary (Hatz purple)
    primaryText: '#FFFFFF',
    primarySoft: '#3a1f5c',
    bubbleUser: '#7818D8',
    bubbleUserText: '#FFFFFF',
    assistantText: '#FFFFFF',
    danger: '#ff5252',
    success: '#10b981',
  },
};

// Dark only for now. Exported as a hook for API stability.
export function useTheme(): Theme {
  return darkTheme;
}