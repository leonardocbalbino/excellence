import { CameraError, openCamera } from './camera';
import { GeolocationError, getCurrentPosition } from './geolocation';

function geolocationStub(
  behavior: { position: GeolocationPosition } | { error: Pick<GeolocationPositionError, 'code'> },
): Geolocation {
  return {
    getCurrentPosition: (success, failure, options) => {
      expect(options).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
      if ('position' in behavior) success(behavior.position);
      else
        failure?.({
          ...behavior.error,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: '',
        });
    },
  } as Geolocation;
}

describe('getCurrentPosition', () => {
  it('devolve coordenadas, precisão e horário do dispositivo', async () => {
    const position = {
      timestamp: Date.UTC(2026, 8, 25, 12),
      coords: { latitude: -2.55, longitude: -44.24, accuracy: 12 },
    } as GeolocationPosition;
    await expect(
      getCurrentPosition({ geolocation: geolocationStub({ position }) }),
    ).resolves.toEqual({
      latitude: -2.55,
      longitude: -44.24,
      accuracyMeters: 12,
      deviceTimestamp: '2026-09-25T12:00:00.000Z',
    });
  });

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ] as const)('traduz o código de erro %i para %s', async (code, reason) => {
    const error = await getCurrentPosition({
      geolocation: geolocationStub({ error: { code } }),
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GeolocationError);
    expect((error as GeolocationError).reason).toBe(reason);
  });

  it('sem suporte a geolocalização', async () => {
    const error = await getCurrentPosition({ geolocation: undefined }).catch((e: unknown) => e);
    expect((error as GeolocationError).reason).toBe('unsupported');
  });
});

describe('openCamera', () => {
  const devices = (error?: string) =>
    ({
      getUserMedia: (constraints: MediaStreamConstraints) => {
        expect(constraints.audio).toBe(false);
        return error
          ? Promise.reject(new DOMException('x', error))
          : Promise.resolve({ getTracks: () => [] } as unknown as MediaStream);
      },
    }) as MediaDevices;

  it('abre a câmera pedida', async () => {
    await expect(openCamera('environment', devices())).resolves.toBeDefined();
  });

  it.each([
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'not_found'],
    ['NotReadableError', 'in_use'],
  ])('traduz %s para %s', async (name, reason) => {
    const error = await openCamera('user', devices(name)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CameraError);
    expect((error as CameraError).reason).toBe(reason);
  });

  it('sem suporte a câmera', async () => {
    const error = await openCamera('user', undefined).catch((e: unknown) => e);
    expect((error as CameraError).reason).toBe('unsupported');
  });
});
