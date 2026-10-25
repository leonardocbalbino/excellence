import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Button, Card, EmptyState } from './ui';

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
      <EmptyState icon="camera-outline" title="Permita a câmera" text={reason} />
      {permission.canAskAgain ? (
        <Button label="Permitir câmera" icon="camera" onPress={() => void request()} />
      ) : (
        <Button
          label="Abrir configurações"
          variant="outline"
          icon="settings-outline"
          onPress={() => void Linking.openSettings()}
        />
      )}
    </Card>
  );
}

/** Cantos do visor (moldura do QR code). */
function Corners({ color }: { color: string }) {
  const corner = { position: 'absolute' as const, width: 42, height: 42, borderColor: color };
  return (
    <>
      <View
        style={[
          corner,
          { top: 0, left: 0, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 18 },
        ]}
      />
      <View
        style={[
          corner,
          { top: 0, right: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 18 },
        ]}
      />
      <View
        style={[
          corner,
          {
            bottom: 0,
            left: 0,
            borderBottomWidth: 5,
            borderLeftWidth: 5,
            borderBottomLeftRadius: 18,
          },
        ]}
      />
      <View
        style={[
          corner,
          {
            bottom: 0,
            right: 0,
            borderBottomWidth: 5,
            borderRightWidth: 5,
            borderBottomRightRadius: 18,
          },
        ]}
      />
    </>
  );
}

export type ScanFeedback = { tone: 'success' | 'error'; at: number } | null;

/**
 * Leitor de QR code dos pontos de ronda (câmera traseira). A linha de leitura desce e sobe
 * no visor; a cada leitura, o visor pisca verde (aceito) ou vermelho (recusado). O mesmo
 * código lido de novo em poucos segundos é ignorado, para não registrar duas vezes.
 */
export function QrScanner({
  onCode,
  paused = false,
  feedback = null,
}: {
  onCode: (code: string) => void;
  paused?: boolean;
  feedback?: ScanFeedback;
}) {
  const cameraPermission = useCameraPermissions();
  const [permission] = cameraPermission;
  const last = useRef<{ code: string; at: number } | null>(null);
  const reduced = useReducedMotion();
  const line = useSharedValue(0);
  const flash = useSharedValue(0);
  const [box, setBox] = useState(0);

  useEffect(() => {
    if (reduced || paused) return;
    line.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [line, paused, reduced]);
  useEffect(() => {
    if (!feedback) return;
    flash.value = withSequence(
      withTiming(0.55, { duration: 90 }),
      withTiming(0, { duration: 500 }),
    );
  }, [feedback, flash]);

  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: line.value * (box - 4) }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  if (!permission?.granted) {
    return (
      <PermissionRequest
        reason="O app precisa da câmera para ler o QR code do ponto de ronda."
        permission={cameraPermission}
      />
    );
  }
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={{ aspectRatio: 1, borderRadius: 28, overflow: 'hidden', backgroundColor: '#000' }}
    >
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
        onLayout={(e) => setBox(e.nativeEvent.layout.height)}
        style={{ position: 'absolute', top: '17%', left: '17%', right: '17%', bottom: '17%' }}
      >
        <Corners color="#ffffff" />
        {reduced ? null : (
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: 10,
                right: 10,
                height: 3,
                borderRadius: 2,
                backgroundColor: '#4fb3a5',
                shadowColor: '#4fb3a5',
                shadowOpacity: 0.9,
                shadowRadius: 8,
              },
              lineStyle,
            ]}
          />
        )}
      </View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            inset: 0,
            backgroundColor: feedback?.tone === 'error' ? '#dc2626' : '#16a34a',
          },
          flashStyle,
        ]}
      />
    </Animated.View>
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
      <Animated.View entering={FadeIn} style={{ gap: 10 }}>
        <Image
          source={{ uri: photo }}
          style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 28 }}
          accessibilityLabel="Foto capturada"
        />
        <Button
          label="Tirar outra"
          variant="outline"
          icon="refresh"
          onPress={() => {
            setPhoto(null);
            onChange(null);
          }}
        />
      </Animated.View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          aspectRatio: 3 / 4,
          borderRadius: 28,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        <CameraView ref={camera} style={{ flex: 1 }} facing="front" />
        {/* Moldura do rosto. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: '14%',
            left: '20%',
            right: '20%',
            bottom: '22%',
            borderRadius: 999,
            borderWidth: 3,
            borderColor: '#ffffffcc',
            borderStyle: 'dashed',
          }}
        />
      </View>
      <Button
        label="Capturar foto"
        icon="camera"
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
