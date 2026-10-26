# PeekMe

Compartilhamento de tela simples, no estilo do "Go Live" do Discord, sem chat nem servidores. Uma pessoa transmite a tela (com áudio), manda o link, e até 5 pessoas assistem pelo navegador, sem precisar de conta.

- Transmitir: abra o site, digite a senha de transmissão, escolha a tela, janela ou aba.
- Assistir: abra o link `https://seu-dominio/assistir/xxxxxxxx`, digite um nome (opcional) e clique em Assistir.
- Qualidade: 720p a até 60 fps, cerca de 3 Mbps por espectador. Quem tem internet fraca recebe automaticamente uma versão em 360p.
- Só uma transmissão por vez. Se já houver uma no ar, o site pergunta se você quer encerrá-la.

Tudo roda em Docker na Raspberry Pi:

| Serviço | O que faz |
|---|---|
| `caddy` | HTTPS automático (Let's Encrypt) e porta de entrada do site |
| `livekit` | Servidor de vídeo (SFU): recebe a sua tela uma vez e repassa para cada espectador |
| `app` | O site do PeekMe e a geração dos acessos (tokens) |
| `duckdns` | Mantém o seu domínio grátis apontando para o IP da sua casa (opcional) |

## Instalação na Raspberry Pi

### 1. Confira se sua internet aceita conexões de fora (CGNAT)

Muitas operadoras no Brasil usam CGNAT, e com ele ninguém de fora consegue chegar na sua Pi. Para conferir, entre na página do roteador e veja o "IP WAN". Depois abra https://meuip.com.br. Se os dois forem iguais, está tudo certo. Se forem diferentes (ou o IP WAN começar com `100.`), peça à operadora um "IP público" (geralmente é gratuito, basta ligar e pedir).

### 2. Crie um domínio grátis no DuckDNS

1. Entre em https://www.duckdns.org com sua conta Google ou GitHub.
2. Crie um subdomínio, por exemplo `peekme-do-will` (vira `peekme-do-will.duckdns.org`).
3. Copie o **token** que aparece no topo da página.

### 3. Libere as portas no roteador

Na página do roteador, procure "Redirecionamento de portas", "Port forwarding" ou "Servidor virtual" e encaminhe para o IP da Pi (`192.168.1.109`):

| Porta | Protocolo | Para quê |
|---|---|---|
| 443 | TCP | Site, certificado HTTPS e conexão do vídeo |
| 7881 | TCP | Vídeo para quem está em rede que bloqueia UDP |
| 7882 | UDP | Vídeo (caminho principal) |

A porta 80 não é usada: o certificado HTTPS é emitido pela própria 443, e o PeekMe não mexe no nginx que já está na Pi.

Dica: reserve o IP `192.168.1.109` para a Pi no DHCP do roteador, para ele não mudar.

### 4. Instale o Docker (se ainda não tiver)

```sh
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # depois saia e entre de novo no SSH
```

### 5. Configure e suba o PeekMe

Copie esta pasta para a Pi (por exemplo com `git clone`) e, dentro dela:

```sh
sh setup.sh                 # pergunta o subdomínio, o token do DuckDNS e a senha
docker compose up -d --build
```

Espere um minuto (o Caddy pega o certificado HTTPS na primeira vez) e abra `https://seu-subdominio.duckdns.org`.

Para ver se está tudo rodando: `docker compose ps`. Para ver os registros: `docker compose logs -f`.

## Uso

- **Áudio:** no Chrome e no Edge para Windows, marque "Compartilhar áudio do sistema" ao escolher a tela inteira, ou "Compartilhar áudio da guia" ao escolher uma aba. No macOS e no Linux, o navegador só captura áudio de abas. Ao compartilhar só uma janela, não há áudio.
- **Navegadores:** para transmitir, use Chrome, Edge ou Firefox no computador. Para assistir, qualquer navegador moderno serve, inclusive no celular.
- **Trocar a senha:** edite `HOST_PASSWORD` no arquivo `.env` e rode `docker compose up -d`.
- **Mais ou menos espectadores:** mude `MAX_VIEWERS` no `.env`. Cada espectador usa cerca de 3 Mbps do upload da sua internet; com 22 a 30 Mbps de upload, 5 é um limite seguro.

## Atualizar

```sh
git pull
docker compose pull
docker compose up -d --build
```

## Problemas comuns

- **O site não abre de fora de casa:** confira o CGNAT (passo 1) e a porta 443 (passo 3). Os registros do Caddy mostram se o certificado foi emitido: `docker compose logs caddy`.
- **O site abre, mas o vídeo fica em "Conectando…":** as portas 7881/TCP e 7882/UDP não estão chegando na Pi. Veja `docker compose logs livekit`.
- **Dentro de casa não funciona, mas fora funciona:** alguns roteadores não deixam acessar o próprio IP público de dentro da rede (falta de "NAT loopback"). Teste pelo 4G do celular.
- **Imagem travando para todo mundo:** o upload da sua internet está no limite. Reduza `MAX_VIEWERS` ou feche outros envios (backup na nuvem, torrent etc.).

## Desenvolvimento

O site fica em `app/` (Node, sem framework). Para rodar fora do Docker, com um LiveKit local em `ws://localhost:7880`:

```sh
cd app && npm install
LIVEKIT_API_KEY=peekme LIVEKIT_API_SECRET=<segredo> HOST_PASSWORD=teste \
LIVEKIT_PUBLIC_URL=ws://localhost:7880 node server.js
```
