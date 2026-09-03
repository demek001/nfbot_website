// ═════════════════════════════════════════════════════════════════
// NOTINHA — emails-recuperacao/templates.ts
// Templates HTML dos e-mails de recuperação (fonte: emails/onboarding-
// recuperacao do repositório — R1/R2/R3 são GERADOS dos HTMLs, não editar
// à mão). Padrão visual do site: fundo claro, faixa teal, Fraunces + DM Sans.
// Placeholders {chave} substituídos em runtime pela função merge():
//   R1/R2: {primeiro_nome} {codigo} {numero_whatsapp} {pixel_url}
//   R3:    {primeiro_nome} {link_oauth_drive} {pixel_url}
//   ALERTA_D7 / ALERTA_FALHA (internos, layout próprio): ver campos abaixo
// ═════════════════════════════════════════════════════════════════

// Merge de placeholders {chave} → valor; chave desconhecida fica intacta
export function merge(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([a-z_]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// Cabeçalho/rodapé claros usados SÓ nos alertas internos (suporte@)
const RODAPE = `<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e6ecec;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8aa0a0;">
Notinha · usenotinha.com.br · alerta interno automático.</p>
</td></tr>`;

const CABECALHO = `<tr><td style="background-color:#288A89;padding:28px 32px;text-align:center;">
<span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:bold;color:#ffffff;">Notinha</span><br>
<span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#d8ecec;">Suas notas organizadas no WhatsApp</span>
</td></tr>`;

export const TPL_R1 = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Falta 1 toque pra ativar 📲</title></head>
<body style="margin:0;padding:0;background-color:#f4f6f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Seu Notinha tá pronto, só esperando seu oi.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e3e9e9;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:#288A89;padding:28px 32px;" align="center">
<span style="font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:28px;font-weight:800;color:#ffffff;">Notinha</span></td></tr>
<tr><td style="padding:32px 32px 8px 32px;">
<h1 style="margin:0 0 8px 0;font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:26px;line-height:1.25;font-weight:800;color:#14302f;">Falta 1 toque 📲</h1></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">{primeiro_nome}, sua assinatura tá ativa e paga — mas seu Notinha ainda não acordou no WhatsApp.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">É literalmente 1 clique: o botão abaixo abre o WhatsApp com a mensagem pronta. Só apertar enviar.</p></td></tr>
<tr><td style="padding:8px 32px 24px 32px;" align="center"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:100px;background-color:#25D366;text-align:center;"><a href="https://wa.me/{numero_whatsapp}?text=ATIVAR%20{codigo}" style="display:inline-block;padding:15px 40px;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:100px;">Ativar no WhatsApp →</a></td></tr></table></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#6b7d7d;">Se o botão não abrir, manda esta mensagem manualmente no nosso WhatsApp:</p></td></tr>
<tr><td style="padding:0 32px 20px 32px;" align="center"><span style="display:inline-block;background:#f0f5f5;border:1px dashed #288A89;border-radius:8px;padding:14px 28px;font-family:'Courier New',Courier,monospace;font-size:18px;letter-spacing:1px;color:#14302f;">ATIVAR {codigo}</span></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Assim que ativar, sua planilha é criada no seu Google Drive e a primeira foto de nota já entra organizada.</p></td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e3e9e9;">
<p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:12px;line-height:1.6;color:#8aa0a0;">
Notinha · CNPJ 66.824.150/0001-28 · Santos/SP<br>
E-mail transacional referente à sua assinatura ativa do Notinha.<br>
Precisa de ajuda? <a href="https://usenotinha.com.br/contato" style="color:#22706f;text-decoration:underline;">Fale com o suporte</a>.</p>
</td></tr></table>
<img src="{pixel_url}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;

export const TPL_R2 = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Precisa de uma mão?</title></head>
<body style="margin:0;padding:0;background-color:#f4f6f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Vi que sua ativação ainda não rolou. Deixa a gente ajudar.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e3e9e9;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:#288A89;padding:28px 32px;" align="center">
<span style="font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:28px;font-weight:800;color:#ffffff;">Notinha</span></td></tr>
<tr><td style="padding:32px 32px 8px 32px;">
<h1 style="margin:0 0 8px 0;font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:26px;line-height:1.25;font-weight:800;color:#14302f;">Precisa de uma mão?</h1></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Oi, {primeiro_nome}. Aqui é do Notinha — reparei que seu assistente ainda não foi ativado no WhatsApp.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Às vezes é correria, às vezes travou algo no caminho. Se travou, deixa a gente ajudar: responde este e-mail contando o que aconteceu, ou chama a gente no suporte. Gente de verdade responde.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Se foi só correria, seu botão continua aqui:</p></td></tr>
<tr><td style="padding:8px 32px 24px 32px;" align="center"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:100px;background-color:#25D366;text-align:center;"><a href="https://wa.me/{numero_whatsapp}?text=ATIVAR%20{codigo}" style="display:inline-block;padding:15px 40px;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:100px;">Ativar no WhatsApp →</a></td></tr></table></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#6b7d7d;">Se o botão não abrir, manda esta mensagem manualmente no nosso WhatsApp:</p></td></tr>
<tr><td style="padding:0 32px 20px 32px;" align="center"><span style="display:inline-block;background:#f0f5f5;border:1px dashed #288A89;border-radius:8px;padding:14px 28px;font-family:'Courier New',Courier,monospace;font-size:18px;letter-spacing:1px;color:#14302f;">ATIVAR {codigo}</span></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Suporte direto: <a href="https://usenotinha.com.br/contato" style="color:#22706f;text-decoration:underline;">usenotinha.com.br/contato</a></p></td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e3e9e9;">
<p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:12px;line-height:1.6;color:#8aa0a0;">
Notinha · CNPJ 66.824.150/0001-28 · Santos/SP<br>
E-mail transacional referente à sua assinatura ativa do Notinha.<br>
Precisa de ajuda? <a href="https://usenotinha.com.br/contato" style="color:#22706f;text-decoration:underline;">Fale com o suporte</a>.</p>
</td></tr></table>
<img src="{pixel_url}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;

export const TPL_R3 = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Só falta conectar seu Google Drive</title></head>
<body style="margin:0;padding:0;background-color:#f4f6f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Sem o Drive, sua planilha não tem onde morar.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e3e9e9;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:#288A89;padding:28px 32px;" align="center">
<span style="font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:28px;font-weight:800;color:#ffffff;">Notinha</span></td></tr>
<tr><td style="padding:32px 32px 8px 32px;">
<h1 style="margin:0 0 8px 0;font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:26px;line-height:1.25;font-weight:800;color:#14302f;">Só falta o Google Drive 📁</h1></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">{primeiro_nome}, seu Notinha já foi ativado no WhatsApp — ótimo! Mas falta um detalhe importante: conectar seu Google Drive.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">É lá que mora sua planilha de gastos. <strong style="color:#14302f;font-weight:600;">Ela é criada na sua conta, no seu Drive</strong> — é sua pra sempre, com ou sem a gente. Sem essa conexão, as notas que você mandar não têm onde ser organizadas.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">A conexão é oficial do Google, leva 30 segundos e a gente só pede permissão pra criar e editar a pasta do Notinha — nada além disso.</p></td></tr>
<tr><td style="padding:8px 32px 24px 32px;" align="center"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:100px;background-color:#288A89;text-align:center;"><a href="{link_oauth_drive}" style="display:inline-block;padding:15px 40px;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:100px;">Conectar meu Google Drive →</a></td></tr></table></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#6b7d7d;">Deu erro na conexão? <a href="https://usenotinha.com.br/contato" style="color:#22706f;text-decoration:underline;">Fala com o suporte</a> que resolvemos junto.</p></td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e3e9e9;">
<p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:12px;line-height:1.6;color:#8aa0a0;">
Notinha · CNPJ 66.824.150/0001-28 · Santos/SP<br>
E-mail transacional referente à sua assinatura ativa do Notinha.<br>
Precisa de ajuda? <a href="https://usenotinha.com.br/contato" style="color:#22706f;text-decoration:underline;">Fale com o suporte</a>.</p>
</td></tr></table>
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
