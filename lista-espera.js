// Lista de espera do lançamento de 12/12 (Família e Empresas). Usado na home (/#planos) e em /planos/.
// Qualquer elemento com data-lista-espera="familia" ou "empresas" abre o formulário com o plano escolhido.
// ?lista=familia ou ?lista=empresas na URL abre o formulário ao carregar (o /assinar/ e o cadastro mandam
// para cá enquanto esses planos não estão à venda).
// Grava pela função lista-espera (Turnstile + limite por IP, como o cadastro). Nada fica no navegador.
(function () {
  "use strict";
  var API = "https://xpzjwlhrlebdpcybxaxu.supabase.co/functions/v1/lista-espera";
  var SITEKEY = "0x4AAAAAAEmLqsLsblMemLoi";
  var NOMES = { familia: "Família", empresas: "Empresas" };
  var modal, form, turnToken = "", turnId = null, ultimoFoco = null;

  function ev(n, p) { if (typeof gtag === "function") gtag("event", n, p || {}); }

  var CSS = "" +
    ".le-fundo{position:fixed;inset:0;background:rgba(1,4,9,.72);z-index:10000;display:none;align-items:flex-end;justify-content:center}" +
    ".le-fundo.aberto{display:flex}" +
    ".le-caixa{background:var(--surface,#161b22);border:1px solid var(--brand,#288A89);border-bottom:0;border-radius:20px 20px 0 0;width:100%;max-width:560px;max-height:92vh;overflow-y:auto;padding:28px 20px 24px;position:relative;color:var(--text,#e6edf3);font-family:'DM Sans',sans-serif;font-weight:300;-webkit-overflow-scrolling:touch}" +
    ".le-fechar{position:absolute;top:12px;right:12px;width:40px;height:40px;border-radius:50%;border:1px solid var(--border,#30363d);background:transparent;color:var(--muted,#8b949e);font-size:22px;line-height:1;cursor:pointer}" +
    ".le-fechar:hover{color:var(--accent,#f0f6fc);border-color:var(--brand,#288A89)}" +
    ".le-tag{display:inline-block;padding:4px 12px;background:var(--brand,#288A89);color:#fff;border-radius:100px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px}" +
    ".le-caixa h2{font-family:'Fraunces',serif;font-weight:600;font-size:26px;line-height:1.2;color:var(--accent,#f0f6fc);margin:0 44px 8px 0;letter-spacing:-.02em}" +
    ".le-sub{color:var(--muted,#8b949e);font-size:15px;margin:0 0 20px}" +
    ".le-form{display:flex;flex-direction:column;gap:14px}" +
    ".le-form label{display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--muted,#8b949e)}" +
    ".le-form .le-opc{font-size:12px;opacity:.8}" +
    ".le-form input[type=text],.le-form input[type=email],.le-form input[type=tel],.le-form select,.le-form textarea{background:var(--bg,#0d1117);border:1px solid var(--border,#30363d);border-radius:10px;padding:13px 14px;color:var(--text,#e6edf3);font-family:inherit;font-size:16px;width:100%}" +
    ".le-form textarea{min-height:88px;resize:vertical}" +
    ".le-form input:focus,.le-form select:focus,.le-form textarea:focus{outline:none;border-color:var(--brand,#288A89)}" +
    ".le-linha{display:grid;grid-template-columns:1fr;gap:14px}.le-linha[hidden]{display:none}" +
    ".le-cont{font-size:12px;text-align:right;color:var(--muted,#8b949e)}" +
    ".le-check{flex-direction:row!important;gap:10px!important;align-items:flex-start;font-size:13px!important;line-height:1.5}" +
    ".le-check input{margin-top:3px;width:18px;height:18px;flex:0 0 auto;accent-color:var(--brand,#288A89)}" +
    ".le-check a{color:var(--brand,#288A89)}" +
    ".le-turn{display:flex;justify-content:center;min-height:65px}" +
    ".le-enviar{margin-top:4px;padding:16px 24px;background:var(--brand,#288A89);color:#fff;border:0;border-radius:100px;font-weight:600;font-size:16px;cursor:pointer;font-family:inherit;width:100%}" +
    ".le-enviar:hover:not(:disabled){background:var(--brand-hover,#2EA09E)}" +
    ".le-enviar:disabled{opacity:.6;cursor:not-allowed}" +
    ".le-msg{font-size:14px;color:var(--danger,#f85149);min-height:1em;margin:0;text-align:center}" +
    ".le-ok{display:none;text-align:center;padding:24px 0 8px}" +
    ".le-ok .le-v{width:64px;height:64px;border-radius:50%;background:var(--brand-soft,#288A8922);border:2px solid var(--brand,#288A89);color:var(--brand,#288A89);font-size:30px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 18px}" +
    ".le-ok p{font-family:'Fraunces',serif;font-weight:600;font-size:22px;line-height:1.3;color:var(--accent,#f0f6fc);margin:0 0 20px}" +
    ".le-ok button{background:transparent;border:1px solid var(--brand,#288A89);color:var(--brand,#288A89);border-radius:100px;padding:12px 24px;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer}" +
    "body.le-travado{overflow:hidden}" +
    "@media(min-width:600px){.le-fundo{align-items:center;padding:24px}.le-caixa{border-radius:20px;border-bottom:1px solid var(--brand,#288A89);padding:36px 36px 28px}.le-linha.dupla{grid-template-columns:1fr 1fr}}";

  var HTML = "" +
    '<div class="le-caixa" role="dialog" aria-modal="true" aria-labelledby="le-titulo">' +
    '<button type="button" class="le-fechar" aria-label="Fechar">×</button>' +
    '<span class="le-tag">Lançamento 12/12</span>' +
    '<h2 id="le-titulo">Seja avisado no lançamento</h2>' +
    '<p class="le-sub">No dia 12/12 você recebe o link para assinar antes de todo mundo.</p>' +
    '<form class="le-form" novalidate>' +
    '<label>Nome<input type="text" name="nome" autocomplete="name" required maxlength="120"></label>' +
    '<label>E-mail<input type="email" name="email" autocomplete="email" required maxlength="254" inputmode="email"></label>' +
    '<label>WhatsApp com DDD<input type="tel" name="whatsapp" autocomplete="tel-national" required inputmode="tel" placeholder="(11) 91234-5678" maxlength="20"></label>' +
    '<label>Plano<select name="plano"><option value="familia">Família</option><option value="empresas">Empresas</option></select></label>' +
    '<div class="le-linha" data-so="familia"><label><span>Quantas pessoas vão usar? <span class="le-opc">(opcional)</span></span><select name="pessoas_familia"><option value="">Escolha</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label></div>' +
    '<div class="le-linha dupla" data-so="empresas" hidden><label><span>Quantas empresas? <span class="le-opc">(opcional)</span></span><select name="empresas"><option value="">Escolha</option><option>1</option><option>2</option><option>3</option></select></label>' +
    '<label><span>Quantas pessoas na equipe? <span class="le-opc">(opcional)</span></span><select name="pessoas_empresas"><option value="">Escolha</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label></div>' +
    '<label><span>Alguma dúvida? <span class="le-opc">(opcional)</span></span><textarea name="duvida" maxlength="500" rows="3"></textarea><span class="le-cont" aria-live="polite">0/500</span></label>' +
    '<label class="le-check"><input type="checkbox" name="consent" required><span>Autorizo o Notinha a me avisar por e-mail e WhatsApp sobre o lançamento, conforme a <a href="/privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>.</span></label>' +
    '<div class="le-turn"></div>' +
    '<p class="le-msg" role="alert"></p>' +
    '<button type="submit" class="le-enviar">Entrar na lista de espera</button>' +
    "</form>" +
    '<div class="le-ok" aria-live="polite"><div class="le-v">✓</div><p>Pronto! Você está na lista. Avisamos no dia 12/12.</p><button type="button" class="le-ok-fechar">Fechar</button></div>' +
    "</div>";

  var ERROS = {
    nome: "Confira o seu nome.",
    email: "Confira o e-mail.",
    whatsapp: "Confira o WhatsApp, com DDD.",
    consentimento: "Marque a autorização para podermos te avisar.",
    duvida: "A dúvida pode ter até 500 caracteres.",
    captcha: "A verificação de segurança expirou. Faça de novo.",
    muitas_tentativas: "Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.",
  };

  function el(nome) { return form.elements[nome]; }
  function msg(t) { modal.querySelector(".le-msg").textContent = t || ""; }

  function trocarPlano(plano) {
    el("plano").value = plano;
    modal.querySelectorAll("[data-so]").forEach(function (b) { b.hidden = b.getAttribute("data-so") !== plano; });
  }

  function carregarTurnstile(cb) {
    if (window.turnstile) return cb();
    window.__leTurnPronto = cb;
    var s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__leTurnPronto";
    s.async = true;
    document.head.appendChild(s);
  }
  function montarTurnstile() {
    carregarTurnstile(function () {
      var alvo = modal.querySelector(".le-turn");
      if (turnId !== null) { try { window.turnstile.reset(turnId); } catch (e) {} return; }
      try {
        turnId = window.turnstile.render(alvo, {
          sitekey: SITEKEY, theme: "dark",
          callback: function (t) { turnToken = t || ""; },
          "expired-callback": function () { turnToken = ""; },
          "error-callback": function () { turnToken = ""; },
        });
      } catch (e) {}
    });
  }

  function montar() {
    if (modal) return;
    var st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    modal = document.createElement("div");
    modal.className = "le-fundo";
    modal.innerHTML = HTML;
    document.body.appendChild(modal);
    form = modal.querySelector("form");

    modal.querySelector(".le-fechar").addEventListener("click", fechar);
    modal.querySelector(".le-ok-fechar").addEventListener("click", fechar);
    modal.addEventListener("click", function (e) { if (e.target === modal) fechar(); });
    document.addEventListener("keydown", function (e) {
      if (!modal.classList.contains("aberto")) return;
      if (e.key === "Escape") fechar();
      if (e.key === "Tab") {
        var f = Array.prototype.filter.call(modal.querySelectorAll("button,input,select,textarea,a[href]"), function (x) { return !x.disabled && x.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    el("plano").addEventListener("change", function () { trocarPlano(el("plano").value); });
    el("duvida").addEventListener("input", function () { modal.querySelector(".le-cont").textContent = el("duvida").value.length + "/500"; });
    form.addEventListener("submit", enviar);
  }

  function abrir(plano, origem) {
    montar();
    if (!NOMES[plano]) plano = "familia";
    ultimoFoco = document.activeElement;
    form.style.display = "";
    modal.querySelector(".le-ok").style.display = "none";
    msg("");
    trocarPlano(plano);
    modal.classList.add("aberto");
    document.body.classList.add("le-travado");
    montarTurnstile();
    setTimeout(function () { try { el("nome").focus({ preventScroll: true }); } catch (e) {} }, 30);
    ev("lista_espera_abrir", { plano: plano, origem: origem || "botao" });
  }
  function fechar() {
    if (!modal) return;
    modal.classList.remove("aberto");
    document.body.classList.remove("le-travado");
    if (ultimoFoco && ultimoFoco.focus) try { ultimoFoco.focus({ preventScroll: true }); } catch (e) {}
  }

  function enviar(e) {
    e.preventDefault();
    msg("");
    var plano = el("plano").value;
    var tel = el("whatsapp").value.replace(/\D/g, "");
    var dados = {
      acao: "entrar",
      nome: el("nome").value.trim(),
      email: el("email").value.trim(),
      whatsapp: tel,
      plano: plano,
      pessoas: plano === "familia" ? el("pessoas_familia").value : el("pessoas_empresas").value,
      empresas: plano === "empresas" ? el("empresas").value : "",
      duvida: el("duvida").value.trim(),
      consent: el("consent").checked,
      turnstile: turnToken,
      user_agent: navigator.userAgent.slice(0, 300),
      referrer: (document.referrer || location.href).slice(0, 300),
    };
    if (dados.nome.length < 2) return msg(ERROS.nome);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dados.email)) return msg(ERROS.email);
    if (tel.length < 10 || tel.length > 13) return msg(ERROS.whatsapp);
    if (dados.duvida.length > 500) return msg(ERROS.duvida);
    if (!dados.consent) return msg(ERROS.consentimento);
    var b = modal.querySelector(".le-enviar");
    b.disabled = true;
    b.textContent = "Enviando...";
    fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.j.ok) throw new Error((res.j && res.j.erro) || "falha");
        form.style.display = "none";
        modal.querySelector(".le-ok").style.display = "block";
        modal.querySelector(".le-ok-fechar").focus();
        ev("generate_lead", { lead_tipo: "lista_espera_1212", plano: plano });
      })
      .catch(function (err) {
        msg(ERROS[err && err.message] || "Não foi possível enviar agora. Tente de novo em instantes.");
        turnToken = "";
        if (window.turnstile && turnId !== null) try { window.turnstile.reset(turnId); } catch (x) {}
      })
      .then(function () { b.disabled = false; b.textContent = "Entrar na lista de espera"; });
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-lista-espera]");
    if (!a) return;
    e.preventDefault();
    abrir(a.getAttribute("data-lista-espera"), a.getAttribute("data-origem") || "");
  });

  try {
    var q = new URLSearchParams(location.search).get("lista");
    if (NOMES[q]) {
      var abrirAgora = function () { abrir(q, "url"); };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", abrirAgora); else abrirAgora();
    }
  } catch (e) {}

  window.notinhaListaEspera = abrir;
})();
