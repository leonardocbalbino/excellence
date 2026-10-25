import {
  CONVERSATION_CATEGORY_LABELS,
  type ConversationMessage,
  formatTicketNumber,
} from '@excellence/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type LocalFile, uploadLocalFile } from '@/device';
import { chooseImageSource, pickImage } from '@/pick-image';
import { conversationsKey, conversationsUnreadKey } from '@/query-keys';
import { errorMessage, useApi } from '@/services';
import { Banner, Chip, haptics, Label, Skeleton, styles, Touchable, useColors } from '@/ui';

function time(iso: string): string {
  const date = new Date(iso);
  const today = new Date().toDateString() === date.toDateString();
  return date.toLocaleString('pt-BR', {
    ...(today ? {} : { day: '2-digit', month: '2-digit' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Bubble({
  message,
  conversationId,
}: {
  message: ConversationMessage;
  conversationId: string;
}) {
  const api = useApi();
  const c = useColors();
  const mine = message.side === 'employee';
  const [opening, setOpening] = useState(false);
  const openAttachment = async (fileId: string) => {
    setOpening(true);
    try {
      const link = await api.conversations.attachment(conversationId, fileId);
      await Linking.openURL(link.url);
    } finally {
      setOpening(false);
    }
  };
  return (
    <Animated.View
      entering={FadeInUp.springify().damping(18)}
      style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}
    >
      <View
        style={{
          maxWidth: '82%',
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 20,
          borderBottomRightRadius: mine ? 6 : 20,
          borderBottomLeftRadius: mine ? 20 : 6,
          backgroundColor: mine ? c.primary : c.card,
          borderWidth: mine ? 0 : 1,
          borderColor: c.border,
          gap: 4,
        }}
      >
        {mine ? null : (
          <Text style={{ color: c.primary, fontWeight: '800', fontSize: 12.5 }}>
            {message.author.name} · RH
          </Text>
        )}
        <Text
          style={{
            color: mine ? c.primaryForeground : c.foreground,
            fontSize: 15.5,
            lineHeight: 21,
          }}
        >
          {message.body}
        </Text>
        {message.attachment ? (
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={`Abrir anexo ${message.attachment.name}`}
            onPress={() => message.attachment && void openAttachment(message.attachment.id)}
            style={[styles.row, { justifyContent: 'flex-start', gap: 6 }]}
          >
            {opening ? (
              <ActivityIndicator size="small" color={mine ? '#fff' : c.primary} />
            ) : (
              <Ionicons name="attach" size={16} color={mine ? '#fff' : c.primary} />
            )}
            <Text
              numberOfLines={1}
              style={{
                color: mine ? '#ffffff' : c.primary,
                fontWeight: '700',
                textDecorationLine: 'underline',
                flexShrink: 1,
              }}
            >
              {message.attachment.name}
            </Text>
          </Touchable>
        ) : null}
        <Text
          style={{
            color: mine ? '#ffffffb3' : c.mutedForeground,
            fontSize: 11,
            alignSelf: 'flex-end',
          }}
        >
          {time(message.createdAt)}
        </Text>
      </View>
    </Animated.View>
  );
}

/** A conversa do chamado. Abrir marca as respostas do RH como lidas. */
export default function ConversationScreen() {
  const api = useApi();
  const c = useColors();
  const queryClient = useQueryClient();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const conversation = useQuery({
    queryKey: [...conversationsKey, id],
    queryFn: () => api.conversations.openMine(id),
    // A resposta do RH aparece sozinha (e chega por push quando o app está fechado).
    refetchInterval: 8_000,
  });
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<LocalFile | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const count = conversation.data?.messages.length ?? 0;

  useEffect(() => {
    // Lidas: atualiza o selo de "com resposta" em Mais.
    if (count > 0) void queryClient.invalidateQueries({ queryKey: conversationsUnreadKey });
  }, [count, queryClient]);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const attachmentFileId = photo
        ? await uploadLocalFile(api, photo, 'conversation_attachment')
        : null;
      await api.conversations.replyMine(id, { body, attachmentFileId });
      haptics.success();
      setBody('');
      setPhoto(null);
      await conversation.refetch();
      await queryClient.invalidateQueries({ queryKey: conversationsKey });
    } catch (e) {
      haptics.error();
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const data = conversation.data;
  const closed = data?.status === 'closed';

  return (
    <SafeAreaView
      style={[styles.flex, { backgroundColor: c.background }]}
      edges={['top', 'bottom']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
            backgroundColor: c.card,
          }}
        >
          <Touchable
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={26} color={c.primary} />
          </Touchable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.primary, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
              {data ? `Chamado ${formatTicketNumber(data.number)}` : 'Chamado'}
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: c.foreground, fontWeight: '700', fontSize: 16 }}
            >
              {data?.subject ?? '…'}
            </Text>
          </View>
          {data ? (
            <Chip
              tone={closed ? 'success' : 'primary'}
              label={closed ? 'Encerrado' : CONVERSATION_CATEGORY_LABELS[data.category]}
            />
          ) : null}
        </View>

        <ScrollView
          ref={scroll}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {conversation.isPending ? (
            <>
              <Skeleton height={60} style={{ width: '70%' }} />
              <Skeleton height={60} style={{ width: '60%', alignSelf: 'flex-end' }} />
            </>
          ) : null}
          {conversation.isError ? (
            <Banner tone="warning">{errorMessage(conversation.error)}</Banner>
          ) : null}
          {data?.messages.map((message) => (
            <Bubble key={message.id} message={message} conversationId={id} />
          ))}
          {closed ? (
            <Label tone="muted" style={{ textAlign: 'center', fontSize: 13 }}>
              O RH encerrou este chamado. Se precisar, envie uma mensagem para reabrir.
            </Label>
          ) : null}
        </ScrollView>

        {error ? (
          <View style={{ paddingHorizontal: 12 }}>
            <Banner tone="warning">{error}</Banner>
          </View>
        ) : null}
        {photo ? (
          <View
            style={[
              styles.row,
              { justifyContent: 'flex-start', gap: 10, paddingHorizontal: 14, paddingTop: 8 },
            ]}
          >
            <Image
              source={{ uri: photo.uri }}
              style={{ width: 48, height: 48, borderRadius: 10 }}
            />
            <Label style={{ flex: 1 }}>Foto anexada</Label>
            <Touchable
              accessibilityRole="button"
              accessibilityLabel="Remover foto"
              onPress={() => setPhoto(null)}
            >
              <Ionicons name="close-circle" size={24} color={c.mutedForeground} />
            </Touchable>
          </View>
        ) : null}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 8,
            padding: 10,
            borderTopWidth: 1,
            borderTopColor: c.border,
            backgroundColor: c.card,
          }}
        >
          <Touchable
            accessibilityRole="button"
            accessibilityLabel="Anexar foto"
            onPress={() =>
              chooseImageSource((source) => {
                void pickImage(source).then((file) => {
                  if (file) setPhoto(file);
                });
              })
            }
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="camera-outline" size={26} color={c.primary} />
          </Touchable>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={closed ? 'Escreva para reabrir o chamado' : 'Escreva uma mensagem'}
            placeholderTextColor={c.mutedForeground}
            multiline
            maxLength={4000}
            accessibilityLabel="Mensagem"
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 120,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.background,
              color: c.foreground,
              paddingHorizontal: 16,
              paddingTop: 11,
              paddingBottom: 11,
              fontSize: 15.5,
            }}
          />
          <Touchable
            accessibilityRole="button"
            accessibilityLabel="Enviar"
            disabled={!body.trim() || sending}
            scaleTo={0.9}
            onPress={() => void send()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: c.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !body.trim() || sending ? 0.5 : 1,
            }}
          >
            {sending ? (
              <ActivityIndicator color={c.primaryForeground} />
            ) : (
              <Ionicons name="send" size={20} color={c.primaryForeground} />
            )}
          </Touchable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
