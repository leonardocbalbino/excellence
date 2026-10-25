import type { AuthenticatedResponse, MfaPendingResponse } from '@excellence/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { biometricAvailable, biometricEnabled, setBiometricEnabled } from '@/device';
import { errorMessage, useServices, useSession } from '@/services';
import {
  Banner,
  Button,
  Card,
  haptics,
  Label,
  styles,
  TextField,
  Title,
  Touchable,
  useColors,
} from '@/ui';

type Step = { kind: 'credentials' } | { kind: 'mfa'; pending: MfaPendingResponse };

/**
 * Entrada no app. Perfis que exigem MFA informam o código do autenticador; o cadastro do MFA
 * (primeiro acesso de RH/Admin) é feito pelo site.
 */
export default function LoginScreen() {
  const { api, session } = useServices();
  const state = useSession();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === 'authenticated') return <Redirect href="/" />;

  const complete = async (response: AuthenticatedResponse) => {
    haptics.success();
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

  const fail = (e: unknown) => {
    haptics.error();
    setError(errorMessage(e));
  };

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await api.auth.login({ email: email.trim(), password, client: 'mobile' });
      if (response.status === 'authenticated') await complete(response);
      else if (response.status === 'mfa_required') setStep({ kind: 'mfa', pending: response });
      else {
        haptics.warning();
        setError(
          'Seu perfil exige verificação em duas etapas. Cadastre o autenticador pelo site e depois entre no app.',
        );
      }
    } catch (e) {
      fail(e);
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
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.grow} keyboardShouldPersistTaps="handled">
        <LinearGradient
          colors={c.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingTop: insets.top + 48,
            paddingBottom: 80,
            paddingHorizontal: 24,
            borderBottomLeftRadius: 36,
            borderBottomRightRadius: 36,
            gap: 14,
            overflow: 'hidden',
          }}
        >
          <View style={[styles.heroBubble, { top: -70, right: -50 }]} />
          <Animated.View
            entering={ZoomIn.springify().damping(12)}
            style={{
              width: 72,
              height: 72,
              borderRadius: 24,
              backgroundColor: '#ffffff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="shield-checkmark" size={38} color="#0f5a52" />
          </Animated.View>
          <Animated.View entering={FadeInUp.delay(120).springify()}>
            <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -0.5 }}>
              Excellence
            </Text>
            <Text style={{ color: '#ffffffd9', fontSize: 17, marginTop: 4 }}>
              Ponto, rondas e benefícios na palma da mão.
            </Text>
          </Animated.View>
        </LinearGradient>

        <Animated.View
          entering={FadeInDown.delay(200).springify().damping(18)}
          style={{
            marginTop: -48,
            paddingHorizontal: 18,
            gap: 14,
            paddingBottom: insets.bottom + 24,
          }}
        >
          <Card style={{ padding: 20, gap: 14 }}>
            <Title>{step.kind === 'credentials' ? 'Entrar' : 'Código de verificação'}</Title>
            {step.kind === 'credentials' ? (
              <>
                <TextField
                  label="E-mail"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="username"
                  placeholder="nome@empresa.com.br"
                  returnKeyType="next"
                />
                <View>
                  <TextField
                    label="Senha"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoComplete="current-password"
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={() => void signIn()}
                  />
                  <Touchable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                    onPress={() => setShowPassword((v) => !v)}
                    style={{ position: 'absolute', right: 12, bottom: 14 }}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={22}
                      color={c.mutedForeground}
                    />
                  </Touchable>
                </View>
                <Button
                  label="Entrar"
                  icon="log-in-outline"
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
                <TextField
                  label="Código"
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={11}
                  style={{ fontSize: 22, letterSpacing: 4 }}
                />
                <Button
                  label="Verificar"
                  icon="checkmark"
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
          <Label tone="muted" style={{ textAlign: 'center' }}>
            Primeiro acesso? Use a senha temporária enviada pelo RH. Esqueceu a senha? Fale com o
            RH.
          </Label>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
