import type { TextStyle } from 'react-native';

export const typography: Record<string, TextStyle> = {
  title: {
    fontSize:   28,
    fontWeight: '700',
    lineHeight: 34,
  },
  subtitle: {
    fontSize:   15,
    fontWeight: '400',
    lineHeight: 22,
  },
  body: {
    fontSize:   16,
    fontWeight: '400',
    lineHeight: 24,
  },
  caption: {
    fontSize:   13,
    fontWeight: '400',
    lineHeight: 18,
  },
  button: {
    fontSize:   15,
    fontWeight: '600',
    lineHeight: 20,
  },
};
