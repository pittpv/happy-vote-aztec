# 01 — Спецификация продукта

## 1. Цель

Платформа голосований на **aztec.happyvote.xyz**: минимальный UX, programmable privacy Aztec и опциональный ZKPassport.

Бренд: **HappyVote on Aztec**. EVM HappyVote (Happy/Sad) — отдельный продукт.

## 2. Роли

| Роль | Итерация 1 | Итерация 2 |
|------|------------|------------|
| **Голосующий** | Голосует в опубликованных опросах | То же |
| **Оператор HappyVote** | Публикует и закрывает опросы | То же + модерация пользовательских |
| **Создатель опроса** | — | Любой Aztec-аккаунт (с лимитами) |
| **Наблюдатель** | Смотрит публичные итоги без кошелька | То же |

## 3. Шаблоны

Платформа **не** ограничена Happy/Sad.

| Шаблон | Описание | Пример |
|--------|----------|--------|
| `binary` | Два варианта | Happy / Sad |
| `single_choice` | Один из N | Кандидат A/B/C |
| `multi_choice` | До K из N | Позже |
| `yes_no_abstain` | Да / Нет / Воздержался | Позже |
| `approval` | Approve / Reject | Позже |
| `ranked` | Ранжирование | После MVP |

Off-chain метаданные (каталог + опционально Vercel Blob): `title`, `description`, `locale`, `options[]`, `category`, `tags[]`, `cover`, `legal_notice`, опциональные `startsAt` / `endsAt`, JSON требований ZKPassport.

On-chain целостность: `metadata_hash` (SHA-256 канонического JSON → Field).

## 4. Жизненный цикл

```
created → (опциональное ожидание startsAt) → open → ended
```

- В UI и **on-chain** голос принимается, пока опрос существует, контракт не на паузе, опрос не отменён, `vote_ended` = false и окно `starts_at` / `ends_at` открыто (`0` = не задано).
- Опциональные unix-секунды on-chain; каталог хранит те же моменты как ISO-8601. Оба пустые → опрос открыт, пока его не закроют `end_poll` / `cancel_poll`.
- Опрос можно **опубликовать до `starts_at`**. Вопрос виден сразу; Connect и Vote открываются автоматически в момент старта и закрываются в `ends_at`. Прямые `cast_vote_*` вне окна отклоняются контрактом.
- После закрытия голоса отклоняются; tallies остаются читаемыми (если не sealed и ещё открыт).
- **Sealed tally:** пока sealed **и** не закрыт (`vote_ended`, cancel или `now >= ends_at`), `get_tally` / `get_total_votes` возвращают `0`; UI скрывает live results.

`end_poll` закрывает сразу. По `ends_at` опрос закрывается без отдельной tx. `cancel_poll` только при `total_votes == 0`.

## 5. Приватность

### 5.1 Политика опроса

| Политика | Значение | Смысл |
|----------|----------|--------|
| `private_only` | 0 | Только приватные бюллетени |
| `public_only` | 1 | Только открытые |
| `voter_choice` | 2 | Выбор голосующего |

### 5.2 Что видит сеть

| Бюллетень | Кто голосовал | Выбор | Итоги |
|-----------|---------------|-------|-------|
| **Private** | Адрес скрыт (nullifier) | Инкремент публичного `tally[option]`, если не sealed | Публично после reveal / если не sealed |
| **Open** | Адрес + выбор в `open_ballots` | Публичен | Та же карта tally |
| **Private + ZKPassport** | Personhood commitment на опрос | Как private | То же |

Private **не** скрывает вариант с live-табло: `option_id` уходит в public enqueue. Скрывается **Aztec-адрес**.

## 6. Eligibility

| Уровень | `eligibility_mode` | Механизм |
|---------|-------------------|----------|
| Open | 0 | Любой аккаунт; один голос через `SingleUseClaim` |
| Personhood | 1 | ZKPassport `uniqueIdentifier` → `identity_commitment` |
| Gated | 2 | Personhood + возраст / гражданство / sanctions / FaceMatch / Dashboard policy |

Важные опросы — минимум personhood. Детали в JSON каталога; hash on-chain.

## 7. Функциональные требования

### Must-have (итерация 1) — сделано

Каталог, страница опроса, Connect, private + optional open, защита от double-vote, `end_poll`, шаблоны binary / single_choice, публикация опросов операторами, гостевые tallies, домен, документация.

### Should-have (1.5) — в основном сделано

ZKPassport + server re-verify + identity claim, sealed, шаринг `/p/:id`, Sponsored FPC, Aztecscan, юридические страницы, SEO, общий каталог.

Осталось вручную: E2E ZKPassport на устройстве; выключить Dev Mode.

### Итерация 2 — не начата

Permissionless `create_poll`, антиспам, модерация, discovery.

## 8. Нефункциональные

| Область | Требование |
|---------|------------|
| Безопасность | Нет silent fallback на `AztecAddress.ZERO` |
| Приватность | Нет копий паспорта на серверах HappyVote |
| Версии | Pin Aztec **5.1.0** |
| Юридическое | Платформа ≠ избирательная комиссия |
| Аналитика | Нет стороннего счётчика на aztec.happyvote.xyz |
| UX | Миссия на главной; 1080px; честный копирайт private-голоса |

## 9. Анти-цели

Не копировать UX EVM HappyVote. Не хранить паспорта. Не брендировать как госвыборы. Не вызывать `nargo` / `bb` вместо `aztec` CLI. Не смешивать Solidity с Aztec.nr.

## 10. Сценарии

### Sentiment (`/p/1`)

Главная → Open polls → Happy/Sad → Connect → Private (по умолчанию) или Open → prove → live results.

### Важный опрос (`/p/3`)

Открыть опрос → QR ZKPassport → server re-verify → **Identity verified** → Connect → голос. Один identity — один голос на опрос (между аккаунтами тоже).
