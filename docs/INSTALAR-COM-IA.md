# Roteiro de instalação para agentes de IA

Este arquivo é para um agente de IA (Claude Code, Codex ou similar) que vai instalar o PeekMe no servidor de uma pessoa. Humanos: vejam o [README](../README.md).

Siga as fases **na ordem**. Não pule a verificação no fim de cada fase. Use o `README.md` como referência técnica; este roteiro diz **como conduzir** a instalação.

---

## Regras de conduta

1. **Idioma e tom:** fale em português do Brasil, frases curtas, sem jargão. Quando usar um termo técnico (CGNAT, DNS, porta), explique em meia frase.
2. **Uma pergunta por vez.** Espere a resposta antes de seguir. Sempre ofereça a opção recomendada ("Recomendo X. Pode ser?").
3. **Antes de cada fase**, diga em uma linha o que vai fazer. **No fim de cada fase**, diga em uma linha o que deu certo.
4. **Segredos** (senha de transmissão, tokens, chaves):
   - Nunca mostre, repita, registre em log nem envie para fora do servidor o conteúdo do `.env` ou de um segredo.
   - Para ler o `.env`, só confira se uma variável está preenchida: `grep -c '^HOST_PASSWORD=.\+' .env`.
   - Ofereça sempre duas formas de entregar um segredo: colar no chat, ou a pessoa mesma editar com `nano ~/peekme/.env` (explique: setas para mover, Ctrl+O e Enter para salvar, Ctrl+X para sair).
5. **Não quebre o que já existe.** Não pare, remova nem reconfigure containers, sites, serviços, firewall ou nginx que não sejam do PeekMe. Se algo do PeekMe conflitar com o que já existe, pare e pergunte.
6. **`sudo`:** antes do primeiro comando com `sudo`, avise que ele pode pedir a senha do usuário do servidor e que ela é digitada no terminal, nunca no chat.
7. **Erros:** se um comando falhar, leia a mensagem, consulte "Problemas comuns" no README, tente **uma** correção e explique o que fez. Se falhar de novo, pare e explique o problema em linguagem simples, com o que a pessoa pode fazer.
8. **Não invente.** Se não souber algo da rede ou da conta da pessoa (IP do roteador, se tem domínio), pergunte.

---

## Fase 0: Boas-vindas

Diga, em até 4 linhas:
- que vai instalar o PeekMe (compartilhamento de tela estilo "Go Live" do Discord) neste servidor;
- que leva de 10 a 30 minutos;
- que talvez precise que a pessoa faça algo no navegador (roteador, DuckDNS ou Cloudflare), e que você explica onde clicar;
- que ela pode parar a qualquer momento.

---

## Fase 1: Verificar o servidor

Rode e interprete (não despeje a saída crua para a pessoa; resuma):

```sh
uname -sm; cat /etc/os-release 2>/dev/null | head -3
free -h | head -2; df -h ~ | tail -1
docker --version; docker compose version
```

| Situação | O que fazer |
|---|---|
| macOS ou Windows (fora do WSL) | Explique que o servidor do PeekMe precisa de Linux ligado 24 h (Raspberry Pi, PC com Linux ou VPS) porque o vídeo usa a rede do host, que não funciona bem no Docker Desktop. Transmitir do Windows/macOS continua funcionando. Pare aqui. |
| WSL2 no Windows (`uname -r` contém `microsoft`) | Rode `wslinfo --networking-mode`. Se não for `mirrored`, explique como ativar (arquivo `%UserProfile%\.wslconfig` com `[wsl2]` e `networkingMode=mirrored`, depois `wsl --shutdown`) e pare. Se for `mirrored`, avise que é **experimental e não testado**, que o PC precisa ficar ligado nas transmissões e que o Docker deve ser o do Linux dentro do WSL (não o Docker Desktop). Siga só se a pessoa concordar. |
| Arquitetura diferente de `x86_64`/`aarch64` (ex.: `armv7l`, Pi com sistema 32 bits) | Explique que precisa de um sistema 64 bits (Raspberry Pi OS 64-bit). Pare aqui. |
| Menos de 1 GB de RAM livre ou 3 GB de disco | Avise do risco e pergunte se quer seguir. |
| Docker ausente | Peça permissão e instale: `curl -fsSL https://get.docker.com \| sh` e `sudo usermod -aG docker $USER`. Depois disso, use `sudo docker ...` nesta sessão (o grupo só vale num novo login) e avise que no próximo login não precisa mais de `sudo`. |
| Docker sem `docker compose` (v2) | Instale o plugin: `sudo apt-get install -y docker-compose-plugin` (Debian/Ubuntu/Raspberry Pi OS). |

