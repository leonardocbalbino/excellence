export type CameraFailure = 'unsupported' | 'denied' | 'not_found' | 'in_use';

export class CameraError extends Error {
  constructor(readonly reason: CameraFailure) {
    super(CAMERA_MESSAGES[reason]);
    this.name = 'CameraError';
  }
}

export const CAMERA_MESSAGES: Record<CameraFailure, string> = {
  unsupported: 'Este navegador não permite usar a câmera.',
  denied: 'A câmera foi bloqueada. Libere o acesso nas configurações do navegador.',
  not_found: 'Nenhuma câmera encontrada neste dispositivo.',
  in_use: 'A câmera está em uso por outro aplicativo.',
};

/**
 * Abre a câmera. `user` é a frontal (selfie do ponto); `environment` é a traseira
 * (QR code e fotos de ocorrência na ronda). Quem chama deve parar as trilhas ao terminar.
 */
export async function openCamera(
  facingMode: 'user' | 'environment',
  mediaDevices: MediaDevices | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.mediaDevices,
): Promise<MediaStream> {
  if (!mediaDevices?.getUserMedia) throw new CameraError('unsupported');
  try {
    return await mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new CameraError('denied');
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new CameraError('not_found');
    }
    if (name === 'NotReadableError') throw new CameraError('in_use');
    throw error;
  }
}

export function stopCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/** Captura um quadro do vídeo como JPEG, sem metadados (o canvas não carrega EXIF). */
export async function captureFrame(video: HTMLVideoElement, quality = 0.85): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas indisponível');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Falha ao capturar a imagem'));
      },
      'image/jpeg',
      quality,
    );
  });
}
