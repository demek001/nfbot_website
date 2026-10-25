// Selo da cortesia de 7 dias no card do Pleno (index, landing-notinha, controle-gastos-whatsapp).
// Só aparece com a chave ligada (trial_base_dias > 0), lida pela função continuar. Com a chave em
// 0, ou se a chamada falhar, o card fica como está. Marcação: data-cortesia="card" no card,
// "preco" no preço e "cta" no botão. O preço não é riscado e o card do Premium não muda.
(function () {
  var API = "https://xpzjwlhrlebdpcybxaxu.supabase.co/functions/v1/continuar";
  fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"acao":"cortesia_disponivel"}' })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (j) {
      var d = Number(j && j.dias) || 0;
      if (d <= 0) return;
      document.querySelectorAll('[data-cortesia="card"]').forEach(function (card) {
        if (getComputedStyle(card).position === "static") card.style.position = "relative";
        var selo = document.createElement("span");
        selo.textContent = "Teste por " + d + " dias sem compromisso";
        selo.style.cssText = "position:absolute;top:-15px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#F5A524;color:#0d1117;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;padding:6px 14px;border-radius:100px;line-height:1.3;z-index:2";
        card.appendChild(selo);
        var preco = card.querySelector('[data-cortesia="preco"]');
        if (preco) {
          var p = document.createElement("p");
          p.textContent = "Teste sem colocar cartão de crédito.";
          p.style.cssText = "color:#F5A524;font-size:14px;font-weight:600;margin:6px 0 0";
          preco.insertAdjacentElement("afterend", p);
        }
        var cta = card.querySelector('[data-cortesia="cta"]');
        if (cta) cta.textContent = "Testar o Pleno por " + d + " dias →";
      });
    })
    .catch(function () {});
})();
