const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function querLembrete(s:string):boolean {
  return /^(?:por favor[, ]+)?(?:me lembr[ea]|lembre-me|lembra-me|criar? (?:um )?lembrete|agend[ae] (?:um )?lembrete|lembrete)\b/.test(norm(s.trim()));
}
export function interpretarLembrete(text:string,reference:Date):{descricao:string;quando_local:string}|null {
  if(!querLembrete(text)||!Number.isFinite(reference.getTime()))return null;
  const original=text.trim(); const t=norm(original);
  // Unsupported recurrence/relative intervals must ask for clarification, never silently create a one-off.
  if(/\b(todo[sa]?|cada|semanal|mensal|daqui|antes|depois|proxim[ao])\b/.test(t))return null;
  const dates=[...t.matchAll(/\b(?:amanha|hoje|dia\s+\d{1,2}\/\d{1,2}(?:\/\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{4})?)\b/g)];
  const times=[...t.matchAll(/\b(?:as|a)\s+(\d{1,2})(?:(?::|h)(\d{2})|\s*(?:hs?|horas))?(?:\s*(?:da|de|a)\s+(manha|tarde|noite|madrugada))?\b/g)];
  if(dates.length!==1||times.length!==1)return null;
  const date=dates[0],time=times[0];
  let hour=Number(time[1]); const minute=Number(time[2]??0); const period=time[3];
  if(minute>59||hour>23)return null;
  if(period){if(hour<1||hour>12)return null;if(['tarde','noite'].includes(period)&&hour<12)hour+=12; if(period==='madrugada'&&hour===12)hour=0;if(period==='manha'&&hour===12)return null;}
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(reference);
  const part=(type:string)=>Number(parts.find(p=>p.type===type)!.value);
  let y=part('year'),m=part('month'),d=part('day');
  if(date[0]==='amanha'){const next=new Date(Date.UTC(y,m-1,d+1));y=next.getUTCFullYear();m=next.getUTCMonth()+1;d=next.getUTCDate();}
  else if(date[0]!=='hoje'){const nums=date[0].replace(/^dia\s+/,'').split('/').map(Number);[d,m]=nums;if(nums[2])y=nums[2];}
  const valid=new Date(Date.UTC(y,m-1,d));if(valid.getUTCFullYear()!==y||valid.getUTCMonth()!==m-1||valid.getUTCDate()!==d)return null;
  const ranges=[{start:date.index!,end:date.index!+date[0].length},{start:time.index!,end:time.index!+time[0].length}].sort((a,b)=>b.start-a.start);
  let descricao=original;for(const r of ranges)descricao=descricao.slice(0,r.start)+' '+descricao.slice(r.end);
  descricao=descricao.replace(/^(?:por favor[, ]+)?(?:me lembr[ea]|lembre-me|lembra-me|criar? (?:um )?lembrete|agend[ae] (?:um )?lembrete|lembrete)\b\s*/i,'')
    .replace(/\s+/g,' ').replace(/^[\s,:-]*(?:(?:que|de|para|pra|no dia|no|em|tenho|eu tenho)\b[\s,:-]*)+/i,'').replace(/[\s,.!?]+$/,'').trim();
  if(descricao.length<3||descricao.length>300)return null;
  const pad=(n:number)=>String(n).padStart(2,'0');
  return {descricao,quando_local:`${y}-${pad(m)}-${pad(d)}T${pad(hour)}:${pad(minute)}:00`};
}

