import jsQR from 'jsqr';
import { KeyboardIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CameraError, openCamera, stopCamera } from '@/lib/device/camera';

/** Intervalo entre leituras do quadro da câmera (a decodificação roda no processador). */
const SCAN_INTERVAL_MS = 250;

/**
 * Lê um QR code com a câmera traseira. Se a câmera falhar (ou for bloqueada), permite digitar
 * o código impresso abaixo do QR.
 */
export function QrScanner({
  onCode,
  disabled = false,
}: {
  onCode: (code: string) => void;
  disabled?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState('');
  // Leitura em andamento: o mesmo QR não dispara de novo enquanto o pai processa.
  const busy = useRef(disabled);
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    busy.current = disabled;
    onCodeRef.current = onCode;
  }, [disabled, onCode]);

  useEffect(() => {
    if (manual) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let last = '';

    openCamera('environment')
      .then(async (opened) => {
        if (cancelled) {
          stopCamera(opened);
          return;
        }
        stream = opened;
        const element = video.current;
        if (!element) return;
        element.srcObject = opened;
        await element.play();
        timer = setInterval(() => {
          if (busy.current || !context || element.videoWidth === 0) return;
          canvas.width = element.videoWidth;
          canvas.height = element.videoHeight;
          context.drawImage(element, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(image.data, image.width, image.height, {
            inversionAttempts: 'dontInvert',
          });
          if (found?.data && found.data !== last) {
            last = found.data;
            if ('vibrate' in navigator) navigator.vibrate(80);
            onCodeRef.current(found.data);
            // Permite ler o mesmo código de novo depois de um tempo (ex.: após um erro).
            setTimeout(() => {
              last = '';
            }, 3000);
          }
        }, SCAN_INTERVAL_MS);
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
      if (timer) clearInterval(timer);
      if (stream) stopCamera(stream);
    };
  }, [manual]);

  if (manual || error) {
    return (
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (typed.trim()) onCode(typed.trim());
        }}
      >
        {error ? <Alert variant="warning">{error} Digite o código impresso no ponto.</Alert> : null}
        <div className="grid gap-1.5">
          <Label htmlFor="patrol-code">Código do ponto</Label>
          <Input
            id="patrol-code"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            placeholder="EXR1.…"
            className="font-mono"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={disabled || !typed.trim()}>
            Registrar ponto
          </Button>
          {error ? null : (
            <Button type="button" variant="outline" onClick={() => setManual(false)}>
              Voltar para a câmera
            </Button>
          )}
        </div>
      </form>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black sm:aspect-video">
        <video
          ref={video}
          className="size-full object-cover"
          muted
          playsInline
          aria-label="Imagem da câmera"
        />
        {/* Mira */}
        <div
          className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80"
          aria-hidden="true"
        />
        {starting || disabled ? (
          <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
            <Spinner className="size-8" />
          </div>
        ) : null}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Aponte a câmera para o QR code do ponto.
      </p>
      <Button type="button" variant="ghost" onClick={() => setManual(true)}>
        <KeyboardIcon />
        Digitar o código
      </Button>
    </div>
  );
}
