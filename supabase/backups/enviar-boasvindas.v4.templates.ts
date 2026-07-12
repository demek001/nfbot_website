// ═════════════════════════════════════════════════════════════════
// NOTINHA — enviar-boasvindas/templates.ts
// Templates do ciclo de pagamento (fonte: emails/ciclo-pagamento/ do
// repositório — este arquivo é GERADO a partir dos HTMLs, não editar à mão).
// Placeholders {chave} substituídos em runtime pelo merge() do index.ts:
//   REEMBOLSO / CANCELAMENTO / COBRANCA / PAUSADO: {primeiro_nome} {pixel_url}
//   ALERTA_CHARGEBACK (interno): {primeiro_nome} {email_cliente}
//                                {whatsapp_cliente} {ref_pagamento}
// ═════════════════════════════════════════════════════════════════

export const TPL_REEMBOLSO = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>Reembolso confirmado ✅</title></head>
<body style="margin:0;padding:0;background-color:#0d1117;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Teu dinheiro está voltando — combinado é combinado.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0d1117;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#161b22;border:1px solid #30363d;border-radius:16px;overflow:hidden;">
<tr><td style="padding:28px 32px;border-bottom:1px solid #30363d;" align="center">
<span style="font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:28px;font-weight:800;color:#288A89;">Notinha</span></td></tr>
<tr><td style="padding:32px 32px 8px 32px;">
<h1 style="margin:0 0 8px 0;font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:26px;line-height:1.25;font-weight:800;color:#e6edf3;">Reembolso confirmado ✅</h1></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#c9d4dd;">Oi, {primeiro_nome}. Confirmando: teu reembolso foi feito e tua assinatura do Notinha está encerrada. Nenhuma cobrança nova vai acontecer.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#c9d4dd;">O valor volta pelo mesmo meio que você usou pra pagar: no PIX cai em instantes; no cartão, o estorno pode levar até duas faturas pra aparecer, dependendo do banco.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#c9d4dd;"><strong style="color:#e6edf3;font-weight:600;">Tua planilha continua tua.</strong> Ela mora no teu Google Drive, então nada some — todos os gastos que o Notinha organizou ficam com você, pra sempre.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#c9d4dd;">Obrigado por ter testado a gente. Se um dia quiser voltar, a porta está aberta — é só assinar de novo que tudo religa no mesmo lugar.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#8b949e;">Ficou alguma coisa pendente com o estorno? <a href="https://usenotinha.com.br/contato" style="color:#2EA09E;text-decoration:underline;">Fala com o suporte</a> que a gente resolve.</p></td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #30363d;">
<p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:12px;line-height:1.6;color:#8b949e;">
Notinha · CNPJ 66.824.150/0001-28 · Santos/SP<br>
E-mail transacional sobre o encerramento da sua assinatura.<br>
Precisa de ajuda? <a href="https://usenotinha.com.br/contato" style="color:#2EA09E;text-decoration:underline;">Fale com o suporte</a>.</p>
</td></tr></table>
<img src="{pixel_url}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;

export const TPL_CANCELAMENTO = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>Cancelamento confirmado</title></head>
<body style="margin:0;padding:0;background-color:#0d1117;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Assinatura encerrada — sem novas cobranças. Tua planilha fica com você.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0d1117;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#161b22;border:1px solid #30363d;border-radius:16px;overflow:hidden;">
<tr><td style="padding:28px 32px;border-bottom:1px solid #30363d;" align="center">
<span style="font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:28px;font-weight:800;color:#288A89;">Notinha</span></td></tr>
<tr><td style="padding:32px 32px 8px 32px;">
<h1 style="margin:0 0 8px 0;font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:26px;line-height:1.25;font-weight:800;color:#e6edf3;">Cancelamento confirmado</h1></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#c9d4dd;">Oi, {primeiro_nome}. Tua assinatura do Notinha foi encerrada — a partir de agora não haverá mais nenhuma cobrança.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#c9d4dd;"><strong style="color:#e6edf3;font-weight:600;">Tua planilha continua tua.</strong> Ela mora no teu Google Drive, então tudo que o Notinha organizou fica com você, pra sempre — com ou sem a gente.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#c9d4dd;">Se mudar de ideia, é só assinar de novo — teu assistente religa no mesmo lugar, com teu histórico do jeito que você deixou.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#8b949e;">Antes de ir: se algo te incomodou ou faltou, me conta respondendo este e-mail. É lendo isso que o Notinha melhora.</p></td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #30363d;">
<p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:12px;line-height:1.6;color:#8b949e;">
Notinha · CNPJ 66.824.150/0001-28 · Santos/SP<br>
E-mail transacional sobre o encerramento da sua assinatura.<br>
Precisa de ajuda? <a href="https://usenotinha.com.br/contato" style="color:#2EA09E;text-decoration:underline;">Fale com o suporte</a>.</p>
</td></tr></table>
<img src="{pixel_url}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;

