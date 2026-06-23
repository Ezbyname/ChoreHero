import type { ViewStyle } from 'react-native';

export const shadows: Record<string, ViewStyle> = {
  card: {
    shadowColor:   '#000000',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius:  4,
    elevation:     2,
  },
  soft: {
    shadowColor:   '#000000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius:  8,
    elevation:     3,
  },
};
