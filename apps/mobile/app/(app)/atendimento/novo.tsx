import {
  CONVERSATION_CATEGORY_LABELS,
  type ConversationCategory,
  conversationCategorySchema,
  formatTicketNumber,
} from '@excellence/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { type LocalFile, uploadLocalFile } from '@/device';
import { chooseImageSource, pickImage } from '@/pick-image';
import { conversationsKey } from '@/query-keys';
import { errorMessage, useApi } from '@/services';
import {
  Banner,
  Button,
  Card,
  haptics,
  type IconName,
  Label,
  Screen,
  styles,
  TextField,
  Touchable,
  useColors,
} from '@/ui';

const ICONS: Record<ConversationCategory, IconName> = {
  occurrence: 'warning',
  time_tracking: 'time',
  benefits: 'gift',
  payroll: 'cash',
  documents: 'document-text',
  other: 'help-circle',
};

/** Novo chamado: assunto, mensagem e, se quiser, uma foto. O número sai na hora. */
export default function NewConversationScreen() {
  const api = useApi();
  const c = useColors();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<ConversationCategory | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [photo, setPhoto] = useState<LocalFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attach = () =>
    chooseImageSource((source) => {
      void pickImage(source).then((file) => {
        if (file) setPhoto(file);
      });
    });

  const send = async () => {
    if (!category) return;
    setBusy(true);
    setError(null);
    try {
      const attachmentFileId = photo
        ? await uploadLocalFile(api, photo, 'conversation_attachment')
        : null;
      const created = await api.conversations.start({
        category,
        subject,
        message,
        attachmentFileId,
      });
      haptics.success();
      await queryClient.invalidateQueries({ queryKey: conversationsKey });
      Alert.alert(
        `Chamado ${formatTicketNumber(created.number)} aberto`,
        'O RH vai responder por aqui. Você recebe uma notificação quando houver resposta.',
      );
      router.replace(`/atendimento/${created.id}`);
    } catch (e) {
      haptics.error();
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen title="Novo chamado" subtitle="O RH recebe e responde por aqui" back>
        <Card>
          <Label style={{ fontWeight: '700' }}>Sobre o que é?</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {conversationCategorySchema.options.map((option) => {
              const selected = category === option;
              return (
                <Touchable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setCategory(option)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? c.primary : c.border,
                    backgroundColor: selected ? c.primary : c.card,
                  }}
                >
                  <Ionicons
                    name={ICONS[option]}
                    size={16}
                    color={selected ? c.primaryForeground : c.primary}
                  />
                  <Text
                    style={{
                      color: selected ? c.primaryForeground : c.foreground,
                      fontWeight: '600',
                    }}
                  >
                    {CONVERSATION_CATEGORY_LABELS[option]}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        </Card>

        <Card index={1}>
          <TextField
            label="Assunto"
            value={subject}
            onChangeText={setSubject}
            placeholder="Ex.: Esqueci de bater a saída ontem"
            maxLength={120}
          />
          <TextField
            label="Mensagem"
            value={message}
            onChangeText={setMessage}
            multiline
            placeholder="Conte o que aconteceu. Quanto mais detalhe, mais rápido o RH resolve."
            maxLength={4000}
          />
          {photo ? (
            <View style={[styles.row, { justifyContent: 'flex-start', gap: 12 }]}>
              <Image
                source={{ uri: photo.uri }}
                style={{ width: 64, height: 64, borderRadius: 12 }}
              />
              <Label style={{ flex: 1 }} numberOfLines={1}>
                Foto anexada
              </Label>
              <Touchable accessibilityRole="button" onPress={() => setPhoto(null)}>
                <Label tone="warning" style={{ fontWeight: '700' }}>
                  Remover
                </Label>
              </Touchable>
            </View>
          ) : (
            <Button label="Anexar foto" variant="soft" icon="camera" onPress={attach} />
          )}
        </Card>

        {error ? <Banner tone="warning">{error}</Banner> : null}
        <Button
          label="Enviar chamado"
          icon="send"
          onPress={() => void send()}
          loading={busy}
          disabled={!category || subject.trim().length < 3 || !message.trim()}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