export const TPL_COBRANCA = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>Teu pagamento não caiu 😬</title></head>
<body style="margin:0;padding:0;background-color:#0d1117;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Calma: nada muda por 3 dias. Só precisa acertar o pagamento.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0d1117;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#161b22;border:1px solid #30363d;border-radius:16px;overflow:hidden;">
<tr><td style="padding:28px 32px;border-bottom:1px solid #30363d;" align="center">
<span style="font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:28px;font-weight:800;color:#288A89;">Notinha</span></td></tr>
<tr><td style="padding:32px 32px 8px 32px;">
<h1 style="margin:0 0 8px 0;font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:26px;line-height:1.25;font-weight:800;color:#e6edf3;">Teu pagamento não caiu 😬</h1></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#c9d4dd;">Oi, {primeiro_nome}. A cobrança deste mês da tua assinatura não foi aprovada — acontece: cartão que venceu, limite no dia, boleto que passou batido.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#c9d4dd;"><strong style="color:#e6edf3;font-weight:600;">Respira: teu Notinha continua funcionando normalmente pelos próximos 3 dias.</strong> É só regularizar o pagamento nesse prazo que nada muda.</p></td></tr>
<tr><td style="padding:8px 32px 24px 32px;" align="center"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:100px;background-color:#288A89;text-align:center;"><a href="https://usenotinha.com.br/conta" style="display:inline-block;padding:15px 40px;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:100px;">Regularizar pagamento →</a></td></tr></table></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#c9d4dd;">Na tua conta você encontra a fatura em aberto e pode pagar por PIX ou atualizar o cartão. Depois dos 3 dias sem pagamento, o acesso é pausado até regularizar — teus dados e tua planilha ficam guardados, nada se perde.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#8b949e;">Já pagou e este e-mail cruzou com o pagamento? Então ignora — tá tudo certo. Qualquer dúvida, <a href="https://usenotinha.com.br/contato" style="color:#2EA09E;text-decoration:underline;">fala com o suporte</a>.</p></td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #30363d;">
<p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:12px;line-height:1.6;color:#8b949e;">
Notinha · CNPJ 66.824.150/0001-28 · Santos/SP<br>
E-mail transacional referente à cobrança da sua assinatura.<br>
Precisa de ajuda? <a href="https://usenotinha.com.br/contato" style="color:#2EA09E;text-decoration:underline;">Fale com o suporte</a>.</p>
</td></tr></table>
<img src="{pixel_url}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;

export const TPL_PAUSADO = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>Teu Notinha foi pausado ⏸️</title></head>
<body style="margin:0;padding:0;background-color:#0d1117;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Nada foi apagado — regulariza e tudo volta na hora.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0d1117;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#161b22;border:1px solid #30363d;border-radius:16px;overflow:hidden;">
<tr><td style="padding:28px 32px;border-bottom:1px solid #30363d;" align="center">
<span style="font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:28px;font-weight:800;color:#288A89;">Notinha</span></td></tr>
<tr><td style="padding:32px 32px 8px 32px;">
<h1 style="margin:0 0 8px 0;font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:26px;line-height:1.25;font-weight:800;color:#e6edf3;">Teu Notinha foi pausado ⏸️</h1></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#c9d4dd;">Oi, {primeiro_nome}. Passaram os 3 dias do aviso e o pagamento da tua assinatura ainda não caiu, então o acesso foi pausado por enquanto.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#c9d4dd;"><strong style="color:#e6edf3;font-weight:600;">Nada foi apagado.</strong> Tua planilha continua no teu Google Drive e teu histórico fica guardado com a gente. É pausa, não despedida.</p></td></tr>
<tr><td style="padding:8px 32px 24px 32px;" align="center"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:100px;background-color:#288A89;text-align:center;"><a href="https://usenotinha.com.br/conta" style="display:inline-block;padding:15px 40px;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:100px;">Reativar meu Notinha →</a></td></tr></table></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#c9d4dd;">Assim que o pagamento for confirmado, teu assistente religa sozinho no WhatsApp — sem precisar ativar nada de novo.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#8b949e;">Travou algo no pagamento ou quer conversar antes? <a href="https://usenotinha.com.br/contato" style="color:#2EA09E;text-decoration:underline;">Fala com o suporte</a> — gente de verdade responde.</p></td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #30363d;">
<p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:12px;line-height:1.6;color:#8b949e;">
Notinha · CNPJ 66.824.150/0001-28 · Santos/SP<br>
E-mail transacional referente à cobrança da sua assinatura.<br>
Precisa de ajuda? <a href="https://usenotinha.com.br/contato" style="color:#2EA09E;text-decoration:underline;">Fale com o suporte</a>.</p>
</td></tr></table>
<img src="{pixel_url}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;

// Alerta interno de chargeback — só pra suporte@, nunca ao cliente.
export const TPL_ALERTA_CHARGEBACK = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>[URGENTE] Chargeback solicitado</title></head>
<body style="margin:0;padding:0;background-color:#f2f4f4;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f2f4f4;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background-color:#288A89;padding:28px 32px;text-align:center;">
<span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:bold;color:#ffffff;">Notinha</span></td></tr>
<tr><td style="padding:36px 32px 8px 32px;">
<h1 style="margin:0 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:#1a2b2b;">🚨 Chargeback solicitado</h1>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">Alerta automático: um cliente abriu contestação da cobrança na operadora do cartão. O acesso já foi bloqueado pelo webhook.</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;"><strong style="color:#1a2b2b;">Cliente:</strong> {primeiro_nome} — {email_cliente} — {whatsapp_cliente}</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;"><strong style="color:#1a2b2b;">Pagamento (Asaas):</strong> {ref_pagamento}</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;"><strong style="color:#1a2b2b;">Ação:</strong> responder a contestação no painel do Asaas e contatar o cliente pelo WhatsApp hoje. NÃO enviar e-mail automático ao cliente.</p>
</td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e6ecec;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8aa0a0;">
Notinha · usenotinha.com.br · alerta interno automático.</p>
</td></tr></table></td></tr></table></body></html>`;
