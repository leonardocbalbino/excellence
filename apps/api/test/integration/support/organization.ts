import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../../src/generated/prisma/client';

/** Unidade ativa com coordenadas, para montar cenários. Código único por chamada. */
export async function createUnit(
  prisma: PrismaClient,
  companyId: string,
  overrides: { name?: string; code?: string; isActive?: boolean } = {},
) {
  const code = overrides.code ?? `U-${randomUUID().slice(0, 8)}`;
  return prisma.unit.create({
    data: {
      companyId,
      name: overrides.name ?? `Unidade ${code}`,
      code,
      latitude: -23.5653,
      longitude: -46.6515,
      geofenceRadiusMeters: 150,
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createDepartment(
  prisma: PrismaClient,
  companyId: string,
  overrides: { name?: string; code?: string; unitId?: string | null } = {},
) {
  const code = overrides.code ?? `D-${randomUUID().slice(0, 8)}`;
  return prisma.department.create({
    data: {
      companyId,
      name: overrides.name ?? `Departamento ${code}`,
      code,
      unitId: overrides.unitId ?? null,
    },
  });
}

let cpfSequence = Math.floor(Math.random() * 1_000_000);

/** CPF válido e diferente a cada chamada (dígitos verificadores calculados). */
export function nextCpf(): string {
  cpfSequence += 1;
  const digits = Array.from(String(200_000_000 + cpfSequence).padStart(9, '0'), Number);
  for (const length of [9, 10]) {
    const sum = digits.slice(0, length).reduce((acc, d, i) => acc + d * (length + 1 - i), 0);
    const rest = sum % 11;
    digits.push(rest < 2 ? 0 : 11 - rest);
  }
  return digits.join('');
}

/** Funcionário direto no banco. */
export async function createEmployee(
  prisma: PrismaClient,
  companyId: string,
  data: {
    unitId: string;
    departmentId?: string | null;
    managerId?: string | null;
    userId?: string | null;
    name?: string;
    registrationNumber?: string;
    terminationDate?: string | null;
  },
) {
  return prisma.employee.create({
    data: {
      companyId,
      registrationNumber: data.registrationNumber ?? `M-${randomUUID().slice(0, 8)}`,
      name: data.name ?? 'Funcionário de Teste',
      cpf: nextCpf(),
      hireDate: new Date('2024-01-02T00:00:00Z'),
      terminationDate: data.terminationDate ? new Date(`${data.terminationDate}T00:00:00Z`) : null,
      unitId: data.unitId,
      departmentId: data.departmentId ?? null,
      managerId: data.managerId ?? null,
      userId: data.userId ?? null,
    },
  });
}
