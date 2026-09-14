from pathlib import Path

# Landing TikTok
p = Path('controle-gastos-whatsapp/index.html')
s = p.read_text(encoding='utf-8')
s = s.replace('/notinha-como-usar-web.mp4', '/Envio-nf_menu_drive.mp4')
s = s.replace('/Post02_Painel-exemplo.mp4', '/dashboard-web.mp4')
s = s.replace('16 segundos: veja o painel Premium em ação.', 'Veja o painel Premium em ação.')
old = """  document.querySelectorAll('video').forEach(function(v){
    var started=false;
    v.addEventListener('play',function(){if(started)return;started=true;ev('product_demo_video_start',{video_id:v.id});});
    v.addEventListener('ended',function(){ev('product_demo_video_complete',{video_id:v.id});});
  });"""
new = """  document.querySelectorAll('video').forEach(function(v){
    var started=false, milestones={25:false,50:false,75:false};
    function base(){return {video_id:v.id,traffic_source:window.notinhaOrigem?window.notinhaOrigem():'landing'};}
    v.addEventListener('play',function(){if(started)return;started=true;ev('product_demo_video_start',base());});
    v.addEventListener('timeupdate',function(){
      if(!v.duration||!isFinite(v.duration))return;
      var pct=Math.floor((v.currentTime/v.duration)*100);
      [25,50,75].forEach(function(m){if(pct>=m&&!milestones[m]){milestones[m]=true;var d=base();d.percent=m;ev('product_demo_video_progress',d);}});
    });
    v.addEventListener('ended',function(){ev('product_demo_video_complete',base());});
  });"""
if old in s:
    s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# Checkout: prepara retorno seguro do Asaas para a pagina que dispara purchase no GA4.
p = Path('assinar/index.html')
s = p.read_text(encoding='utf-8')
const_old = 'const ONBOARDING_URL="https://xpzjwlhrlebdpcybxaxu.supabase.co/functions/v1/onboarding";'
const_new = const_old + '\nconst PREPARAR_CONVERSAO_URL="https://xpzjwlhrlebdpcybxaxu.supabase.co/functions/v1/preparar-conversao";'
if 'PREPARAR_CONVERSAO_URL' not in s:
    if const_old not in s:
        raise SystemExit('constante ONBOARDING_URL nao encontrada')
    s = s.replace(const_old, const_new, 1)

success_old = 'form.style.display="none";document.getElementById("passos").style.display="block";document.getElementById("link-pagar").href=j.payment_url;const pl=dados.plano,tid=String(j.cliente_id||"");'
success_new = 'try{if(j.cliente_id){const tr=await fetch(PREPARAR_CONVERSAO_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cliente_id:j.cliente_id})});if(tr.ok)ev("payment_return_ready",{plano:dados.plano});}}catch(trackErr){console.warn("payment return tracking unavailable");}form.style.display="none";document.getElementById("passos").style.display="block";document.getElementById("link-pagar").href=j.payment_url;const pl=dados.plano,tid=String(j.cliente_id||"");'
if 'payment_return_ready' not in s:
    if success_old not in s:
        raise SystemExit('bloco de sucesso do checkout nao encontrado')
    s = s.replace(success_old, success_new, 1)
p.write_text(s, encoding='utf-8')
