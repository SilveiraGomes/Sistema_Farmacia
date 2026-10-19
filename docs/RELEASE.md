# Lista de verificação de release

Para quem monta e publica uma nova versão do KILSYSTEM PHARMACY. Seguir por ordem; não saltar passos.

## Antes do build
1. **Versão nova, sempre.** `npm version patch --no-git-tag-version` (ou `minor`). Nunca refazer uma versão já publicada: os clientes que já a têm não recebem a actualização. O build recusa versões já publicadas.
2. **CHANGELOG.md:** mover o conteúdo de «Por publicar» para uma secção `## X.Y.Z — AAAA-MM-DD`.
3. **Alterações ao esquema da base de dados:** devem ir para `src/backend/migrations/index.js` como migração nova (nunca editar uma migração já publicada).

## Build
4. `npm run dist` — corre automaticamente a verificação da versão e a suite completa (`npm test`); se algo falhar, o instalador não é montado.
5. `npm run test:release:final` — confirma instalador, `.blockmap` e `latest.yml` da versão.
6. **Teste com dados reais:** abrir a aplicação montada contra uma cópia de uma base real (nunca a base de um cliente) e confirmar arranque, login, stock, uma venda e um backup.

## Publicação
7. Commit de `release/latest.yml`, tag anotada `vX.Y.Z`, `git push` do ramo e da tag.
8. GitHub Release `vX.Y.Z` com o nome «KILSYSTEM PHARMACY vX.Y.Z», marcada como Latest, com os três ficheiros: `KILSYSTEM-PHARMACY-Setup-X.Y.Z.exe`, `.blockmap` e `latest.yml`.
9. **Verificar como um cliente:** `https://github.com/SilveiraGomes/Sistema_Farmacia/releases/latest/download/latest.yml` deve indicar a versão nova e o sha512 deve coincidir com o instalador local.

## Depois de publicar
10. Acompanhar os primeiros clientes que actualizam; em caso de problema pedir os ficheiros de `logs` (Configurações › Alertas e backup › Abrir pasta de registos).
