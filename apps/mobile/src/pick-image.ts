import * as ImagePicker from 'expo-image-picker';
import { Alert, Keyboard } from 'react-native';
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
  // A galeria usa o seletor de fotos do sistema, que não pede permissão (o app não lê o
  // armazenamento: ver blockedPermissions no app.config.ts). Só a câmera pede.
  if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
    Alert.alert('Permissão necessária', 'Permita o acesso à câmera nas configurações do aparelho.');
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: square,
    ...(square ? { aspect: [1, 1] as [number, number] } : {}),
    quality: 0.7,
  };
  let result: ImagePicker.ImagePickerResult;
  try {
    result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            ...options,
            ...(front ? { cameraType: ImagePicker.CameraType.front } : {}),
          })
        : await ImagePicker.launchImageLibraryAsync(options);
  } catch (error) {
    // Antes a falha sumia em silêncio e parecia que o botão não fazia nada.
    Alert.alert(
      source === 'camera' ? 'Não foi possível abrir a câmera' : 'Não foi possível abrir a galeria',
      error instanceof Error ? error.message : undefined,
    );
    return null;
  }
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
  // Teclado aberto (ex.: depois de digitar a descrição) atrapalha a abertura do seletor.
  Keyboard.dismiss();
  // No Android, o alerta mostra no máximo 3 botões: o "Cancelar" pode ficar de fora, então
  // tocar fora do alerta também fecha.
  Alert.alert(
    'Foto',
    undefined,
    [
      { text: 'Tirar foto', onPress: () => onPick('camera') },
      { text: 'Escolher da galeria', onPress: () => onPick('library') },
      ...extra,
      { text: 'Cancelar', style: 'cancel' },
    ],
    { cancelable: true },
  );
}
