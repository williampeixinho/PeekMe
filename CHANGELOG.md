# Changelog

Todas as mudanças relevantes do PeekMe ficam registradas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [versionamento semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Melhorias
- Instalação com IA: prompt curto e roteiro detalhado em `docs/INSTALAR-COM-IA.md` (detecção de CGNAT, verificação de portas, segredos protegidos, teste final e modo de atualização).

## [1.0.0] - 2026-10-27

Primeira versão pública.

### Recursos
- Transmissão de tela com áudio pelo navegador, protegida por senha; quem assiste só precisa do link, sem conta.
- Qualidade 720p ou 1080p a 60 fps, com camadas menores automáticas para quem tem internet fraca.
- Uma transmissão por vez, com limite de espectadores configurável (`MAX_VIEWERS`).
- Áudio do sistema no Chrome/Edge para Windows, áudio de abas no macOS/Linux e entrada de áudio ("Monitor of …") como alternativa no Firefox.
- Avisos de transmissão sem áudio e botão para ativar o som quando o navegador bloqueia.
- Tudo em Docker: LiveKit (vídeo), Caddy (HTTPS automático) e o site em Node.js; roda em `amd64` e `arm64` (Raspberry Pi).
- Funciona sem abrir portas (CGNAT, Starlink, 4G) com Cloudflare Tunnel e TURN do Cloudflare, ambos opcionais.
- DuckDNS opcional para domínio grátis.
- Instalação guiada por IA (Claude Code ou Codex) com um prompt pronto, além do passo a passo manual.
- `/healthz` informa a versão em execução.

[Não lançado]: https://github.com/williampeixinho/PeekMe/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/williampeixinho/PeekMe/releases/tag/v1.0.0