**Portas.** Verifique com `sudo ss -tulpn`:

| Porta | Uso | Se ocupada |
|---|---|---|
| 443/tcp | Caddy (HTTPS) | Só importa nos cenários A e C. Se for outro serviço, pare e pergunte (talvez o cenário B sirva). |
| 7880/tcp, 7881/tcp, 7882/udp | LiveKit | Precisam estar livres. Se ocupadas, pare e explique. |
| 3077/tcp | Site do PeekMe | Escolha outra livre (ex.: 3078) e anote para `APP_PORT`. |
| 8780/tcp | HTTP interno do Caddy | Escolha outra livre e anote para `CADDY_HTTP_PORT`. |

Se a porta estiver ocupada por um container **do próprio PeekMe** (instalação anterior), está tudo bem.

**Verificação:** Docker funcionando (`docker run --rm hello-world` ou `sudo docker ...`) e portas resolvidas.

---

## Fase 2: Baixar o PeekMe

- Se `~/peekme` não existe: `git clone https://github.com/williampeixinho/PeekMe.git ~/peekme` (instale o `git` se faltar).
- Se existe e tem um `.env`: é uma **reinstalação ou atualização**. Pergunte se a pessoa quer (a) só atualizar mantendo a configuração (vá direto para "Atualização", no fim) ou (b) refazer a configuração (faça backup: `cp .env .env.backup-$(date +%F)`).
- Leia `README.md`, `.env.example` e `docker-compose.yml` antes de seguir.

---

## Fase 3: Descobrir o cenário

O cenário depende de **alguém de fora conseguir chegar neste servidor**. Investigue antes de perguntar:

```sh
curl -s https://api.ipify.org; echo          # IP público IPv4
curl -s https://ipinfo.io/org; echo          # operadora (ASN)
curl -s -6 --max-time 5 https://api64.ipify.org; echo   # IPv6 público, se houver
ip route | grep default                      # gateway (roteador)
```

Pistas:
- **Provavelmente VPS (cenário C):** a operadora é um provedor de nuvem (Oracle, Hetzner, AWS, Google, DigitalOcean, Contabo, OVH...) e o IP público aparece direto numa interface (`ip -4 addr`).
- **Provavelmente CGNAT (cenário B):** operadora Starlink (AS14593), operadoras móveis (4G/5G), ou internet via rádio.
- **Caso contrário:** pode ser A ou B. Peça à pessoa para abrir a página do roteador (geralmente `http://` + o IP do gateway acima) e ler o "IP WAN" ou "IP da Internet". Se for igual ao IP público acima, é **A**. Se for diferente, ou começar com `100.`, `10.`, `172.16`–`172.31` ou `192.168.`, é **B**.

Explique a conclusão em uma frase e **recomende**:
- **A** (porta aberta): mais rápido e simples. Precisa redirecionar 3 portas no roteador.
- **B** (CGNAT): Cloudflare Tunnel + Cloudflare TURN. Grátis, mas precisa de conta no Cloudflare e de um domínio gerenciado por ele.
- **C** (VPS): como A, liberando as portas no firewall do provedor.

Mencione que, no B, também dá para pedir um "IP público" à operadora (muitas fazem de graça) e usar o A.

Deixe a pessoa escolher.

---

## Fase 4: Coletar as informações

Pergunte **só** o que o cenário precisa, uma coisa por vez, nesta ordem.

### Todos os cenários

1. **Senha de transmissão.** Explique: só quem transmite digita; quem assiste não precisa. Peça uma senha forte (12+ caracteres). Recuse `troque-esta-senha`, `123456`, `senha` e afins. Ofereça gerar uma: `openssl rand -base64 12`.

