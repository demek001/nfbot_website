// ═════════════════════════════════════════════════════════════════
// NOTINHA — enviar-lista-espera/templates-lista.ts
// Confirmação de entrada na lista de espera. Padrão visual v7
// (idêntico a enviar-boasvindas): fundo claro, faixa teal,
// Fraunces + DM Sans, card 600px.
// Sem link de descadastro: e-mail de confirmação de opt-in.
// Placeholders (merge() do index.ts):
//   {primeiro_nome}     — primeiro nome; ver fallback no index.ts
//   {codigo_indicacao}  — código curto do lead p/ rastrear indicações
//   {pixel_url}         — pixel de abertura
// ═════════════════════════════════════════════════════════════════

export const TPL_LISTA_ESPERA = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Você entrou na lista de espera do Notinha</title></head>
<body style="margin:0;padding:0;background-color:#f4f6f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Seu lugar está garantido — e vêm dois benefícios junto.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e3e9e9;border-radius:16px;overflow:hidden;">

<tr><td style="background-color:#288A89;padding:28px 32px;" align="center">
<span style="font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:28px;font-weight:800;color:#ffffff;">Notinha</span></td></tr>

<tr><td style="padding:32px 32px 8px 32px;">
<h1 style="margin:0 0 8px 0;font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:26px;line-height:1.25;font-weight:800;color:#14302f;">Parabéns, {primeiro_nome}! 🎉</h1></td></tr>

<tr><td style="padding:0 32px;"><p style="margin:0 0 8px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;font-weight:600;color:#288A89;">Você entrou para nossa lista de espera exclusiva.</p></td></tr>

<tr><td style="padding:0 32px;"><p style="margin:0 0 24px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;line-height:1.65;font-weight:400;color:#3a4a4a;">Por estar conosco cedo, você já garante dois benefícios que o público geral não vai ter:</p></td></tr>

<tr><td style="padding:0 32px 16px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-radius:12px;background-color:#f0f9f9;border:1px solid #288A89;">
<tr><td style="padding:20px 24px;">
<p style="margin:0 0 6px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:15px;font-weight:700;color:#288A89;">✅ Garantia de 30 dias</p>
<p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:14px;line-height:1.6;font-weight:400;color:#3a4a4a;">Não gostou? A gente devolve seu dinheiro integralmente, sem perguntas, nos primeiros 30 dias.</p>
</td></tr></table></td></tr>

<tr><td style="padding:0 32px 24px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-radius:12px;background-color:#fff7e0;border:2px solid #eaa000;">
<tr><td style="background-color:#eaa000;padding:10px 24px;border-radius:10px 10px 0 0;text-align:center;">
<span style="font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:13px;font-weight:700;color:#ffffff;letter-spacing:0.04em;">🎁 BENEFÍCIO EXCLUSIVO PARA VOCÊ</span>
</td></tr>
<tr><td style="padding:22px 24px 20px;">
<p style="margin:0 0 6px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:18px;font-weight:700;color:#825a00;">Indique um amigo e ganhe 34% OFF</p>
<p style="margin:0 0 18px 0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:14px;line-height:1.6;font-weight:400;color:#3a4a4a;">Indique um amigo que também assinar o Notinha e ganhe <strong style="color:#14302f;font-weight:600;">34% de desconto na sua primeira mensalidade</strong>. Simples assim — sem complicação. <a href="https://usenotinha.com.br/termos-promocao/" style="color:#825a00;text-decoration:underline;font-size:13px;">Ver regras completas →</a></p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px 0;">
<tr><td style="border-radius:100px;background-color:#25a752;text-align:center;">
<a href="https://wa.me/?text=Ol%C3%A1%21+Descobri+o+Notinha%2C+um+assistente+financeiro+pelo+WhatsApp+que+l%C3%AA+suas+notas+fiscais+e+organiza+seus+gastos+automaticamente.+Entra+na+lista+de+espera+aqui%3A+https%3A%2F%2Fusenotinha.com.br%2F%3Fref%3D{codigo_indicacao}%23lista" style="display:block;padding:14px 20px;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:100px;">📲 Compartilhar pelo WhatsApp</a>
</td></tr></table>

<p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:13px;line-height:1.6;font-weight:400;color:#6b7d7d;">Seu código de indicação: <strong style="color:#825a00;font-weight:700;letter-spacing:1px;">{codigo_indicacao}</strong></p>

</td></tr></table></td></tr>

<tr><td style="padding:8px 32px 24px 32px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:100px;background-color:#288A89;text-align:center;">
<a href="https://usenotinha.com.br/blog/" style="display:inline-block;padding:15px 40px;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:100px;">Ler o Caderninho →</a>
</td></tr></table></td></tr>

<tr><td style="padding:0 32px 8px 32px;"><p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:13px;line-height:1.6;font-weight:400;color:#6b7d7d;text-align:center;">Nenhuma ação é necessária agora. É só aguardar o convite de acesso.</p></td></tr>

<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e3e9e9;">
<p style="margin:0;font-family:'DM Sans', Arial, Helvetica, sans-serif;font-size:12px;line-height:1.6;color:#8aa0a0;">
Notinha · CNPJ 66.824.150/0001-28 · Santos/SP<br>
Você recebeu este e-mail para confirmar sua entrada na lista de espera.<br>
Precisa de ajuda? <a href="https://usenotinha.com.br/contato" style="color:#22706f;text-decoration:underline;">Fale com o suporte</a>.</p>
</td></tr></table>
<img src="{pixel_url}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;
