import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Image, Linking, View } from 'react-native';
import { Button, Card, Label } from './ui';

type Permission = ReturnType<typeof useCameraPermissions>;

function PermissionRequest({
  reason,
  permission: [permission, request],
}: {
  reason: string;
  permission: Permission;
}) {
  if (!permission) return null;
  return (
    <Card>
      <Label>{reason}</Label>
      {permission.canAskAgain ? (
        <Button label="Permitir câmera" onPress={() => void request()} />
      ) : (
        <Button
          label="Abrir configurações"
          variant="outline"
          onPress={() => void Linking.openSettings()}
        />
      )}
    </Card>
  );
}

/**
 * Leitor de QR code dos pontos de ronda (câmera traseira). Ignora o mesmo código lido de novo
 * por alguns segundos, para não registrar duas vezes.
 */
export function QrScanner({
  onCode,
  paused = false,
}: {
  onCode: (code: string) => void;
  paused?: boolean;
}) {
  const cameraPermission = useCameraPermissions();
  const [permission] = cameraPermission;
  const last = useRef<{ code: string; at: number } | null>(null);
  if (!permission?.granted) {
    return (
      <PermissionRequest
        reason="O app precisa da câmera para ler o QR code do ponto."
        permission={cameraPermission}
      />
    );
  }
  return (
    <View style={{ aspectRatio: 1, borderRadius: 16, overflow: 'hidden' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={
          paused
            ? undefined
            : ({ data }) => {
                const now = Date.now();
                if (last.current && last.current.code === data && now - last.current.at < 3000) {
                  return;
                }
                last.current = { code: data, at: now };
                onCode(data);
              }
        }
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '18%',
          left: '18%',
          right: '18%',
          bottom: '18%',
          borderWidth: 4,
          borderColor: '#ffffffcc',
          borderRadius: 20,
        }}
      />
    </View>
  );
}

/** Foto do registro de ponto (câmera frontal). Devolve o endereço local da foto. */
export function SelfieCapture({ onChange }: { onChange: (uri: string | null) => void }) {
  const cameraPermission = useCameraPermissions();
  const [permission] = cameraPermission;
  const camera = useRef<CameraView>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!permission?.granted) {
    return (
      <PermissionRequest
        reason="O app precisa da câmera para a foto do registro de ponto."
        permission={cameraPermission}
      />
    );
  }
  if (photo) {
    return (
      <View style={{ gap: 8 }}>
        <Image
          source={{ uri: photo }}
          style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 16 }}
          accessibilityLabel="Foto capturada"
        />
        <Button
          label="Tirar outra"
          variant="outline"
          onPress={() => {
            setPhoto(null);
            onChange(null);
          }}
        />
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <View style={{ aspectRatio: 3 / 4, borderRadius: 16, overflow: 'hidden' }}>
        <CameraView ref={camera} style={{ flex: 1 }} facing="front" />
      </View>
      <Button
        label="Capturar foto"
        loading={busy}
        onPress={() => {
          setBusy(true);
          void camera.current
            ?.takePictureAsync({ quality: 0.6, exif: false })
            .then((picture) => {
              setPhoto(picture.uri);
              onChange(picture.uri);
            })
            .finally(() => setBusy(false));
        }}
      />
    </View>
  );
}
