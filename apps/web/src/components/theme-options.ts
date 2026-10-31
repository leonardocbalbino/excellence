import { type LucideIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import type { ThemePreference } from '@/lib/theme';

export const THEME_OPTIONS: readonly { value: ThemePreference; label: string; icon: LucideIcon }[] =
  [
    { value: 'light', label: 'Claro', icon: SunIcon },
    { value: 'dark', label: 'Escuro', icon: MoonIcon },
    { value: 'system', label: 'Sistema', icon: MonitorIcon },
  ];
