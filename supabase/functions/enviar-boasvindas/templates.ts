// ═════════════════════════════════════════════════════════════════
// NOTINHA — enviar-boasvindas/templates.ts
// Templates transacionais (fonte: emails/ do repositório — este arquivo é
// GERADO a partir dos HTMLs, não editar à mão). Padrão visual do site:
// fundo claro, faixa teal, Fraunces + DM Sans (renderiza consistente em
// Gmail/Outlook/Apple Mail). Placeholders {chave} substituídos em runtime
// pelo merge() do index.ts:
//   REN / REEMBOLSO / CANCELAMENTO: {primeiro_nome} {pixel_url}
//   COBRANCA / PAUSADO: {primeiro_nome} {pixel_url} {link_fatura}
//   ALERTA_CHARGEBACK (interno): {primeiro_nome} {email_cliente}
//                                {whatsapp_cliente} {ref_pagamento}
// ═════════════════════════════════════════════════════════════════

export const TPL_REN = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Renovação confirmada 🧾</title></head>
<body style="margin:0;padding:0;background-color:#f4f6f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Pagamento recebido — seu Notinha segue firme.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e3e9e9;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:#288A89;padding:28px 32px;" align="center">
<span style="font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:28px;font-weight:800;color:#ffffff;">Notinha</span></td></tr>
<tr><td style="padding:32px 32px 8px 32px;">
<h1 style="margin:0 0 8px 0;font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:26px;line-height:1.25;font-weight:800;color:#14302f;">Renovação confirmada 🧾</h1></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Oi, {primeiro_nome}! Passando só pra confirmar: seu pagamento deste mês foi recebido e sua assinatura do Notinha segue ativa.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Obrigado por continuar com a gente. É bom demais fazer parte da sua rotina — nota vai, nota vem, e seus gastos seguem se organizando sozinhos. 🧾</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Detalhes da assinatura e recibos ficam na sua conta:</p></td></tr>
<tr><td style="padding:8px 32px 24px 32px;" align="center"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:100px;background-color:#288A89;text-align:center;"><a href="https://usenotinha.com.br/conta" style="display:inline-block;padding:15px 40px;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:100px;">Ver minha conta →</a></td></tr></table></td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e3e9e9;">
<p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:12px;line-height:1.6;color:#8aa0a0;">
Notinha · CNPJ 66.824.150/0001-28 · Santos/SP<br>
E-mail transacional referente à sua assinatura ativa do Notinha.<br>
Precisa de ajuda? <a href="https://usenotinha.com.br/contato" style="color:#22706f;text-decoration:underline;">Fale com o suporte</a>.</p>
</td></tr></table>
<img src="{pixel_url}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;

export const TPL_REEMBOLSO = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reembolso confirmado ✅</title></head>
<body style="margin:0;padding:0;background-color:#f4f6f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Dinheiro de volta, sem letra miúda.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e3e9e9;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:#288A89;padding:28px 32px;" align="center">
<span style="font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:28px;font-weight:800;color:#ffffff;">Notinha</span></td></tr>
<tr><td style="padding:32px 32px 8px 32px;">
<h1 style="margin:0 0 8px 0;font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:26px;line-height:1.25;font-weight:800;color:#14302f;">Reembolso a caminho ✅</h1></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Oi, {primeiro_nome}. Seu reembolso foi confirmado — o valor volta pelo mesmo meio que você pagou, no prazo da operadora do cartão ou do banco.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Garantia é isso: você pediu, a gente devolveu. Sem formulário, sem "mas antes me conta por quê", sem drama.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">E uma coisa continua sua pra sempre: <strong style="color:#14302f;font-weight:600;">a planilha no seu Google Drive</strong>. Tudo que o Notinha organizou fica com você — pode abrir, editar e usar quando quiser.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Se um dia fizer sentido voltar, a porta está aberta. Vai ser bom te ver de novo. 🧾</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#6b7d7d;">PS: Se algo específico te fez sair e você topar contar, responde este e-mail. Leio pessoalmente e ajuda a gente a melhorar.</p></td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e3e9e9;">
<p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:12px;line-height:1.6;color:#8aa0a0;">
Notinha · CNPJ 66.824.150/0001-28 · Santos/SP<br>
E-mail transacional sobre o encerramento da sua assinatura.<br>
Precisa de ajuda? <a href="https://usenotinha.com.br/contato" style="color:#22706f;text-decoration:underline;">Fale com o suporte</a>.</p>
</td></tr></table>
<img src="{pixel_url}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;