### Cenário A ou C: domínio

Pergunte se a pessoa já tem um domínio.

- **Não tem:** guie no DuckDNS:
  1. Abrir https://www.duckdns.org e entrar com Google ou GitHub.
  2. No campo "sub domain", digitar um nome (ex.: `peekme-fulano`) e clicar em "add domain".
  3. Copiar o **token** no topo da página (é secreto).
  Depois: `DOMAIN=<nome>.duckdns.org`, `COMPOSE_PROFILES=duckdns`, `DUCKDNS_SUBDOMAIN=<nome>`, `DUCKDNS_TOKEN=<token>`.
- **Tem:** peça o domínio (ex.: `peekme.exemplo.com`) e explique que ele precisa de um registro DNS do tipo **A** apontando para o IP público (mostre o IP). Se estiver no Cloudflare, o registro deve ficar com a **nuvem cinza** (DNS only), não laranja.

### Cenário B: Cloudflare

Pergunte se a pessoa tem conta no Cloudflare com um domínio. Se não tiver, explique que é necessário (dá para comprar um domínio barato no próprio Cloudflare, em Domain Registration) e espere.

1. **Túnel:**
   1. Painel do Cloudflare → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel** → **Cloudflared**.
   2. Nome: `peekme` → Save.
   3. Na tela de instalação, escolher **Docker** e copiar só o texto longo depois de `--token`. Esse é o `CLOUDFLARE_TUNNEL_TOKEN`.
   4. Avançar para **Public Hostname**: Subdomain `peekme` (ou outro), Domain o da pessoa, Service **HTTP**, URL `localhost:3077` (ou a `APP_PORT` escolhida). Salvar.
   Se a pessoa já usa `cloudflared` instalado no sistema, ela pode só adicionar o Public Hostname no túnel existente; nesse caso não use o perfil `tunnel`.
2. **TURN:**
   1. Painel do Cloudflare → **Realtime** → **TURN Server** → **Create**.
   2. Nome: `PeekMe`.
   3. Copiar o **Turn Token ID** (`CF_TURN_KEY_ID`) e o **API Token** (`CF_TURN_API_TOKEN`). Avise que o API Token só aparece uma vez.
3. `DOMAIN` = o hostname público escolhido (ex.: `peekme.exemplo.com`). `COMPOSE_PROFILES=tunnel`.

### Opcionais (pergunte em uma só mensagem, com os padrões)

- Quantas pessoas no máximo vão assistir? Padrão 5. Explique: cada uma usa ~3 Mbps do **upload** (720p) ou ~5 Mbps (1080p). Se a pessoa souber o upload dela, sugira um número seguro.

---

## Fase 5: Criar o `.env`

```sh
cd ~/peekme
cp .env.example .env
chmod 600 .env
```

Preencha com `sed` ou um pequeno script, **sem imprimir valores**. Sempre:
- `LIVEKIT_API_SECRET=$(openssl rand -hex 32)`
- `HOST_PASSWORD`, `DOMAIN`, `COMPOSE_PROFILES` e os tokens do cenário
- `APP_PORT` / `CADDY_HTTP_PORT` se mudaram na Fase 1
- `MAX_VIEWERS` se diferente de 5

Se a pessoa preferiu digitar algum segredo ela mesma, deixe o campo vazio, peça para editar com `nano ~/peekme/.env` e avise quando terminar.

**Verificação** (sem mostrar valores):

```sh
for v in DOMAIN HOST_PASSWORD LIVEKIT_API_SECRET; do grep -q "^$v=.\+" .env && echo "$v ok" || echo "$v FALTANDO"; done
grep -q '^HOST_PASSWORD=troque-esta-senha$' .env && echo "SENHA DE EXEMPLO"
docker compose config -q && echo "config ok"
```

Repita para os tokens do cenário (`DUCKDNS_TOKEN`, `CLOUDFLARE_TUNNEL_TOKEN`, `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN`).

---

## Fase 6: Subir

| Cenário | Comando |
|---|---|
| A ou C | `docker compose up -d --build` |
| B | `docker compose up -d --build app livekit cloudflared` (ou sem `cloudflared` se a pessoa usa um túnel próprio) |

