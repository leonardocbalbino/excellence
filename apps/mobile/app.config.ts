import type { ExpoConfig } from 'expo/config';

/**
 * App do funcionário (ADR 0019, ADR 0022).
 *
 * A API do app oficial é a de produção. Em desenvolvimento, EXPO_PUBLIC_API_URL troca o
 * endereço (ex.: http://192.168.0.10:3000/api/v1 na rede local). Os perfis do EAS
 * (eas.json) fixam o endereço de cada build.
 */
export const PRODUCTION_API_URL = 'http://169.58.37.26:8200/api/v1';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? PRODUCTION_API_URL;
/** Projeto no EAS (expo.dev): identifica o app nos builds e no token de push. Não é segredo. */
const easProjectId = process.env.EAS_PROJECT_ID ?? '201d3eba-f68d-40a9-ab0a-111ba43f0fb7';

const config: ExpoConfig = {
  name: 'Excellence',
  slug: 'excellence',
  scheme: 'excellence',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: '../web/public/icon-512.png',
  splash: {
    image: '../web/public/icon-512.png',
    resizeMode: 'contain',
    backgroundColor: '#0f5a52',
  },
  ios: {
    bundleIdentifier: 'br.com.excellence.app',
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription:
        'A câmera lê o QR code dos pontos de ronda e tira a foto do registro de ponto.',
      NSLocationWhenInUseUsageDescription:
        'A localização confere se o ponto e a ronda foram registrados no local de trabalho.',
      NSFaceIDUsageDescription: 'O Face ID destrava o app sem digitar a senha.',
      // A API de produção ainda é HTTP num IP (sem domínio nem certificado). O iOS bloqueia
      // HTTP por padrão; esta liberação sai quando a API tiver HTTPS (ADR 0022).
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: apiUrl.startsWith('http://') },
    },
  },
  android: {
    package: 'br.com.excellence.app',
    adaptiveIcon: {
      foregroundImage: '../web/public/icon-maskable-512.png',
      backgroundColor: '#0f5a52',
    },
    permissions: [
      'android.permission.CAMERA',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.USE_BIOMETRIC',
      'android.permission.VIBRATE',
      'android.permission.POST_NOTIFICATIONS',
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    [
      'expo-camera',
      {
        cameraPermission:
          'A câmera lê o QR code dos pontos de ronda e tira a foto do registro de ponto.',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'A localização confere se o ponto e a ronda foram registrados no local de trabalho.',
      },
    ],
    [
      'expo-local-authentication',
      { faceIDPermission: 'O Face ID destrava o app sem digitar a senha.' },
    ],
    ['expo-notifications', { color: '#0f5a52' }],
    [
      'expo-build-properties',
      // Android também bloqueia HTTP por padrão (mesmo motivo do iOS acima).
      { android: { usesCleartextTraffic: apiUrl.startsWith('http://') } },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiUrl,
    eas: { projectId: easProjectId },
  },
};

export default config;
