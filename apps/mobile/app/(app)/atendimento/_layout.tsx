import { Stack } from 'expo-router';

/** Atendimento: lista de chamados, novo chamado e a conversa (ADR 0023). */
export default function ConversationsLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
