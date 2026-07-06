import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

interface FamilyAvatarProps {
  name:         string;
  avatarUrl?:   string;
  avatarEmoji?: string;
  size?:        number;
}

// Single source of truth for rendering a Family Member's identity across the
// app — task cards, contribution claims, household member lists, anywhere a
// person needs to be shown. Rendering priority: photo > emoji > initials.
// Do not duplicate this logic at call sites; add props here instead.
export function FamilyAvatar({ name, avatarUrl, avatarEmoji, size = 36 }: FamilyAvatarProps) {
  const containerStyle = {
    width:        size,
    height:       size,
    borderRadius: size / 2,
  };

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[styles.container, containerStyle]}
        accessibilityLabel={name}
      />
    );
  }

  if (avatarEmoji) {
    return (
      <View style={[styles.container, styles.placeholder, containerStyle]}>
        <Text style={{ fontSize: size * 0.55 }}>{avatarEmoji}</Text>
      </View>
    );
  }

  const initials = getInitials(name);

  return (
    <View style={[styles.container, styles.placeholder, containerStyle]}>
      <Text style={[styles.initialsText, { fontSize: size * 0.4 }]}>{initials}</Text>
    </View>
  );
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';

  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last  = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

const styles = StyleSheet.create({
  container: {
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
  },
  placeholder: {
    backgroundColor: colors.primarySoft,
  },
  initialsText: {
    color:      colors.primary,
    fontWeight: '700',
  },
});
