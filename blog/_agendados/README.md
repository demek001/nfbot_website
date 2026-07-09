# Posts agendados

Cada pasta tem `index.html` + `post.json` com a data de publicacao (`data_iso`).
O workflow `.github/workflows/publicar-posts.yml` roda todo dia as 09h (Brasilia) e publica os que atingiram a data.

Pastas iniciadas com `_` sao ignoradas pelo GitHub Pages (Jekyll) e nao ficam acessiveis publicamente.

Para testar sem commitar: `python scripts/publicar-agendados.py --dry-run --data 2026-07-16`
