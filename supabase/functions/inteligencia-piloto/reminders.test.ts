import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interpretarLembrete,querLembrete} from './reminders.ts';
import {comandoPiloto} from './commands.ts';
const now=new Date('2026-09-11T19:56:34Z');
test('exact user wording schedules haircut tomorrow 10h',()=>assert.deepEqual(interpretarLembrete('Me lembre que amanhã às 10hs da manhã tenho corte de cabelo',now),{descricao:'corte de cabelo',quando_local:'2026-09-12T10:00:00'}));
test('afternoon, minutes and explicit dates',()=>assert.deepEqual(interpretarLembrete('Me lembre de buscar o pacote dia 15/09 às 3:30 da tarde',now),{descricao:'buscar o pacote',quando_local:'2026-09-15T15:30:00'}));
test('tomorrow anchors to inbound Sao Paulo date near midnight UTC',()=>assert.equal(interpretarLembrete('me lembre amanhã às 10h de cortar cabelo',new Date('2026-09-12T01:00:00Z'))?.quando_local,'2026-09-12T10:00:00'));
test('tomorrow rolls month/year correctly',()=>assert.equal(interpretarLembrete('me lembre amanhã às 10h de cortar cabelo',new Date('2026-12-31T15:00:00Z'))?.quando_local,'2027-01-01T10:00:00'));
test('ambiguous invalid and repeating schedules request clarification',()=>{
 for(const s of ['me lembre amanhã do cabelo','me lembre às 10h do cabelo','me lembre todo dia às 10h de cortar cabelo','me lembre amanhã às 25h do cabelo','me lembre amanhã às 10:99 do cabelo','me lembre dia 31/02 às 10h do cabelo','me lembre amanhã às 10h ou às 11h de cortar cabelo','me lembre daqui a 10 minutos de ligar'])assert.equal(interpretarLembrete(s,now),null,s);
});
test('reminder intent never falls through as an expense when missing date',async()=>{
 let message='';let writes=0;
 const handled=await comandoPiloto({id:'pilot',telefone:'pilot'},'me lembre de cortar cabelo',async name=>{if(name==='inteligencia_contexto_piloto')return {comandos_habilitados:true,telefone:'pilot'};writes++;},async s=>{message=s;},{wam_id:'test',timestamp:String(now.getTime()/1000)});
 assert.equal(handled,true);assert.equal(writes,0);assert.match(message,/dia e o horário/);
});
test('creation passes authenticated event id and confirms only persisted reminder',async()=>{
 let body:any;let message='';
 await comandoPiloto({id:'pilot',telefone:'pilot'},'Me lembre que amanhã às 10hs da manhã tenho corte de cabelo',async(name,b)=>{
 if(name==='inteligencia_contexto_piloto')return {comandos_habilitados:true,telefone:'pilot'};
 assert.equal(name,'inteligencia_criar_lembrete_piloto');body=b;return {id:'saved',descricao:'corte de cabelo',devido_em:'2026-09-12T13:00:00Z'};
 },async s=>{message=s;},{wam_id:'test',timestamp:String(now.getTime()/1000)});
 assert.equal(body.p_quando_local,'2026-09-12T10:00:00');assert.equal(body.p_wam_id,'test');assert.match(message,/12\/09\/2026,? 10:00/);
});