export const TPL_CANCELAMENTO = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cancelamento confirmado</title></head>
<body style="margin:0;padding:0;background-color:#f4f6f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Tudo certo. Sua planilha continua sua.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e3e9e9;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:#288A89;padding:28px 32px;" align="center">
<span style="font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:28px;font-weight:800;color:#ffffff;">Notinha</span></td></tr>
<tr><td style="padding:32px 32px 8px 32px;">
<h1 style="margin:0 0 8px 0;font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:26px;line-height:1.25;font-weight:800;color:#14302f;">Cancelado, sem ressentimentos</h1></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Oi, {primeiro_nome}. Sua assinatura foi cancelada — não vem mais nenhuma cobrança.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Sem culpa e sem joguinho de "tem certeza?": cancelou, tá cancelado.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">O que fica com você: <strong style="color:#14302f;font-weight:600;">sua planilha, no seu Google Drive</strong>. Ela sempre foi sua — todos os gastos que o Notinha organizou continuam lá, acessíveis quando você quiser.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Se a vida mudar e você quiser o Notinha de volta, é só assinar de novo que ele acorda no mesmo lugar.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Obrigado por ter dado uma chance pra gente. De verdade. 🧾</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#6b7d7d;">PS: Saiu por algo que a gente podia ter feito melhor? Responde aqui e me conta. Leio tudo.</p></td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e3e9e9;">
<p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:12px;line-height:1.6;color:#8aa0a0;">
Notinha · CNPJ 66.824.150/0001-28 · Santos/SP<br>
E-mail transacional sobre o encerramento da sua assinatura.<br>
Precisa de ajuda? <a href="https://usenotinha.com.br/contato" style="color:#22706f;text-decoration:underline;">Fale com o suporte</a>.</p>
</td></tr></table>
<img src="{pixel_url}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;

export const TPL_COBRANCA = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Seu pagamento não caiu 😬</title></head>
<body style="margin:0;padding:0;background-color:#f4f6f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Calma: nada foi desligado. Ainda.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e3e9e9;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:#288A89;padding:28px 32px;" align="center">
<span style="font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:28px;font-weight:800;color:#ffffff;">Notinha</span></td></tr>
<tr><td style="padding:32px 32px 8px 32px;">
<h1 style="margin:0 0 8px 0;font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:26px;line-height:1.25;font-weight:800;color:#14302f;">O pagamento deste mês não caiu 😬</h1></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Oi, {primeiro_nome}! Aviso rápido: a cobrança deste mês não passou. Acontece — cartão vencido, limite no dia errado, banco de mau humor.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;"><strong style="color:#14302f;font-weight:600;">Nada foi desligado.</strong> Seu Notinha continua funcionando normalmente por 3 dias enquanto você resolve.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">É só atualizar o pagamento e pronto — nem precisa avisar a gente, o sistema percebe sozinho.</p></td></tr>
<tr><td style="padding:8px 32px 24px 32px;" align="center"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:100px;background-color:#288A89;text-align:center;"><a href="{link_fatura}" style="display:inline-block;padding:15px 40px;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:100px;">Resolver agora →</a></td></tr></table></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#6b7d7d;">PS: Travou algo no pagamento? Responde este e-mail que a gente resolve junto.</p></td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e3e9e9;">
<p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:12px;line-height:1.6;color:#8aa0a0;">
Notinha · CNPJ 66.824.150/0001-28 · Santos/SP<br>
E-mail transacional referente à cobrança da sua assinatura.<br>
Precisa de ajuda? <a href="https://usenotinha.com.br/contato" style="color:#22706f;text-decoration:underline;">Fale com o suporte</a>.</p>
</td></tr></table>
<img src="{pixel_url}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;

export const TPL_PAUSADO = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Seu Notinha foi pausado ⏸️</title></head>
<body style="margin:0;padding:0;background-color:#f4f6f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Pausado ≠ apagado. Tudo continua aqui.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e3e9e9;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:#288A89;padding:28px 32px;" align="center">
<span style="font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:28px;font-weight:800;color:#ffffff;">Notinha</span></td></tr>
<tr><td style="padding:32px 32px 8px 32px;">
<h1 style="margin:0 0 8px 0;font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:26px;line-height:1.25;font-weight:800;color:#14302f;">Pausado. Não apagado. ⏸️</h1></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Oi, {primeiro_nome}. Os 3 dias passaram e o pagamento não entrou, então seu Notinha deu uma pausa.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">O que isso significa na prática: ele para de processar notas novas por enquanto. Só isso.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">O que NÃO acontece: nada é apagado. <strong style="color:#14302f;font-weight:600;">Sua planilha continua no seu Google Drive</strong>, intacta, com todo o histórico. Ela é sua.</p></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#3a4a4a;">Pra despausar, é só acertar o pagamento — o Notinha acorda sozinho, sem precisar reativar nada.</p></td></tr>
<tr><td style="padding:8px 32px 24px 32px;" align="center"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:100px;background-color:#288A89;text-align:center;"><a href="{link_fatura}" style="display:inline-block;padding:15px 40px;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:100px;">Reativar meu Notinha →</a></td></tr></table></td></tr>
<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;color:#6b7d7d;">PS: Se pausou de propósito porque o momento apertou, tudo bem também. A gente entende. Quando der, estamos aqui. 🧾</p></td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e3e9e9;">
<p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:12px;line-height:1.6;color:#8aa0a0;">
Notinha · CNPJ 66.824.150/0001-28 · Santos/SP<br>
E-mail transacional referente à cobrança da sua assinatura.<br>
Precisa de ajuda? <a href="https://usenotinha.com.br/contato" style="color:#22706f;text-decoration:underline;">Fale com o suporte</a>.</p>
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
