import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import type { LocalFile } from './device';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Foto da câmera ou da galeria. Com `square`, o sistema abre o recorte quadrado (foto de
 * perfil). null = desistiu ou sem permissão.
 */
export async function pickImage(
  source: 'camera' | 'library',
  { square = false, front = false }: { square?: boolean; front?: boolean } = {},
): Promise<LocalFile | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permissão necessária', 'Permita o acesso nas configurações do aparelho.');
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: square,
    ...(square ? { aspect: [1, 1] as [number, number] } : {}),
    quality: 0.7,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          ...options,
          ...(front ? { cameraType: ImagePicker.CameraType.front } : {}),
        })
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  // Com compressão, o sistema entrega JPEG; outros tipos (HEIC) vão como JPEG também.
  const contentType =
    asset.mimeType && ACCEPTED.includes(asset.mimeType) ? asset.mimeType : 'image/jpeg';
  return { uri: asset.uri, fileName: asset.fileName ?? 'foto.jpg', contentType };
}

/** Pergunta a origem da foto (câmera ou galeria). */
export function chooseImageSource(
  onPick: (source: 'camera' | 'library') => void,
  extra: { text: string; style?: 'destructive'; onPress: () => void }[] = [],
): void {
  Alert.alert('Foto', undefined, [
    { text: 'Tirar foto', onPress: () => onPick('camera') },
    { text: 'Escolher da galeria', onPress: () => onPick('library') },
    ...extra,
    { text: 'Cancelar', style: 'cancel' },
  ]);
}
