# Contribuindo com o PeekMe

Que bom que você quer ajudar! Toda contribuição é bem-vinda: relato de problema, ideia, correção no README ou código.

## Onde falar

| Quero... | Use |
|---|---|
| Tirar uma dúvida, comentar ou mostrar o meu PeekMe | [Discussões](https://github.com/williampeixinho/PeekMe/discussions) |
| Relatar algo que não funciona | [Nova issue → Problema](https://github.com/williampeixinho/PeekMe/issues/new/choose) |
| Sugerir um recurso | [Nova issue → Sugestão](https://github.com/williampeixinho/PeekMe/issues/new/choose) |
| Relatar uma falha de segurança | Em privado, por [Security → Report a vulnerability](https://github.com/williampeixinho/PeekMe/security/advisories/new). Não abra issue pública |

**Nunca publique o seu `.env`, senhas, tokens, chaves ou IP público** em issues, discussões ou prints.

## Enviando código

1. Faça um fork e crie uma branch: `git checkout -b minha-melhoria`.
2. Rode localmente (veja **Desenvolvimento** no README) e teste transmitindo e assistindo.
3. Mantenha o estilo do projeto: JavaScript simples, sem framework, comentários e textos em português.
4. Se mudar alguma configuração, atualize o `README.md` e o `.env.example`.
5. Adicione uma linha no `CHANGELOG.md`, em **Não lançado**.
6. Abra o pull request preenchendo o modelo.

## Versões

O projeto usa [versionamento semântico](https://semver.org/lang/pt-BR/):

- **CORREÇÃO** (1.0.**1**): conserto sem mudar nada para quem usa.
- **MENOR** (1.**1**.0): recurso novo que não quebra instalações existentes.
- **MAIOR** (**2**.0.0): exige mudança no `.env` ou na instalação.

Para lançar uma versão (mantenedores): mova os itens de "Não lançado" para a nova versão no `CHANGELOG.md`, atualize `version` em `app/package.json`, faça o commit, crie a tag (`git tag v1.1.0 && git push --tags`) e publique a Release no GitHub com o texto do CHANGELOG.
