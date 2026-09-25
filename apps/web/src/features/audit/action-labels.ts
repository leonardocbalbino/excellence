/** Nomes legíveis das ações conhecidas; as demais aparecem como gravadas. */
export const ACTION_LABELS: Record<string, string> = {
  'auth.login_succeeded': 'Login',
  'auth.login_failed': 'Login recusado',
  'auth.logout': 'Logout',
  'auth.mfa_enabled': 'MFA ativado',
  'auth.mfa_failed': 'Código MFA recusado',
  'auth.refresh_token_reused': 'Reuso de sessão detectado',
  'role.created': 'Perfil criado',
  'role.updated': 'Perfil alterado',
  'role.deleted': 'Perfil excluído',
  'user.roles_changed': 'Perfis do usuário alterados',
  'sensitive_data.read': 'Leitura de dado sensível',
};
