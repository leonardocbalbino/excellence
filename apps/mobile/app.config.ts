import type { ExpoConfig } from 'expo/config';

/**
 * App Excellence (fase 2, ADR 0019). A API vem de EXPO_PUBLIC_API_URL
 * (ex.: http://192.168.0.10:3000/api/v1 na rede local).
 */
const config: ExpoConfig = {
  name: 'Excellence',
  slug: 'excellence',
  scheme: 'excellence',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: '../web/public/icon-512.png',
  splash: { backgroundColor: '#0f5a52' },
  ios: {
    bundleIdentifier: 'br.com.excellence.app',
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription:
        'A câmera lê o QR code dos pontos de ronda e tira a foto do registro de ponto.',
      NSLocationWhenInUseUsageDescription:
        'A localização confere se o ponto e a ronda foram registrados no local de trabalho.',
      NSFaceIDUsageDescription: 'O Face ID destrava o app sem digitar a senha.',
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
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
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
  ],
  experiments: { typedRoutes: true },
};

export default config;
