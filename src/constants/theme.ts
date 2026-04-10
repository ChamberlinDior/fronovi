export const theme = {
  colors: {
    bg: '#07111F',
    surface: '#0E1B2E',
    surfaceAlt: '#12233D',
    card: '#132642',
    primary: '#2D8CFF',
    primarySoft: '#D9EBFF',
    success: '#12B76A',
    warning: '#F79009',
    danger: '#F04438',
    text: '#F8FAFC',
    textMuted: '#94A3B8',
    border: '#243B5A',
    white: '#FFFFFF'
  },
  radius: {
    sm: 10,
    md: 16,
    lg: 22,
    xl: 28
  },
  spacing: (n: number) => n * 8,
  shadow: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  }
};
