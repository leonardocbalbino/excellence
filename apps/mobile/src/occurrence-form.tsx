import { formatOccurrenceNumber, type PatrolRun } from '@excellence/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Image, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { type LocalFile, uploadLocalFile } from './device';
import { chooseImageSource, pickImage } from './pick-image';
import { errorMessage, useApi } from './services';
import { Banner, Button, Card, haptics, Label, TextField, Title, Touchable, useColors } from './ui';

/**
 * Ocorrência durante a ronda (ADR 0024): o ponto onde foi vista, o que aconteceu e uma foto.
 * Vira um número N00000 e vai por e-mail para a administração e o síndico do posto.
 */
export function OccurrenceForm({ run }: { run: PatrolRun }) {
  const api = useApi();
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [pointId, setPointId] = useState<string | null>(run.nextPoint?.id ?? null);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<LocalFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const reset = () => {
    setDescription('');
    setPhoto(null);
    setError(null);
  };

  const addPhoto = () =>
    chooseImageSource((source) => {
      void pickImage(source).then((file) => {
        if (file) setPhoto(file);
      });
    });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const photoFileId = photo ? await uploadLocalFile(api, photo, 'patrol_occurrence') : null;
      const occurrence = await api.patrols.reportOccurrence(run.id, {
        pointId,
        description: description.trim(),
        photoFileId,
      });
      haptics.success();
      setSent(formatOccurrenceNumber(occurrence.number));
      reset();
      setOpen(false);
    } catch (failure) {
      haptics.error();
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <>
        {sent ? (
          <Banner tone="success">
            Ocorrência {sent} registrada. A administração e o síndico recebem por e-mail.
          </Banner>
        ) : null}
        <Button
          label="Registrar ocorrência"
          variant="outline"
          icon="warning"
          onPress={() => {
            setSent(null);
            setOpen(true);
          }}
        />
      </>
    );
  }

  return (
    <Animated.View entering={FadeInDown.springify().damping(18)}>
      <Card>
        <Title style={{ fontSize: 18 }}>Nova ocorrência</Title>
        <Label tone="muted">Onde foi?</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[{ id: null, name: 'Fora dos pontos' }, ...run.points].map((point) => {
            const selected = pointId === point.id;
            return (
              <Touchable
                key={point.id ?? 'none'}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setPointId(point.id)}
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
        <TextField
          label="O que aconteceu"
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder="Ex.: portão da garagem aberto e sem cadeado."
        />
        {photo ? (
          <View style={{ gap: 8 }}>
            <Image
              source={{ uri: photo.uri }}
              style={{ width: '100%', height: 180, borderRadius: 14 }}
              accessibilityLabel="Foto da ocorrência"
            />
            <Button label="Trocar foto" variant="ghost" icon="camera" onPress={addPhoto} />
          </View>
        ) : (
          <Touchable
            accessibilityRole="button"
            onPress={addPhoto}
            style={{
              alignItems: 'center',
              gap: 6,
              padding: 18,
              borderRadius: 14,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: c.border,
            }}
          >
            <Ionicons name="camera" size={28} color={c.primary} />
            <Label tone="muted">Adicionar foto</Label>
          </Touchable>
        )}
        {error ? <Banner tone="warning">{error}</Banner> : null}
        <Button
          label="Enviar ocorrência"
          icon="send"
          onPress={() => void submit()}
          loading={busy}
          disabled={description.trim().length < 5}
        />
        <Button
          label="Cancelar"
          variant="ghost"
          onPress={() => {
            reset();
            setOpen(false);
          }}
        />
      </Card>
    </Animated.View>
  );
}
