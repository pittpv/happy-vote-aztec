# Хостинг — aztec.happyvote.xyz

| Item | Value |
|------|-------|
| Домен | `aztec.happyvote.xyz` |
| Приложение | `web/` (Vite React) |
| Хост | Сайт HappyVote для этого домена |
| Сеть | Стабильный **6.0.0** на Testnet и Mainnet. Этот сайт голосует в Testnet. |

В публичном репозитории приложение лежит в `web/`.

`aztec.happyvote.xyz` отдаётся по HTTPS. Тот же домен зарегистрирован в ZKPassport Dashboard.

## Публичные настройки сборки

Актуальный `VITE_HAPPY_VOTE_CONTRACT_ADDRESS` — в [10-TESTNET-ADDRESSES.md](./10-TESTNET-ADDRESSES.md). Список публичных `VITE_*` — в английской версии. Оверлей каталога — файл на хосте, в git его нет.

## Заголовки ответа

Сайт отправляет заголовки из `web/vercel.json`. COOP/COEP для WASM proving. CSP: RPC, CRS CDN, ZKPassport. Connect показывает Browser session и расширения wallet-sdk после того, как пользователь одобрит HappyVote во всплывающем окне кошелька; каждое расширение появляется под своим именем. Demo Wallet Labs он не открывает: публичная сборка на Aztec 5.0.1, рукопожатие 6.0.0 не завершается, и бюллетень HappyVote он доказать не может. `frame-src` и `child-src` по-прежнему перечисляют `https://demo-wallet.aztec-labs.com`. `/`, `/polls`, `/faq`, `/p/:id` и `/legal/:slug` отдают `/api/document` с уникальным head. Остальные пути приложения — `/index.html`. `/api/*`, `robots.txt` и `sitemap.xml` этот rewrite не перехватывает.

## API

| Endpoint | Роль |
|----------|------|
| `GET /api/poll-state` | Tallies для гостя и для подключённого кошелька, кэш ~15с. `?fresh=1` обходит кэш (`Cache-Control: no-store`) после бюллетеня и по Refresh. Нули если sealed и активен (UI нули на кнопках не рисует); есть `paused` / `cancelled` / `votingOpen`. Poseidon-слоты пишутся в каталог при публикации (любой poll id). `GET /api/poll-state?catalog=1` отдаёт `{ polls: { "<id>": { closed, votingOpen, … } } }` и пропускает опросы, у которых каталожный `endsAt` уже прошёл. Карточка, которая ещё может быть открыта, переходит в **Ended** после on-chain закрытия. Тот же кэш ~15с |
| `GET/POST /api/polls` | Каталог (seed + overlay). `GET /api/polls` — опросы, у которых окно ещё не кончилось, плюс опросы главной. Завершённые вне главной: `GET /api/polls?ended=1` с `lane` `authoritative` или `users`, `offset` и `limit` (по умолчанию 24, максимум 48). `GET /api/polls?id=` для `/p/:id`, включая завершённый опрос. `GET /api/polls?creator=` — листинги этого адреса на текущем контракте, включая опросы с прошедшим `endsAt`, плюс три открытых on-chain слота. Скрытые названия не отдаются. Your polls показывает этот ответ до проверки приватной заметки в кошельке. `GET /api/polls?closure=1,2` — публичные признаки «завершён», «отменён» и время окончания для 1–12 id. Your polls вызывает его после того, как кошелёк прочитал заметку приватного автора. Секрет автора в запрос не входит. `showOnHome` / `homeRank` для главной; создатель эти флаги не ставит. `/polls` — **Authoritative polls** и **User polls**, в каждой **Active**, затем одна общая секция **Ended**. Фильтр стран также читает Dashboard policy, если задан `policyId`. Смена каталожного `policyId` у существующего опроса не переписывает on-chain `metadata_hash`. Промах overlay кешируется коротко; `404` по id на CDN не кладётся. |
| `POST /api/zkpassport-verify` | Server re-verify |
| `POST /api/client-error` | Логи ошибок |
| `POST /api/site-stats` | Обезличенные дневные агрегаты посещений. Страна считается на хосте из IP запроса, затем IP отбрасывается и во внешний геосервис не уходит. Счёт меньше 3 визитов склеивается. Без cookies и без poll ID |
| `GET /api/site-stats` | Те же агрегаты, только оператор |

Не класть новый `AztecAddress` в зависимости `useEffect`.

## Проверка карточки

`POST /api/polls` сверяет пользовательскую карточку с цепью в процессе сайта (`web/api/verify-account-poll.js`). У процесса есть установленное дерево зависимостей, включая `pino-pretty`. Открытый и скрытый автор идут через одну и ту же проверку. Секрет скрытого автора и бюллетень в этот запрос не входят.

## SEO и аналитика

`index.html`, `seo.js` и `/api/document`: title, description, canonical, Open Graph, Twitter и JSON-LD. У каждого опроса свой `Question` и свой URL картинки `/api/og`. `robots.txt`, `sitemap.xml` (включая `/faq` и `/p/1`–`/p/5`). Стороннего счётчика нет. Есть first-party cookieless агрегат `POST /api/site-stats` (страна, раздел сайта, просмотры). Страна считается на хосте из IP запроса; IP не хранится и во внешний геосервис не уходит. Чтение агрегатов — только у оператора.
