import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, FolderOpenIcon, GlobeIcon, PlusIcon } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { useApi } from '@/lib/services';
import { unitsQueryKey } from './query-keys';
import { type FolderTab, unitFolderPath } from './unit-folder-path';

const itemClass =
  'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-accent';

/**
 * Cadastro a partir de uma visão consolidada (fora da pasta): escolhe o posto e abre a aba
 * da pasta dele, onde o cadastro de fato acontece. Com `onGeneral`, oferece também o
 * cadastro geral da empresa (turnos e escalas sem posto).
 */
export function NewInUnitButton({
  label,
  tab,
  onGeneral,
}: {
  label: string;
  tab: FolderTab;
  onGeneral?: () => void;
}) {
  const api = useApi();
  const navigate = useNavigate();
  const units = useQuery({
    queryKey: [...unitsQueryKey, { includeInactive: false }],
    queryFn: () => api.units.list(false),
  });
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button>
          <PlusIcon />
          {label}
          <ChevronDownIcon />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 max-h-96 min-w-64 overflow-y-auto rounded-lg border bg-card p-1.5 text-card-foreground shadow-lg"
        >
          <DropdownMenu.Label className="px-2.5 pt-1 pb-1.5 text-xs font-semibold text-muted-foreground">
            Em qual posto?
          </DropdownMenu.Label>
          {units.data?.length === 0 ? (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">Nenhum posto ativo.</p>
          ) : null}
          {units.data?.map((unit) => (
            <DropdownMenu.Item
              key={unit.id}
              className={itemClass}
              onSelect={() => void navigate(unitFolderPath(unit.id, tab))}
            >
              <FolderOpenIcon className="size-4 text-primary" aria-hidden="true" />
              {unit.name}
            </DropdownMenu.Item>
          ))}
          {onGeneral ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item className={itemClass} onSelect={onGeneral}>
                <GlobeIcon className="size-4" aria-hidden="true" />
                Geral (qualquer posto)
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Aviso das visões consolidadas: o cadastro fica na pasta de cada posto. */
export function ConsolidatedNote({ what }: { what: string }) {
  return (
    <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
      Visão consolidada de todos os postos. O cadastro de {what} fica na pasta de cada posto: use o
      botão para escolher o posto ou abra o posto na lista.
    </p>
  );
}
