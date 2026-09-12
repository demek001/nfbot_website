import { test } from 'node:test';
import assert from 'node:assert/strict';
import {canalAlerta,whatsappGratuito,textoAlerta} from './policy.ts';
import {comandoPiloto} from './commands.ts';
const now=Date.parse('2026-09-11T19:00:00Z');
const c={cliente_id:'pilot',telefone:'pilot-number',ultimo_inbound_em:new Date(now-3600000).toISOString(),whatsapp_gratis_ate:'2026-10-01T00:00:00Z',phone_number_id:'business',email_verificado:true,email:'test@example.invalid',comandos_habilitados:true};
test('fresh verified window uses WhatsApp',()=>assert.equal(canalAlerta(c,now),'whatsapp'));
test('expired/unknown/future timestamp falls back to email',()=>{
  for(const timestamp of [null,'bad',new Date(now-24*3600000).toISOString(),new Date(now+1000).toISOString()]) assert.equal(canalAlerta({...c,ultimo_inbound_em:timestamp},now),'email');
});
test('two minute boundary margin closes WhatsApp',()=>assert.equal(whatsappGratuito({...c,ultimo_inbound_em:new Date(now-24*3600000+120000).toISOString()},now),false));
test('policy expiry or unknown business blocks WhatsApp',()=>{
  assert.equal(canalAlerta({...c,whatsapp_gratis_ate:new Date(now).toISOString()},now),'email');
  assert.equal(canalAlerta({...c,phone_number_id:null},now),'email');
});
test('unverified email cannot receive outside window',()=>assert.equal(canalAlerta({...c,ultimo_inbound_em:null,email_verificado:false},now),null));
test('invalid recipient cannot receive',()=>assert.equal(canalAlerta({...c,ultimo_inbound_em:null,email:'bad\naddress'},now),null));
test('no pilot context returns no route',()=>assert.equal(canalAlerta(null,now),null));
test('rendered message stays inside WhatsApp limit',()=>assert.ok(textoAlerta(Array(20).fill({titulo:'x'.repeat(500),dados:{}})).length<=3900));
test('non-pilot never calls analysis or sends',async()=>{
  const calls:string[]=[];
  assert.equal(await comandoPiloto({id:'other',telefone:'other'},'inteligencia',async name=>{calls.push(name);return null;},async()=>assert.fail('sent')),false);
  assert.deepEqual(calls,['inteligencia_contexto_piloto']);
});
test('pilot supports Brazilian currency; no provider calls',async()=>{
  let amount=0;let message='';
  await comandoPiloto({id:'pilot',telefone:c.telefone},'posso gastar 1.500,50',async(name,body:any)=>{
    if(name==='inteligencia_contexto_piloto')return c;
    if(name==='gerar_inteligencia_cliente_v2')return {status:'ok'};
    if(name==='simular_posso_gastar_v2'){amount=body.p_valor;return {status:'sem_renda_registrada'};}
    assert.fail('unexpected call');
  },async s=>{message=s;});
  assert.equal(amount,1500.5);assert.match(message,/renda registrada/);
});
test('ordinary expense bypasses pilot handler',async()=>assert.equal(await comandoPiloto({id:'pilot'},'cafe 12',async()=>assert.fail('queried'),async()=>assert.fail('sent')),false));

