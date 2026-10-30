import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { uploadLocalFile } from './device';
import { chooseImageSource, pickImage } from './pick-image';
import { errorMessage, useApi } from './services';
import { BRAND, haptics, Touchable, useColors } from './ui';

export const avatarKey = ['me', 'avatar'] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}

/** Link temporário da foto (o servidor emite por alguns minutos; renova antes de vencer). */
export function useAvatar() {
  const api = useApi();
  return useQuery({
    queryKey: avatarKey,
    queryFn: () => api.profile.avatar(),
    staleTime: 4 * 60_000,
  });
}

/** Escolhe a origem (câmera, galeria ou remover), envia e atualiza a foto. */
export function useChangeAvatar() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const hasPhoto = useAvatar().data != null;

  const apply = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      haptics.success();
      await queryClient.invalidateQueries({ queryKey: avatarKey });
    } catch (error) {
      haptics.error();
      Alert.alert('Não foi possível trocar a foto', errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const fromSource = (source: 'camera' | 'library') => {
    void (async () => {
      const file = await pickImage(source, { square: true, front: true });
      if (!file) return;
      await apply(async () => {
        const fileId = await uploadLocalFile(api, file, 'avatar');
        await api.profile.setAvatar({ fileId });
      });
    })();
  };

  const change = () =>
    chooseImageSource(
      fromSource,
      hasPhoto
        ? [
            {
              text: 'Remover foto',
              style: 'destructive',
              onPress: () => void apply(() => api.profile.removeAvatar()),
            },
          ]
        : [],
    );

  return { change, busy };
}

/** Foto de perfil redonda (ou as iniciais). Com `editable`, um toque abre a troca. */
export function Avatar({
  name,
  size = 60,
  editable = false,
  inverse = false,
}: {
  name: string;
  size?: number;
  editable?: boolean;
  /** Sobre o degradê: fundo branco. */
  inverse?: boolean;
}) {
  const c = useColors();
  const avatar = useAvatar();
  const { change, busy } = useChangeAvatar();
  const content = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: inverse ? BRAND.gold : c.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {avatar.data ? (
        <Animated.View entering={ZoomIn.springify()}>
          <Image
            source={{ uri: avatar.data.url }}
            style={{ width: size, height: size }}
            accessibilityLabel="Sua foto de perfil"
          />
        </Animated.View>
      ) : (
        <Text
          style={{
            color: inverse ? BRAND.ink : c.primary,
            fontSize: size * 0.36,
            fontWeight: '800',
          }}
        >
          {initials(name)}
        </Text>
      )}
      {busy ? (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#00000066',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
    </View>
  );
  if (!editable) return content;
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel="Alterar foto de perfil"
      onPress={change}
      disabled={busy}
    >
      {content}
      <View
        style={{
          position: 'absolute',
          right: -2,
          bottom: -2,
          width: size * 0.36,
          height: size * 0.36,
          borderRadius: size * 0.18,
          backgroundColor: c.primary,
          borderWidth: 2,
          borderColor: inverse ? '#ffffff' : c.card,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="camera" size={size * 0.18} color="#fff" />
      </View>
    </Touchable>
  );
}
