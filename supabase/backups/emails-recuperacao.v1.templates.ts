// ═════════════════════════════════════════════════════════════════
// NOTINHA — emails-recuperacao/templates.ts
// Templates HTML dos e-mails de recuperação (fonte: emails/onboarding-
// recuperacao do repositório). Placeholders {chave} são substituídos em
// runtime pela função merge() — nada de valor hardcode no corpo.
//   R1/R2: {primeiro_nome} {codigo} {numero_whatsapp} {pixel_url}
//   R3:    {primeiro_nome} {link_oauth_drive} {pixel_url}
//   ALERTA_D7:    {primeiro_nome} {email_cliente} {whatsapp_cliente}
//                 {codigo} {senha_criada} {drive_status}
//   ALERTA_FALHA: {primeiro_nome} {email_cliente} {whatsapp_cliente}
//                 {motivo_falha} {codigo}
// ═════════════════════════════════════════════════════════════════

// Merge de placeholders {chave} → valor; chave desconhecida fica intacta
export function merge(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([a-z_]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

const RODAPE = `<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e6ecec;">
<p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8aa0a0;">
Notinha · usenotinha.com.br · CNPJ 66.824.150/0001-28<br>
E-mail transacional referente à sua assinatura ativa do Notinha.</p>
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8aa0a0;">
Precisa de ajuda? <a href="https://usenotinha.com.br/contato" style="color:#288A89;text-decoration:underline;">Fale com o suporte</a>.</p>
</td></tr>`;

const CABECALHO = `<tr><td style="background-color:#288A89;padding:28px 32px;text-align:center;">
<span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:bold;color:#ffffff;">Notinha</span><br>
<span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#d8ecec;">Suas notas organizadas no WhatsApp</span>
</td></tr>`;

export const TPL_R1 = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Falta 1 toque pra ativar 📲</title></head>
<body style="margin:0;padding:0;background-color:#f2f4f4;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Teu Notinha tá pronto, só esperando teu oi.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f2f4f4;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
${CABECALHO}
<tr><td style="padding:36px 32px 8px 32px;">
<h1 style="margin:0 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:#1a2b2b;">Falta 1 toque 📲</h1>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">{primeiro_nome}, tua assinatura tá ativa e paga — mas teu Notinha ainda não acordou no WhatsApp.</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">É literalmente 1 clique: o botão abaixo abre o WhatsApp com a mensagem pronta. Só apertar enviar.</p>
</td></tr>
<tr><td style="padding:8px 32px 24px 32px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="border-radius:100px;background-color:#25D366;text-align:center;">
<a href="https://wa.me/{numero_whatsapp}?text=ATIVAR%20{codigo}" style="display:inline-block;padding:14px 36px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:100px;">Ativar no WhatsApp →</a>
</td></tr></table></td></tr>
<tr><td style="padding:0 32px;">
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">Se o botão não abrir, manda esta mensagem manualmente no nosso WhatsApp:</p>
<p style="margin:0 0 16px 0;text-align:center;"><span style="display:inline-block;background:#f0f5f5;border:1px dashed #288A89;border-radius:8px;padding:14px 24px;font-family:Courier,monospace;font-size:18px;letter-spacing:1px;color:#1a2b2b;">ATIVAR {codigo}</span></p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">Assim que ativar, tua planilha é criada no teu Google Drive e a primeira foto de nota já entra organizada.</p>
</td></tr>
${RODAPE}
</table>
<img src="{pixel_url}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;

export const TPL_R2 = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Precisa de uma mão?</title></head>
<body style="margin:0;padding:0;background-color:#f2f4f4;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Vi que tua ativação ainda não rolou. Deixa eu ajudar.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f2f4f4;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
${CABECALHO}
<tr><td style="padding:36px 32px 8px 32px;">
<h1 style="margin:0 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:#1a2b2b;">Precisa de uma mão?</h1>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">Oi, {primeiro_nome}. Aqui é do Notinha — reparei que teu assistente ainda não foi ativado no WhatsApp.</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">Às vezes é correria, às vezes travou algo no caminho. Se travou, me deixa ajudar: responde este e-mail contando o que aconteceu, ou chama a gente no suporte. Gente de verdade responde.</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">Se foi só correria, teu botão continua aqui:</p>
</td></tr>
<tr><td style="padding:8px 32px 24px 32px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="border-radius:100px;background-color:#25D366;text-align:center;">
<a href="https://wa.me/{numero_whatsapp}?text=ATIVAR%20{codigo}" style="display:inline-block;padding:14px 36px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:100px;">Ativar no WhatsApp →</a>
</td></tr></table></td></tr>
<tr><td style="padding:0 32px;">
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">Se o botão não abrir, manda esta mensagem manualmente no nosso WhatsApp:</p>
<p style="margin:0 0 16px 0;text-align:center;"><span style="display:inline-block;background:#f0f5f5;border:1px dashed #288A89;border-radius:8px;padding:14px 24px;font-family:Courier,monospace;font-size:18px;letter-spacing:1px;color:#1a2b2b;">ATIVAR {codigo}</span></p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">Suporte direto: <a href="https://usenotinha.com.br/contato" style="color:#288A89;">usenotinha.com.br/contato</a></p>
</td></tr>
${RODAPE}
</table>
<img src="{pixel_url}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;

export const TPL_R3 = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Só falta conectar teu Google Drive</title></head>
<body style="margin:0;padding:0;background-color:#f2f4f4;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Sem o Drive, tua planilha não tem onde morar.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f2f4f4;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
${CABECALHO}
<tr><td style="padding:36px 32px 8px 32px;">
<h1 style="margin:0 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:#1a2b2b;">Só falta o Google Drive 📁</h1>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">{primeiro_nome}, teu Notinha já foi ativado no WhatsApp — ótimo! Mas falta um detalhe importante: conectar teu Google Drive.</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">É lá que mora tua planilha de gastos. <strong style="color:#1a2b2b;">Ela é criada na tua conta, no teu Drive</strong> — é tua pra sempre, com ou sem a gente. Sem essa conexão, as notas que você mandar não têm onde ser organizadas.</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">A conexão é oficial do Google, leva 30 segundos e a gente só pede permissão pra criar e editar a pasta do Notinha — nada além disso.</p>
</td></tr>
<tr><td style="padding:8px 32px 24px 32px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="border-radius:100px;background-color:#288A89;text-align:center;">
<a href="{link_oauth_drive}" style="display:inline-block;padding:14px 36px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:100px;">Conectar meu Google Drive →</a>
</td></tr></table></td></tr>
<tr><td style="padding:0 32px;">
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">Deu erro na conexão? <a href="https://usenotinha.com.br/contato" style="color:#288A89;">Fala com o suporte</a> que resolvemos junto.</p>
</td></tr>
${RODAPE}
</table>
<img src="{pixel_url}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;

export const TPL_ALERTA_D7 = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>[AÇÃO] Pagou há 7 dias e nunca ativou</title></head>
<body style="margin:0;padding:0;background-color:#f2f4f4;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Alerta interno — risco de churn na garantia.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f2f4f4;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
${CABECALHO}
<tr><td style="padding:36px 32px 8px 32px;">
<h1 style="margin:0 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:#1a2b2b;">⚠️ D+7 sem ativação</h1>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">Alerta automático: cliente pagou há 7 dias e nunca ativou o WhatsApp. Já recebeu BV, R1 e R2 sem resposta.</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;"><strong style="color:#1a2b2b;">Cliente:</strong> {primeiro_nome} — {email_cliente} — {whatsapp_cliente}</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;"><strong style="color:#1a2b2b;">Código:</strong> {codigo} · <strong style="color:#1a2b2b;">Senha criada:</strong> {senha_criada} · <strong style="color:#1a2b2b;">Drive:</strong> {drive_status}</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;"><strong style="color:#1a2b2b;">Risco:</strong> cliente dentro da garantia de 30 dias sem usar o produto = reembolso quase certo.</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;"><strong style="color:#1a2b2b;">Ação:</strong> contato humano pelo WhatsApp hoje. Tom de ajuda, não de cobrança.</p>
</td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e6ecec;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8aa0a0;">
Notinha · usenotinha.com.br · alerta interno automático.</p>
</td></tr></table></td></tr></table></body></html>`;

export const TPL_ALERTA_FALHA = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>[AÇÃO] Falha de entrega persistente</title></head>
<body style="margin:0;padding:0;background-color:#f2f4f4;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Alerta interno — falha de entrega.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f2f4f4;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
${CABECALHO}
<tr><td style="padding:36px 32px 8px 32px;">
<h1 style="margin:0 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:#1a2b2b;">⚠️ Falha de entrega — cliente pagou</h1>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">Alerta automático: e-mail transacional NÃO entregue após 3 tentativas.</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;"><strong style="color:#1a2b2b;">Cliente:</strong> {primeiro_nome} — {email_cliente} — {whatsapp_cliente}</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;"><strong style="color:#1a2b2b;">Motivo:</strong> {motivo_falha}</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;"><strong style="color:#1a2b2b;">Código de ativação:</strong> {codigo}</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;"><strong style="color:#1a2b2b;">Ação:</strong> contatar o cliente pelo WhatsApp em até 24h e enviar o código manualmente. Registrar contato na tabela email_falhas (marcar resolvido).</p>
</td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e6ecec;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8aa0a0;">
Notinha · usenotinha.com.br · alerta interno automático.</p>
</td></tr></table></td></tr></table></body></html>`;
