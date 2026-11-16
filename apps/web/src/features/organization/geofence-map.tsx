import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import type { Circle, CircleMarker, Map as LeafletMap } from 'leaflet';
import { MapPinIcon, SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';

/** Centro do Brasil, para quando o posto ainda não tem localização. */
const BRAZIL: [number, number] = [-14.2, -51.9];

interface Place {
  label: string;
  latitude: number;
  longitude: number;
}

/**
 * Busca de endereço no OpenStreetMap (Nominatim): gratuita e sem chave. Só roda quando a
 * pessoa clica em "Buscar"; vai o texto digitado, nada mais.
 */
async function searchPlaces(query: string): Promise<Place[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '5',
    countrycodes: 'br',
    'accept-language': 'pt-BR',
  }).toString();
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('A busca de endereço não respondeu. Tente de novo.');
  const rows = (await response.json()) as { display_name: string; lat: string; lon: string }[];
  return rows.map((row) => ({
    label: row.display_name,
    latitude: Number(row.lat),
    longitude: Number(row.lon),
  }));
}

/**
 * Mapa da cerca virtual: buscar o endereço ou clicar no mapa marca o centro do posto; o
 * círculo mostra o raio. Quem não sabe latitude e longitude não precisa digitá-las.
 */
export function GeofenceMap({
  latitude,
  longitude,
  radiusMeters,
  address,
  disabled = false,
  onPick,
}: {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  /** Endereço do cadastro, sugerido na busca. */
  address: string;
  disabled?: boolean;
  onPick: (latitude: number, longitude: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<CircleMarker | null>(null);
  const circle = useRef<Circle | null>(null);
  const leaflet = useRef<typeof Leaflet | null>(null);
  // O clique no mapa usa sempre a versão atual do callback e do bloqueio.
  const pick = useRef(onPick);
  const locked = useRef(disabled);
  useEffect(() => {
    pick.current = onPick;
    locked.current = disabled;
  });
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Cria o mapa uma vez (Leaflet carregado sob demanda: só quem abre o cadastro baixa).
  useEffect(() => {
    let cancelled = false;
    void import('leaflet')
      .then((L) => {
        if (cancelled || !container.current) return;
        leaflet.current = L;
        const instance = L.map(container.current, { scrollWheelZoom: false }).setView(
          latitude !== null && longitude !== null ? [latitude, longitude] : BRAZIL,
          latitude !== null && longitude !== null ? 17 : 4,
        );
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; colaboradores do OpenStreetMap',
        }).addTo(instance);
        instance.on('click', (event) => {
          if (locked.current) return;
          pick.current(round(event.latlng.lat), round(event.latlng.lng));
        });
        map.current = instance;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setMapError('Não foi possível carregar o mapa.');
      });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
      circle.current = null;
    };
    // Só na montagem: a posição muda depois pelos efeitos abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marcador e círculo acompanham o formulário (digitado, buscado ou clicado).
  useEffect(() => {
    const L = leaflet.current;
    const instance = map.current;
    if (!ready || !L || !instance) return;
    marker.current?.remove();
    circle.current?.remove();
    marker.current = null;
    circle.current = null;
    if (latitude === null || longitude === null) return;
    const center: [number, number] = [latitude, longitude];
    if (radiusMeters) {
      circle.current = L.circle(center, {
        radius: radiusMeters,
        color: '#b8893b',
        fillColor: '#c9a356',
        fillOpacity: 0.2,
        weight: 2,
      }).addTo(instance);
    }
    marker.current = L.circleMarker(center, {
      radius: 8,
      color: '#ffffff',
      weight: 3,
      fillColor: '#b8893b',
      fillOpacity: 1,
    }).addTo(instance);
  }, [ready, latitude, longitude, radiusMeters]);

  const flyTo = (lat: number, lng: number) => {
    map.current?.setView([lat, lng], 17);
  };

  const search = async (text: string) => {
    if (!text.trim()) return;
    setSearching(true);
    setSearchError(null);
    setPlaces(null);
    try {
      const found = await searchPlaces(text.trim());
      setPlaces(found);
      const [first] = found;
      if (found.length === 1 && first) choose(first);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Falha na busca.');
    } finally {
      setSearching(false);
    }
  };

  const choose = (place: Place) => {
    onPick(round(place.latitude), round(place.longitude));
    flyTo(place.latitude, place.longitude);
    setPlaces(null);
  };

  return (
    <div className="grid gap-3">
      {disabled ? null : (
        <div className="grid gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="Buscar endereço no mapa"
              placeholder="Ex.: Av. dos Holandeses, 100, São Luís"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void search(query);
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={searching || !query.trim()}
              onClick={() => void search(query)}
            >
              {searching ? <Spinner /> : <SearchIcon />}
              Buscar
            </Button>
          </div>
          {address ? (
            <Button
              type="button"
              variant="link"
              className="h-auto justify-start p-0 text-left whitespace-normal"
              onClick={() => {
                setQuery(address);
                void search(address);
              }}
            >
              <MapPinIcon />
              Buscar pelo endereço do cadastro: {address}
            </Button>
          ) : null}
          {searchError ? <Alert variant="destructive">{searchError}</Alert> : null}
          {places?.length === 0 ? (
            <Alert>
              Nenhum endereço encontrado. Tente só a rua e a cidade, ou clique direto no mapa.
            </Alert>
          ) : null}
          {places && places.length > 1 ? (
            <ul className="grid gap-1 rounded-lg border p-1" aria-label="Endereços encontrados">
              {places.map((place) => (
                <li key={`${String(place.latitude)},${String(place.longitude)}`}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => choose(place)}
                  >
                    {place.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      {mapError ? (
        <Alert variant="destructive">{mapError}</Alert>
      ) : (
        <div
          ref={container}
          className="relative z-0 h-72 w-full overflow-hidden rounded-lg border bg-muted sm:h-96"
          role="application"
          aria-label="Mapa: clique para marcar o centro do posto"
        />
      )}
      <p className="text-sm text-muted-foreground">
        {disabled
          ? 'Centro do posto e raio da cerca.'
          : 'Busque o endereço ou clique no mapa no local do posto. O círculo mostra o raio da cerca.'}
      </p>
    </div>
  );
}

/** 6 casas decimais: cerca de 10 cm, mais que suficiente. */
function round(value: number): number {
  return Number(value.toFixed(6));
}
