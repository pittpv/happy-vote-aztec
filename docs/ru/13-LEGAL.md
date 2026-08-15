# 13 — Юридические документы

Тексты в UI на английском. Вступают **15 August 2026**. Контакт: **legal@happyvote.xyz**.

Рабочие формулировки под текущий продукт, не замена юридической экспертизе.

| Документ | URL |
|----------|-----|
| Terms of Service | https://aztec.happyvote.xyz/legal/terms |
| Privacy Policy | https://aztec.happyvote.xyz/legal/privacy |
| Data Safety | https://aztec.happyvote.xyz/legal/data-safety |
| Cookie Policy | https://aztec.happyvote.xyz/legal/cookies |
| GDPR | https://aztec.happyvote.xyz/legal/gdpr |

Исходник: `web/src/lib/legalDocs.js`.

## Содержание

- **Terms** — Testnet-демо, не официальные выборы; кошелёк Aztec; private vs open; ZKPassport как третья сторона.
- **Privacy** — публичное on-chain состояние vs private бюллетени; API tallies; каталог; логи хостинга; свои cookieless агрегаты посещений.
- **Data Safety** — нет изображений паспорта; proofs проверяются и не хранятся как паспорт; ключи в браузере / PXE.
- **Cookies** — functional `localStorage`; нет first-party analytics cookies.
- **GDPR** — роли, основания, трансферы, права.

Cookie / Privacy / GDPR фиксируют, что стороннего счётчика на поддомене нет. Посещения считаются своими агрегатами без cookies.
