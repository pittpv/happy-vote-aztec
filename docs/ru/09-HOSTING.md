# Хостинг — aztec.happyvote.xyz

| Item | Value |
|------|-------|
| Домен | `aztec.happyvote.xyz` |
| Приложение | `web/` (Vite React) |
| Хост | Vercel |
| Сеть | Стабильный **6.0.0** на Testnet и Mainnet. Этот сайт голосует в Testnet. |

В монорепозитории Root Directory Vercel = `aztec/web`. В публичном репозитории = `web`.

CNAME `aztec` → Vercel, HTTPS. Тот же домен в ZKPassport Dashboard.

## Env (Production)

См. английскую версию: актуальный `VITE_HAPPY_VOTE_CONTRACT_ADDRESS` в [10-TESTNET-ADDRESSES.md](./10-TESTNET-ADDRESSES.md). Секреты каталога не коммитить.

## `vercel.json`

COOP/COEP для WASM proving. CSP: RPC, CRS CDN, ZKPassport. Connect показывает Browser session и расширения wallet-sdk после того, как пользователь одобрит HappyVote во всплывающем окне кошелька; каждое расширение появляется под своим именем. Demo Wallet Labs он не открывает: публичная сборка на Aztec 5.0.1, рукопожатие 6.0.0 не завершается, и бюллетень HappyVote он доказать не может. `frame-src` и `child-src` по-прежнему перечисляют `https://demo-wallet.aztec-labs.com`. SPA rewrite не глотает `/api/*`, `robots.txt`, `sitemap.xml`. `/`, `/polls`, `/faq`, `/p/:id` и `/legal/:slug` отдают `/api/document` с уникальным head. Остальные пути приложения — `/index.html`.

## API

| Endpoint | Роль |
|----------|------|
| `GET /api/poll-state` | Tallies для гостя и для подключённого кошелька, кэш ~15с. `?fresh=1` обходит кэш (`Cache-Control: no-store`) после бюллетеня и по Refresh. Нули если sealed и активен (UI нули на кнопках не рисует); есть `paused` / `cancelled` / `votingOpen`. Poseidon-слоты пишутся в каталог при публикации (любой poll id). `GET /api/poll-state?catalog=1` отдаёт `{ polls: { "<id>": { closed, votingOpen, … } } }` и пропускает опросы, у которых каталожный `endsAt` уже прошёл. Карточка, которая ещё может быть открыта, переходит в **Ended** после on-chain закрытия. Тот же кэш ~15с |
| `GET/POST /api/polls` | Каталог (seed + overlay). `GET /api/polls` — опросы, у которых окно ещё не кончилось, плюс опросы главной. Завершённые вне главной: `GET /api/polls?ended=1` с `lane` `authoritative` или `users`, `offset` и `limit` (по умолчанию 24, максимум 48). `GET /api/polls?id=` для `/p/:id`, включая завершённый опрос. `GET /api/polls?creator=` — листинги этого адреса на текущем контракте, включая опросы с прошедшим `endsAt`, плюс три открытых on-chain слота. Скрытые названия не отдаются. `showOnHome` / `homeRank` для главной; создатель эти флаги не ставит. `/polls` — **Authoritative polls** и **User polls**, в каждой **Active**, затем одна общая секция **Ended**. Фильтр стран также читает Dashboard policy, если задан `policyId`. Смена каталожного `policyId` у существующего опроса не переписывает on-chain `metadata_hash`. Промах overlay кешируется коротко; `404` по id на CDN не кладётся. |
| `POST /api/zkpassport-verify` | Server re-verify |
| `POST /api/client-error` | Логи ошибок |
| `POST /api/site-stats` | Обезличенные дневные агрегаты посещений (без cookies, без IP) |
| `GET /api/site-stats` | Те же агрегаты, только оператор |

Не класть новый `AztecAddress` в зависимости `useEffect`.

## SEO и аналитика

`index.html`, `seo.js` и `/api/document`: title, description, canonical, Open Graph, Twitter и JSON-LD. У каждого опроса свой `Question` и свой URL картинки `/api/og`. `robots.txt`, `sitemap.xml` (включая `/faq` и `/p/1`–`/p/5`). Стороннего счётчика нет. Есть first-party cookieless агрегат `POST /api/site-stats` (страна, раздел сайта, просмотры). Чтение агрегатов — только у оператора.
