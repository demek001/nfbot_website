#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Publica posts agendados do Caderninho.

Lê blog/_agendados/<slug>/post.json. Para cada post cuja data_iso já chegou:
  1. move blog/_agendados/<slug>/ -> blog/<slug>/
  2. insere o card no topo de blog/index.html
  3. adiciona a URL ao sitemap.xml
  4. atualiza o lastmod de / e /blog/

Rodar da raiz do repositório.
Use --dry-run para simular sem alterar arquivos.
"""
import json
import os
import re
import shutil
import sys
from datetime import date

RAIZ = os.getcwd()
AGENDADOS = os.path.join(RAIZ, "blog", "_agendados")
BLOG_INDEX = os.path.join(RAIZ, "blog", "index.html")
SITEMAP = os.path.join(RAIZ, "sitemap.xml")
BASE = "https://usenotinha.com.br"

DRY = "--dry-run" in sys.argv
HOJE = date.today()

if "--data" in sys.argv:  # para testes: --data 2026-07-16
    HOJE = date.fromisoformat(sys.argv[sys.argv.index("--data") + 1])


def log(msg):
    print(msg, flush=True)


def montar_card(p):
    return f'''      <a href="{p['slug']}/" class="post-card">
        <img src="img/{p['slug']}.webp" alt="{p['alt']}" class="post-card-image" loading="lazy" width="1536" height="1024">
        <div class="post-card-body">
          <span class="post-card-tag">{p['tag']}</span>
          <h2>{p['titulo']}</h2>
          <p>{p['desc']}</p>
          <div class="post-card-meta">
            <span>{p['data_card']} · {p['read']}</span>
            <span class="post-card-cta">Ler post →</span>
          </div>
        </div>
      </a>'''


def inserir_no_indice(p):
    s = open(BLOG_INDEX, encoding="utf-8").read()
    if f'href="{p["slug"]}/"' in s:
        log(f'  · card já existe no índice, pulando')
        return s
    ancora = '    <div class="posts">'
    if ancora not in s:
        raise SystemExit('ERRO: <div class="posts"> não encontrado em blog/index.html')
    s = s.replace(ancora, ancora + "\n\n" + montar_card(p), 1)
    s = re.sub(r'\n    <div class="empty-soon">.*?</div>\n', "\n", s, flags=re.S)
    return s


def inserir_no_sitemap(p):
    s = open(SITEMAP, encoding="utf-8").read()
    loc = f"{BASE}/blog/{p['slug']}/"
    if loc in s:
        log("  · sitemap já contém a URL, pulando")
        return s
    entrada = (
        "  <url>\n"
        f"    <loc>{loc}</loc>\n"
        f"    <lastmod>{p['data_iso']}</lastmod>\n"
        "    <changefreq>monthly</changefreq>\n"
        "    <priority>0.7</priority>\n"
        "  </url>\n"
    )
    s = s.replace("</urlset>", entrada + "</urlset>")
    # atualiza lastmod da home e do blog
    hoje = HOJE.isoformat()
    for alvo in (f"{BASE}/", f"{BASE}/blog/"):
        s = re.sub(
            r"(<loc>" + re.escape(alvo) + r"</loc>\s*<lastmod>)[^<]+(</lastmod>)",
            r"\g<1>" + hoje + r"\g<2>",
            s,
        )
    return s


def main():
    if not os.path.isdir(AGENDADOS):
        log("Nada agendado.")
        return

    pendentes = []
    for slug in sorted(os.listdir(AGENDADOS)):
        meta = os.path.join(AGENDADOS, slug, "post.json")
        if not os.path.isfile(meta):
            continue
        p = json.load(open(meta, encoding="utf-8"))
        if date.fromisoformat(p["data_iso"]) <= HOJE:
            pendentes.append(p)

    if not pendentes:
        log(f"[{HOJE}] Nenhum post para publicar hoje.")
        return

    pendentes.sort(key=lambda x: x["data_iso"])

    for p in pendentes:
        log(f"[{HOJE}] Publicando: {p['slug']} (agendado para {p['data_iso']})")
        origem = os.path.join(AGENDADOS, p["slug"])
        destino = os.path.join(RAIZ, "blog", p["slug"])

        idx = inserir_no_indice(p)
        sm = inserir_no_sitemap(p)

        if DRY:
            log("  · dry-run: nada gravado")
            continue

        os.makedirs(destino, exist_ok=True)
        shutil.move(os.path.join(origem, "index.html"), os.path.join(destino, "index.html"))
        os.remove(os.path.join(origem, "post.json"))
        os.rmdir(origem)

        open(BLOG_INDEX, "w", encoding="utf-8").write(idx)
        open(SITEMAP, "w", encoding="utf-8").write(sm)
        log(f"  · publicado em /blog/{p['slug']}/")

    if not DRY:
        titulos = ", ".join(p["slug"] for p in pendentes)
        with open(os.environ.get("GITHUB_OUTPUT", "/dev/null"), "a") as f:
            f.write(f"publicados={titulos}\n")
            f.write("houve_publicacao=true\n")


if __name__ == "__main__":
    main()
