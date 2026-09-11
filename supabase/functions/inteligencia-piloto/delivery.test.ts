import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
let handler:any;
(globalThis as any).Deno={env:{get:(k:string)=>({SUPABASE_URL:'https://db.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-key',WORKER_SECRET:'test-secret',WHATSAPP_TOKEN:'test-token',ZOHO_CLIENT_ID:'test-client',ZOHO_CLIENT_SECRET:'test-client-secret',ZOHO_MAIL_REFRESH_TOKEN:'test-refresh'} as any)[k]},serve:(h:any)=>{handler=h;}};
await import('./index.ts');
let calls:string[]=[];let updates:any[]=[];let mode='email';
const reply=(j:any,status=200)=>new Response(JSON.stringify(j),{status});
beforeEach(()=>{calls=[];updates=[];mode='email';
globalThis.fetch=async(input:any,init:any)=>{
  const u=String(input);calls.push(u);
  const c={cliente_id:'pilot',telefone:'pilot',email:'test@example.invalid',email_verificado:true,phone_number_id:'business',whatsapp_gratis_ate:new Date(Date.now()+86400000).toISOString(),ultimo_inbound_em:mode==='email'?null:new Date().toISOString()};
  if(u.includes('inteligencia_preparar_piloto'))return reply({status:'pronto',contexto:c,itens:[{id:'insight',titulo:'Teste',dados:{}}],entrega_id:'delivery'});
  if(u.includes('inteligencia_contexto_piloto'))return reply(c);
  if(u.includes('inteligencia_entregas')){updates.push(JSON.parse(init.body));return reply({});}
  if(u.includes('graph.facebook.com')){
    assert.equal(JSON.parse(init.body).type,'text');
    if(mode==='unknown')throw new Error('timeout');
    if(mode==='reject')return reply({error:{code:131047}},400);
    return reply({messages:[{id:'accepted'}]});
  }
  if(u.includes('oauth/v2/token')){assert.ok(!u.includes('test-refresh'));return reply({access_token:'test-zoho'});}
  if(u.endsWith('/api/accounts'))return reply({data:[{primaryEmailAddress:'contato@usenotinha.com.br',accountId:'test'}]});
  if(u.includes('/messages'))return reply({status:{code:200},data:{messageId:'accepted'}});
  assert.fail('unexpected fetch '+u);
};});
const request=(secret='test-secret')=>new Request('https://worker.invalid',{method:'POST',headers:{'x-worker-secret':secret},body:JSON.stringify({acao:'enviar'})});
test('unauthorized request performs no I/O',async()=>{assert.equal((await handler(request('wrong'))).status,401);assert.equal(calls.length,0);});
test('outside window sends through existing Zoho only',async()=>{
  assert.equal((await (await handler(request())).json()).canal,'email');
  assert.ok(!calls.some(x=>x.includes('graph.facebook.com')));assert.equal(updates[0].status,'aceito');
});
test('fresh window sends only freeform WhatsApp',async()=>{mode='whatsapp';await handler(request());assert.equal(updates[0].canal,'whatsapp');assert.ok(!calls.some(x=>x.includes('zoho.com')));});
test('explicit WhatsApp rejection uses email',async()=>{mode='reject';await handler(request());assert.equal(updates[0].canal,'email');assert.equal(updates[0].status,'aceito');});
test('uncertain WhatsApp acceptance never falls back or retries',async()=>{mode='unknown';await handler(request());assert.equal(updates[0].status,'incerto');assert.ok(!calls.some(x=>x.includes('zoho.com')));});

