# Хостинг — aztec.happyvote.xyz

| Item | Value |
|------|-------|
| Домен | `aztec.happyvote.xyz` |
| Приложение | `web/` (Vite React) |
| Хост | Vercel |
| Сеть | Testnet **5.1.0** |

CNAME `aztec` → хост, HTTPS. Тот же домен в ZKPassport Dashboard.

Публичные `VITE_*` и адрес контракта: [10-TESTNET-ADDRESSES.md](./10-TESTNET-ADDRESSES.md). Секреты оператора только в окружении хоста, не в git.

## Публичные API

| Endpoint | Роль |
|----------|------|
| `GET /api/poll-state` | Гостевые tallies (кэш); нули, если опрос sealed и ещё активен |
| `GET /api/polls` | Каталог |
| `POST /api/zkpassport-verify` | Server re-verify ZKPassport |

## SEO и аналитика

`index.html` + `seo.js`: title, OG, JSON-LD. `robots.txt`, `sitemap.xml`. Стороннего счётчика нет.
