import { CameraIcon, RefreshCwIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/feedback';
import { CameraError, captureFrame, openCamera, stopCamera } from '@/lib/device/camera';

/** Câmera frontal para a selfie do ponto. Devolve a foto (JPEG sem EXIF) ou null. */
export function CameraCapture({ onChange }: { onChange: (photo: Blob | null) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  // Cada tentativa (montagem ou "tirar outra") reabre a câmera.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    openCamera('user')
      .then(async (opened) => {
        if (cancelled) {
          stopCamera(opened);
          return;
        }
        stream.current = opened;
        if (video.current) {
          video.current.srcObject = opened;
          await video.current.play();
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof CameraError ? e.message : 'Não foi possível abrir a câmera.');
        }
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });
    return () => {
      cancelled = true;
      if (stream.current) stopCamera(stream.current);
      stream.current = null;
    };
  }, [attempt]);

  const capture = async () => {
    if (!video.current) return;
    const photo = await captureFrame(video.current);
    setPreview(URL.createObjectURL(photo));
    onChange(photo);
    if (stream.current) stopCamera(stream.current);
  };

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    onChange(null);
    setError(null);
    setStarting(true);
    setAttempt((n) => n + 1);
  };

  if (error) return <Alert variant="destructive">{error}</Alert>;

  return (
    <div className="grid gap-3">
      {preview ? (
        <img
          src={preview}
          alt="Foto capturada"
          className="mx-auto aspect-[3/4] w-48 rounded-lg object-cover"
        />
      ) : (
        <div className="relative mx-auto aspect-[3/4] w-48 overflow-hidden rounded-lg bg-muted">
          {/* A imagem é espelhada só na tela, como num espelho. */}
          <video
            ref={video}
            className="h-full w-full -scale-x-100 object-cover"
            playsInline
            muted
          />
          {starting ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner label="Abrindo a câmera" />
            </div>
          ) : null}
        </div>
      )}
      <div className="flex justify-center">
        {preview ? (
          <Button type="button" variant="outline" onClick={retake}>
            <RefreshCwIcon />
            Tirar outra
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => void capture()}
            disabled={starting}
          >
            <CameraIcon />
            Capturar foto
          </Button>
        )}
      </div>
    </div>
  );
}
