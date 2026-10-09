import type { AuthenticatedResponse, MfaPendingResponse } from '@excellence/shared';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { biometricAvailable, biometricEnabled, setBiometricEnabled } from '@/device';
import { errorMessage, useServices, useSession } from '@/services';
import { Banner, Button, Card, Label, Screen, styles, Title, useColors } from '@/ui';

type Step = { kind: 'credentials' } | { kind: 'mfa'; pending: MfaPendingResponse };

/**
 * Entrada no app. Perfis que exigem MFA informam o código do autenticador; o cadastro do MFA
 * (primeiro acesso de RH/Admin) é feito pelo site.
 */
export default function LoginScreen() {
  const { api, session } = useServices();
  const state = useSession();
  const c = useColors();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === 'authenticated') return <Redirect href="/" />;

  const complete = async (response: AuthenticatedResponse) => {
    await session.signIn(response);
    // Primeira entrada neste aparelho: oferece destravar com biometria.
    if ((await biometricAvailable()) && !(await biometricEnabled())) {
      Alert.alert(
        'Usar biometria?',
        'Destrave o app com a digital ou o rosto, sem digitar a senha.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Usar', onPress: () => void setBiometricEnabled(true) },
        ],
      );
    }
  };

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await api.auth.login({ email, password, client: 'mobile' });
      if (response.status === 'authenticated') await complete(response);
      else if (response.status === 'mfa_required') setStep({ kind: 'mfa', pending: response });
      else {
        setError(
          'Seu perfil exige verificação em duas etapas. Cadastre o autenticador pelo site e depois entre no app.',
        );
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (step.kind !== 'mfa') return;
    setBusy(true);
    setError(null);
    try {
      await complete(await api.auth.verifyMfa(step.pending.mfaToken, { code }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const input = [
    styles.label,
    {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      color: c.foreground,
      borderRadius: 12,
      paddingHorizontal: 14,
      minHeight: 48,
    },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <View style={{ backgroundColor: c.primary, borderRadius: 20, padding: 20, gap: 6 }}>
          <Title style={{ color: '#ffffff' }}>Excellence</Title>
          <Label style={{ color: '#ffffffd9', fontSize: 20, fontWeight: '700' }}>
            Seu ponto e o RH na palma da mão.
          </Label>
        </View>
        <Card>
          <Title>{step.kind === 'credentials' ? 'Entrar' : 'Código de verificação'}</Title>
          {step.kind === 'credentials' ? (
            <>
              <Label>E-mail</Label>
              <TextInput
                style={input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
                accessibilityLabel="E-mail"
                placeholder="nome@empresa.com.br"
                placeholderTextColor={c.mutedForeground}
              />
              <Label>Senha</Label>
              <TextInput
                style={input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                accessibilityLabel="Senha"
              />
              <Button
                label="Entrar"
                onPress={() => void signIn()}
                loading={busy}
                disabled={!email || !password}
              />
            </>
          ) : (
            <>
              <Label tone="muted">
                Informe os 6 dígitos do aplicativo autenticador ou um código de recuperação.
              </Label>
              <TextInput
                style={input}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                keyboardType="default"
                maxLength={11}
                accessibilityLabel="Código"
              />
              <Button
                label="Verificar"
                onPress={() => void verify()}
                loading={busy}
                disabled={!code}
              />
              <Button
                label="Voltar"
                variant="ghost"
                onPress={() => {
                  setCode('');
                  setStep({ kind: 'credentials' });
                }}
              />
            </>
          )}
          {error ? <Banner tone="warning">{error}</Banner> : null}
        </Card>
        <Label tone="muted">
          Primeiro acesso? Use a senha temporária enviada pelo RH. Esqueceu a senha? Fale com o RH.
        </Label>
      </Screen>
    </KeyboardAvoidingView>
  );
}