Avise que a primeira vez baixa imagens e compila o site: alguns minutos, mais numa Raspberry Pi.

---

## Fase 7: Conferir

Rode e interprete:

```sh
docker compose ps
curl -s http://localhost:${APP_PORT:-3077}/healthz; echo
docker compose logs --tail 30 livekit
docker compose logs --tail 30 app
```

Esperado:
- Todos os serviços do cenário `running` (nenhum `restarting`).
- `/healthz` responde `{"ok":true,...}`.
- Log do LiveKit mostra `IP público: <ip>`.
- Log do app mostra `PeekMe ... rodando na porta ...` e **não** mostra "Não foi possível obter o TURN do Cloudflare" (cenário B).

Por cenário:
- **A/C:** `docker compose logs --tail 50 caddy` deve mostrar o certificado obtido (`certificate obtained successfully`). Isso só funciona **depois** de a porta 443 estar aberta (Fase 8) e de o DNS apontar para o IP público; se ainda não estiver, siga para a Fase 8 e volte aqui.
  Teste de fora: `curl -sI https://$DOMAIN | head -1`.
- **B:** `docker compose logs --tail 30 cloudflared` deve mostrar `Registered tunnel connection`. Teste: `curl -s https://$DOMAIN/healthz`.

Se algo falhar, use "Problemas comuns" do README (regra 7 de conduta).

---

## Fase 8: O que a pessoa precisa fazer fora do servidor

Descubra o IP local do servidor com `hostname -I | awk '{print $1}'`.

- **Cenário A:** guie o redirecionamento de portas no roteador, para o IP local acima:

  | Porta | Protocolo |
  |---|---|
  | 443 | TCP |
  | 7881 | TCP |
  | 7882 | UDP |

  Dica de onde fica: "Redirecionamento de portas", "Port forwarding", "NAT" ou "Servidor virtual". Recomende também reservar o IP local do servidor no DHCP do roteador. Depois, volte à Fase 7 para conferir o certificado.
- **Cenário C:** liberar `443/tcp`, `7881/tcp` e `7882/udp` no firewall do provedor (Security Group / Security List) e, se o servidor usar `ufw`, com `sudo ufw allow 443/tcp && sudo ufw allow 7881/tcp && sudo ufw allow 7882/udp` (peça permissão).
- **Cenário B:** nada a abrir.

---

## Fase 9: Teste real e entrega

Peça para a pessoa:
1. Abrir `https://<DOMAIN>` **no computador**, digitar a senha, escolher a qualidade e clicar em Transmitir. Explique o áudio conforme o sistema dela (tabela "Navegadores e áudio" do README).
2. Copiar o link de assistir e abrir **no celular usando 4G/5G, com o Wi-Fi desligado** (testa o acesso de fora).
3. Dizer se o vídeo apareceu e se tem som.

Se o vídeo ficar em "Conectando…", volte à Fase 7 e veja "Problemas comuns".

Ao final, entregue um resumo curto:

```
✅ PeekMe instalado!
Site: https://<DOMAIN>
Transmitir: abra o site e use a sua senha de transmissão.
Assistir: mande o link que aparece ao transmitir (até <MAX_VIEWERS> pessoas).
Configuração: ~/peekme/.env (não compartilhe esse arquivo).
Atualizar: cd ~/peekme && git pull && <COMANDO DA FASE 6 PARA ESTE CENÁRIO>
Ver se está rodando: cd ~/peekme && docker compose ps
```

Troque `<COMANDO DA FASE 6 PARA ESTE CENÁRIO>` pelo comando exato usado na Fase 6 (no cenário B, com a lista de serviços, sem o Caddy). Não inclua a senha no resumo.

---

## Atualização (instalação existente)

```sh
cd ~/peekme
git pull
docker compose pull
```

Compare `.env.example` com o `.env` e avise sobre variáveis novas (sem mostrar valores). Leia o `CHANGELOG.md` desde a versão anterior e resuma as novidades. Suba com o mesmo comando do cenário (Fase 6) e confira (Fase 7).
