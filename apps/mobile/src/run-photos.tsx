import type { PatrolRun } from '@excellence/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { View } from 'react-native';
import { uploadLocalFile } from './device';
import { pickImage } from './pick-image';
import { errorMessage, isRetryable, useApi } from './services';
import { Banner, Button, Card, haptics, Label, Title, Touchable, useColors } from './ui';

/**
 * Foto no local durante a ronda: mostra que o funcionário passou pelo ponto. Não é
 * ocorrência (não gera número nem avisa ninguém). Só pela câmera, para valer como prova de
 * presença; o ponto sugerido é o último lido.
 */
export function RunPhotos({ run, onRun }: { run: PatrolRun; onRun: (next: PatrolRun) => void }) {
  const api = useApi();
  const c = useColors();
  const lastRead = run.points
    .filter((p) => p.checkin)
    .sort((a, b) => (b.checkin?.recordedAt ?? '').localeCompare(a.checkin?.recordedAt ?? ''))[0];
  // undefined = segue o último ponto lido; null = fora dos pontos.
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  const pointId = choice === undefined ? (lastRead?.id ?? null) : choice;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = async () => {
    setError(null);
    const file = await pickImage('camera');
    if (!file) return;
    setBusy(true);
    try {
      const fileId = await uploadLocalFile(api, file, 'patrol_photo');
      onRun(await api.patrols.addPhoto(run.id, { fileId, pointId }));
      haptics.success();
      setChoice(undefined);
    } catch (failure) {
      haptics.error();
      setError(
        isRetryable(failure)
          ? 'Sem conexão: a foto precisa de internet para ser enviada. Tente de novo em seguida.'
          : errorMessage(failure),
      );
    } finally {
      setBusy(false);
    }
  };

  const names = new Map(run.points.map((p) => [p.id, p.name]));

  return (
    <Card>
      <Title style={{ fontSize: 18 }}>Foto no local</Title>
      <Label tone="muted" style={{ fontSize: 14 }}>
        Mostre que você passou pelo ponto. Não é ocorrência: ninguém é avisado.
      </Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[{ id: null, name: 'Fora dos pontos' }, ...run.points].map((point) => {
          const selected = pointId === point.id;
          return (
            <Touchable
              key={point.id ?? 'none'}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setChoice(point.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: selected ? c.primary : c.border,
                backgroundColor: selected ? c.primarySoft : 'transparent',
              }}
            >
              <Label style={{ fontWeight: selected ? '700' : '500', fontSize: 14 }}>
                {point.name}
              </Label>
            </Touchable>
          );
        })}
      </View>
      <Button
        label="Tirar foto"
        variant="soft"
        icon="camera"
        onPress={() => void take()}
        loading={busy}
      />
      {run.photos.length > 0 ? (
        <View style={{ gap: 6 }}>
          {run.photos.map((photo) => (
            <View key={photo.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="image-outline" size={18} color={c.success} />
              <Label style={{ fontSize: 14 }}>
                {photo.localTime} ·{' '}
                {photo.point ? (names.get(photo.point.id) ?? photo.point.name) : 'Fora dos pontos'}
              </Label>
            </View>
          ))}
        </View>
      ) : null}
      {error ? <Banner tone="warning">{error}</Banner> : null}
    </Card>
  );
}
