import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, useAppTheme } from '@/constants/tokens';

export function ProfileAvatar({ photoUrl, name, size = 42 }: { photoUrl?: string | null; name: string; size?: number }) {
  const t = useAppTheme();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: t.soft }}>
    <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: size / 3, color: t.muted }}>{initials || '?'}</Text>
    {photoUrl && failedUrl !== photoUrl ? <Image key={photoUrl} source={{ uri: photoUrl }} contentFit="cover" cachePolicy="memory" accessible={false} style={StyleSheet.absoluteFill} onError={() => setFailedUrl(photoUrl)} /> : null}
  </View>;
}
