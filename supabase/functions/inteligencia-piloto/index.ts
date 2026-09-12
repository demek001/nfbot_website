import { canalAlerta, textoAlerta } from './policy.ts';
const URL_SB = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('WORKER_SECRET') ?? '';
const sb = () => ({apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'});
const out = (v: unknown, status=200) => new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function rpc(name: string, body: unknown = {}) {
  const r=await fetch(`${URL_SB}/rest/v1/rpc/${name}`,{method:'POST',headers:sb(),body:JSON.stringify(body)});
  if(!r.ok) throw new Error('database_error');
  return await r.json();
}
async function config(k: string): Promise<string> {
  const env=Deno.env.get(k); if(env) return env;
  const r=await fetch(`${URL_SB}/rest/v1/config_privada?k=eq.${k}&select=v`,{headers:sb()});
  if(!r.ok) throw new Error('config_error');
  return (await r.json())?.[0]?.v ?? '';
}
async function finish(id:string,status:string,canal:string|null,codigo:string) {
  const r=await fetch(`${URL_SB}/rest/v1/inteligencia_entregas?id=eq.${id}&status=eq.reservado`,{
    method:'PATCH',headers:sb(),body:JSON.stringify({status,canal,codigo,atualizado_em:new Date().toISOString()})});
  if(!r.ok) throw new Error('persist_status_error');
}
async function zohoSession() {
  const params=new URLSearchParams({grant_type:'refresh_token',
    client_id:Deno.env.get('ZOHO_CLIENT_ID')??'',client_secret:Deno.env.get('ZOHO_CLIENT_SECRET')??'',
    refresh_token:await config('ZOHO_MAIL_REFRESH_TOKEN')});
  const origin=Deno.env.get('ZOHO_ACCOUNTS_URL')??'https://accounts.zoho.com';
  if (!/^https:\/\/accounts\.zoho\.(com|eu|com\.au|in|jp|ca|sa)$/.test(origin)) throw new Error('zoho_region');
  const r=await fetch(`${origin}/oauth/v2/token`,{method:'POST',body:params,signal:AbortSignal.timeout(15000)});
  const j=await r.json(); if(!r.ok||!j.access_token) throw new Error('zoho_auth');
  const token=j.access_token;
  const a=await fetch('https://mail.zoho.com/api/accounts',{headers:{Authorization:`Zoho-oauthtoken ${token}`},signal:AbortSignal.timeout(15000)});
  const aj=await a.json();
  const account=aj?.data?.find((x:any)=>String(x.primaryEmailAddress??'').toLowerCase()==='contato@usenotinha.com.br');
  if(!a.ok||!account?.accountId) throw new Error('zoho_account');
  return {token,id:String(account.accountId)};
}
async function email(c:any,text:string):Promise<'aceito'|'falhou'|'incerto'> {
  // Token/account lookup cannot send mail; its failures are safe to retry later.
  let session; try {session=await zohoSession();} catch {return 'falhou';}
  try {
    const r=await fetch(`https://mail.zoho.com/api/accounts/${session.id}/messages`,{
      method:'POST',headers:{Authorization:`Zoho-oauthtoken ${session.token}`,'Content-Type':'application/json'},
      body:JSON.stringify({fromAddress:'Notinha <contato@usenotinha.com.br>',toAddress:c.email,
        subject:'Notinha: alertas do seu piloto',content:text,mailFormat:'plaintext'}),signal:AbortSignal.timeout(20000)});
    const j=await r.json().catch(()=>null);
    if(r.ok && (j?.status?.code===200 || !!j?.data?.messageId)) return 'aceito';
    return r.status>=500 || r.ok ? 'incerto':'falhou';
  } catch {return 'incerto';}
}
async function whatsapp(c:any,text:string):Promise<'aceito'|'falhou'|'incerto'> {
  const token=Deno.env.get('WHATSAPP_TOKEN'); if(!token) return 'falhou';
  try {
    const r=await fetch(`https://graph.facebook.com/v23.0/${c.phone_number_id}/messages`,{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',to:c.telefone,type:'text',text:{body:text}}),signal:AbortSignal.timeout(15000)});
    const j=await r.json().catch(()=>null);
    if(r.ok && j?.messages?.[0]?.id) return 'aceito';
    return r.status>=500 || r.ok ? 'incerto':'falhou';
  } catch {return 'incerto';}
}
Deno.serve(async req=>{
  if(req.method!=='POST') return out({erro:'method'},405);
  const incoming=req.headers.get('x-worker-secret')??'';
  if(!SECRET || incoming!==SECRET) return out({erro:'unauthorized'},401);
  let body:any; try {body=await req.json();} catch {return out({erro:'json'},400);}
  try {
    if(body.acao==='health') {
      let mail=false; try {await zohoSession();mail=true;} catch {}
      return out({ok:true,zoho_pronto:mail,whatsapp_token_presente:!!Deno.env.get('WHATSAPP_TOKEN'),
        meta_secret_presente:!!(Deno.env.get('META_APP_SECRET')||Deno.env.get('META_APP_SECRET_KEY')||Deno.env.get('WHATSAPP_APP_SECRET')||Deno.env.get('APP_SECRET'))});
    }
    if(!['preview','enviar','lembretes','preview_lembretes'].includes(body.acao)) return out({erro:'acao'},400);
    const lembrete=body.acao==='lembretes'||body.acao==='preview_lembretes';
    const preview=body.acao==='preview'||body.acao==='preview_lembretes';
    const p=await rpc(lembrete?'inteligencia_preparar_lembrete_piloto':'inteligencia_preparar_piloto',{p_reservar:!preview});
    if(p.status!=='pronto') return out({status:p.status});
    let c=await rpc('inteligencia_contexto_piloto'); // Recheck eligibility and window immediately before sending.
    let canal=canalAlerta(c);
    const texto=lembrete?`⏰ Lembrete: ${p.itens[0].titulo}\n${new Date(p.itens[0].dados.devido_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'})} (horário de São Paulo).`:textoAlerta(p.itens);
    if(preview) return out({status:p.status,canal,itens:p.itens.length,texto});
    if(!canal || !c || c.cliente_id!==p.contexto.cliente_id) {
      await finish(p.entrega_id,'falhou',null,'sem_canal_elegivel');return out({status:'sem_canal_elegivel'});
    }
    const text=texto;
    let status=canal==='whatsapp'?await whatsapp(c,text):await email(c,text);
    // Only an explicit rejection allows fallback. Ambiguous acceptance is quarantined.
    if(status==='falhou' && canal==='whatsapp' && c.email_verificado) {
      c=await rpc('inteligencia_contexto_piloto');
      if(c?.cliente_id===p.contexto.cliente_id && c.email_verificado) {canal='email';status=await email(c,text);}
    }
    await finish(p.entrega_id,status,canal,`provider_${status}`);
    return out({status,canal,itens:p.itens.length});
  } catch {return out({erro:'internal_error'},500);}
});

