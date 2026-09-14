from pathlib import Path

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

if old not in s:
    raise SystemExit('bloco de tracking de video nao encontrado')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')
