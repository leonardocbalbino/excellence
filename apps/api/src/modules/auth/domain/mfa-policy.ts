/**
 * Decide se o usuário é obrigado a usar MFA. A regra vem da configuração dos perfis
 * (`roles.requires_mfa`, etapa 0.4), nunca do nome do perfil.
 */
export interface MfaPolicy {
  isMfaRequired(user: { id: string; companyId: string }): Promise<boolean>;
}

export const MFA_POLICY = Symbol('MFA_POLICY');
