import { PASSWORD_RESET_MINUTES } from '@excellence/shared';
import { systemEmailHtml } from '../../notifications/domain/system-email';

/** E-mail com o link de "esqueci minha senha", no modelo do sistema. */
export function passwordResetEmail(data: { name: string; link: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = 'Redefinição de senha · Excellence';
  const message =
    'Recebemos um pedido para redefinir a senha da sua conta. Use o botão abaixo para criar uma senha nova.';
  const info = `O link vale por ${String(PASSWORD_RESET_MINUTES)} minutos e só pode ser usado uma vez. Se você não pediu a redefinição, ignore este e-mail: a sua senha atual continua valendo.`;
  const text = [`Olá, ${data.name}!`, '', message, '', data.link, '', info].join('\n');
  const html = systemEmailHtml({
    category: 'Segurança da conta',
    title: 'Redefinir a sua senha',
    userName: data.name,
    message,
    info: { label: 'Importante', content: info },
    action: { url: data.link, text: 'Criar senha nova' },
  });
  return { subject, text, html };
}
