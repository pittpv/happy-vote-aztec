# Хостинг — aztec.happyvote.xyz

| Item | Value |
|------|-------|
| Домен | `aztec.happyvote.xyz` |
| Приложение | `web/` (Vite React) |
| Хост | Vercel |
| Сеть | Testnet **5.1.0** |

В монорепозитории Root Directory Vercel = `aztec/web`. В публичном репозитории = `web`.

CNAME `aztec` → Vercel, HTTPS. Тот же домен в ZKPassport Dashboard.

## Env (Production)

См. английскую версию: актуальный `VITE_HAPPY_VOTE_CONTRACT_ADDRESS` в [10-TESTNET-ADDRESSES.md](./10-TESTNET-ADDRESSES.md). Секреты каталога не коммитить.

## `vercel.json`

COOP/COEP для WASM proving. CSP: RPC, CRS CDN, ZKPassport. SPA rewrite не глотает `/api/*`, `robots.txt`, `sitemap.xml`.

## API

| Endpoint | Роль |
|----------|------|
| `GET /api/poll-state` | Гостевые tallies, кэш ~15с; нули если sealed и активен; есть `paused` / `cancelled` / `votingOpen` |
| `GET/POST /api/polls` | Каталог (seed + Blob) |
| `POST /api/zkpassport-verify` | Server re-verify |
| `POST /api/client-error` | Логи ошибок |

Не класть новый `AztecAddress` в зависимости `useEffect`.

## SEO и аналитика

`index.html` + `seo.js`: title, OG, JSON-LD. `robots.txt`, `sitemap.xml`. Стороннего счётчика нет.
