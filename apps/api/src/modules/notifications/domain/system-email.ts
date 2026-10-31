/**
 * Modelo único dos e-mails do sistema (template "System Notification" do Resend, com a
 * identidade preto e dourado). Cada valor é escapado; quebras de linha viram <br>. O cartão de
 * informação e o botão só aparecem quando informados.
 */
export interface SystemEmail {
  /** Faixa acima do título (ex.: "Ocorrência de ronda"). */
  category: string;
  title: string;
  /** Saudação "Olá, …!"; sem ela, o e-mail começa pela mensagem. */
  userName?: string | null;
  message: string;
  info?: { label: string; content: string } | null;
  action?: { url: string; text: string } | null;
}

const APP_NAME = 'EXCELLENCE';
const APP_SUBTITLE = 'Gestão de pessoas, ponto e rondas';

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function rich(text: string): string {
  return escapeHtml(text).replaceAll('\n', '<br />');
}

export function systemEmailHtml(email: SystemEmail, year = new Date().getFullYear()): string {
  const greeting = email.userName
    ? `<p style="margin:0 0 22px;font-size:15px;line-height:1.8;color:#555555;">Olá, <strong>${escapeHtml(email.userName)}</strong>!</p>`
    : '';
  const info = email.info
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#faf8f4;border:1px solid #e9dfce;border-radius:9px;margin-bottom:28px;">
                  <tr>
                    <td style="padding:20px 22px;">
                      <p style="margin:0 0 8px;font-size:12px;color:#9b7b48;text-transform:uppercase;letter-spacing:1px;font-weight:bold;">${escapeHtml(email.info.label)}</p>
                      <p style="margin:0;font-size:15px;line-height:1.7;color:#252525;">${rich(email.info.content)}</p>
                    </td>
                  </tr>
                </table>`
    : '';
  const button = email.action
    ? `<table cellpadding="0" cellspacing="0" border="0" align="center">
                  <tr>
                    <td align="center" bgcolor="#c9a45e" style="border-radius:8px;">
                      <a href="${escapeHtml(email.action.url)}" style="display:inline-block;padding:15px 32px;color:#171717;text-decoration:none;font-size:14px;font-weight:bold;">${escapeHtml(email.action.text)} &nbsp; →</a>
                    </td>
                  </tr>
                </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(email.title)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f2eb;font-family:Arial,Helvetica,sans-serif;color:#171717;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f2eb;padding:35px 15px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e8dfcf;">
            <tr>
              <td style="background-color:#171717;padding:32px 30px;text-align:center;">
                <div style="font-size:25px;font-weight:bold;letter-spacing:2px;color:#d8b36b;">${APP_NAME}</div>
                <div style="margin-top:9px;font-size:12px;color:#c9c1b2;letter-spacing:1px;">${APP_SUBTITLE}</div>
                <div style="height:2px;width:55px;background-color:#c9a45e;margin:22px auto 0;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:35px 30px;">
                <p style="margin:0 0 12px;font-size:13px;color:#a17c3f;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(email.category)}</p>
                <h1 style="margin:0 0 20px;font-size:25px;line-height:1.3;color:#171717;">${escapeHtml(email.title)}</h1>
                ${greeting}
                <p style="margin:0 0 25px;font-size:15px;line-height:1.8;color:#555555;">${rich(email.message)}</p>
                ${info}
                ${button}
                <p style="margin:30px 0 0;font-size:13px;line-height:1.7;color:#888888;text-align:center;">Se você não reconhece esta notificação, entre em contato com o administrador do sistema.</p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#171717;padding:25px 30px;text-align:center;">
                <p style="margin:0 0 8px;font-size:13px;color:#d8b36b;font-weight:bold;letter-spacing:1px;">${APP_NAME}</p>
                <p style="margin:0 0 12px;font-size:12px;color:#aaa49a;line-height:1.6;">Gestão, organização e eficiência em um só lugar.</p>
                <div style="height:1px;background-color:#39352e;margin:18px 0;"></div>
                <p style="margin:0;font-size:11px;color:#888888;line-height:1.7;">Este é um e-mail automático. Por favor, não responda diretamente a esta mensagem.<br /><br />© ${String(year)} Excellence. Todos os direitos reservados.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
