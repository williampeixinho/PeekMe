# PeekMe

Compartilhamento de tela simples e auto-hospedado, no estilo do "Go Live" do Discord, mas sem chat, sem servidores e sem contas. Uma pessoa transmite a tela (com áudio), manda um link, e os amigos assistem pelo navegador.

- **Transmitir:** abra o site, digite a senha de transmissão, escolha a tela, janela ou aba.
- **Assistir:** abra o link `https://seu-dominio/assistir/xxxxxxxx`, digite um nome (opcional) e clique em Assistir. Funciona no celular também.
- **Qualidade:** 720p ou 1080p a 60 fps, escolhida na hora de transmitir. Quem tem internet fraca recebe automaticamente uma versão menor.
- **Áudio:** jogos e vídeos com som (veja [Navegadores e áudio](#navegadores-e-áudio)).
- **Várias telas na mesma sala.** Quem assiste também pode clicar em **Transmitir minha tela** (sem senha). Com mais de uma tela no ar, cada pessoa escolhe qual ver em destaque ou vê todas em grade. O limite padrão é 3 telas ao mesmo tempo (`MAX_SCREENS`).
- **Uma sala por vez.** Quem tem a senha cria a sala; se já houver uma no ar, o site pergunta se você quer encerrá-la. Quando quem criou a sala para, ela fecha para todos.
- Roda inteiro em Docker num servidor Linux, inclusive numa Raspberry Pi. Transmitir e assistir funciona em qualquer sistema, inclusive Windows (veja os [Requisitos](#requisitos)).

> Licença MIT. Use, modifique e compartilhe à vontade.

---

## Requisitos

O PeekMe tem dois lados: o **servidor**, que fica ligado e repassa o vídeo, e os **navegadores** de quem transmite e de quem assiste.

### Servidor (onde o PeekMe é instalado)

| Item | Mínimo |
|---|---|
| Sistema | **Linux 64 bits** (Raspberry Pi OS 64-bit, Ubuntu, Debian etc.) |
| Máquina | Raspberry Pi 4/5, mini PC, PC antigo ou VPS (`x86_64` ou `arm64`) |
| Memória e disco | 1 GB de RAM livre e 3 GB de disco |
| Software | Docker com Docker Compose v2 (o instalador com IA instala se faltar) |
| Internet | **Upload** de ~3 Mbps por espectador em 720p ou ~5 Mbps em 1080p (5 pessoas: 15 a 25 Mbps) |
| Domínio | Grátis ([DuckDNS](https://www.duckdns.org)) ou próprio. HTTPS é obrigatório para compartilhar tela |
| Rede | Abrir 3 portas no roteador **ou**, sem isso (CGNAT, Starlink, 4G), uma conta grátis no Cloudflare |
| Funcionamento | Ligado 24 h (ou pelo menos enquanto houver transmissão) |

### Quem transmite e quem assiste

- **Transmitir:** um computador com Chrome, Edge, Brave ou Firefox. Windows dá o melhor resultado (áudio do sistema inteiro). Veja [Navegadores e áudio](#navegadores-e-áudio).
- **Assistir:** qualquer navegador moderno, no computador ou no celular. Não precisa instalar nada nem criar conta.

### Dá para instalar no Windows?

| Uso | Windows |
|---|---|
| **Transmitir e assistir** | ✅ Sim, é o melhor sistema para transmitir (áudio do sistema completo no Chrome/Edge) |
| **Servidor** | ❌ Não é suportado. O vídeo usa a rede do host (`network_mode: host`), que não funciona direito no Docker Desktop do Windows nem do macOS |

Se você só tem um PC com Windows, as opções são:
- **Usar outra máquina como servidor:** uma Raspberry Pi, um PC velho com Linux ou um VPS (há opções grátis, como o Oracle Cloud Free Tier). Você continua transmitindo do Windows normalmente.
- **WSL2 com rede espelhada (experimental, não testado):** no Windows 11 22H2 ou mais novo, o WSL2 com `networkingMode=mirrored` compartilha a rede do Windows. Instalar o Docker *dentro* do Ubuntu no WSL2 (não o Docker Desktop) e seguir a instalação como se fosse Linux pode funcionar, mas o PC precisa ficar ligado durante as transmissões. Se testar, conte como foi nas [Discussões](https://github.com/williampeixinho/PeekMe/discussions).

---

## Instalação com IA: cole um prompt

Não precisa seguir passo a passo nenhum. Abra um agente de IA no terminal do servidor (Raspberry Pi, PC ou VPS, direto ou por SSH), cole o prompt abaixo e responda às perguntas. Ele instala e configura tudo sozinho.

Funciona com o [Claude Code](https://claude.com/claude-code) ou com o [Codex](https://github.com/openai/codex):

```sh
# Claude Code
curl -fsSL https://claude.ai/install.sh | bash && claude

# ou Codex (precisa do Node.js)
npm install -g @openai/codex && codex
```

**Prompt** (copie e cole):

```text
Instale o PeekMe neste servidor. Clone https://github.com/williampeixinho/PeekMe.git
em ~/peekme (se já existir, rode git pull) e siga à risca o roteiro em
docs/INSTALAR-COM-IA.md. Fale comigo em português.
```

O roteiro guia o agente em fases: verifica o servidor e as portas, descobre sozinho se a sua internet tem CGNAT, pergunta uma coisa por vez (sempre com uma recomendação), cria a configuração sem mostrar os seus segredos, sobe tudo, confere os registros e termina com um teste real pelo 4G do celular. Ele também serve para atualizar uma instalação existente.

O agente pede autorização antes de rodar cada comando, então você acompanha tudo. Criar a conta no DuckDNS ou no Cloudflare e abrir portas no roteador ainda é com você, no navegador, mas ele explica onde clicar.

Prefere fazer à mão? Siga a [instalação manual](#instalação-manual-passo-a-passo).

---

## Sumário

1. [Como funciona](#como-funciona)
2. [Escolha o seu cenário](#escolha-o-seu-cenário)
3. [Instalação manual (passo a passo)](#instalação-manual-passo-a-passo)
   - [Passo comum: Docker e o projeto](#passo-comum-docker-e-o-projeto)
   - [Cenário A: com porta aberta no roteador](#cenário-a-com-porta-aberta-no-roteador)
   - [Cenário B: sem porta aberta (CGNAT, Starlink, 4G)](#cenário-b-sem-porta-aberta-cgnat-starlink-4g)
   - [Cenário C: num servidor na nuvem (VPS)](#cenário-c-num-servidor-na-nuvem-vps)
4. [Todas as configurações do .env](#todas-as-configurações-do-env)
5. [Navegadores e áudio](#navegadores-e-áudio)
6. [Uso no dia a dia](#uso-no-dia-a-dia)
7. [Atualizar](#atualizar)
8. [Problemas comuns](#problemas-comuns)
9. [Segurança](#segurança)
10. [Desenvolvimento](#desenvolvimento)
11. [Comentários, sugestões e contribuições](#comentários-sugestões-e-contribuições)

---

## Como funciona

```
 Quem transmite                         Seu servidor (Docker)                    Quem assiste
 (navegador)                                                                     (navegador)
      │   site + senha (HTTPS)   ┌──────────────────────────────┐   site (HTTPS)       │
      ├─────────────────────────►│ caddy ──► app (site, tokens) │◄─────────────────────┤
      │                          │                │             │                      │
      │   vídeo e áudio (WebRTC) │             livekit          │  vídeo e áudio       │
      └─────────────────────────►│  (recebe 1 vez, repassa     ├──────────────────────►│
                                 │   para cada espectador)      │                      │
                                 └──────────────────────────────┘
```

| Serviço | O que faz |
|---|---|
| `caddy` | HTTPS automático (Let's Encrypt) na porta 443 |
| `livekit` | Servidor de vídeo ([LiveKit](https://livekit.io), um SFU): recebe a sua tela uma vez e repassa para cada espectador |
| `app` | O site do PeekMe (Node.js) e a geração dos acessos (tokens) |
| `duckdns` | Opcional: mantém um domínio grátis apontando para o IP da sua casa |
| `cloudflared` | Opcional: Cloudflare Tunnel, para publicar o site sem abrir portas |

Importante: o **site** (páginas e sinalização) e o **vídeo** são caminhos diferentes. O site pode passar por um proxy ou túnel, mas o vídeo vai direto entre o navegador e o LiveKit (ou por um servidor TURN quando a conexão direta não é possível).

---

## Escolha o seu cenário

O que decide o caminho é se dá para **abrir portas no seu roteador**.

1. Entre na página do roteador e anote o "IP WAN" (ou "IP da Internet").
2. Abra https://meuip.com.br e compare.

| Resultado | Cenário |
|---|---|
| Os dois IPs são iguais | **A**: abra as portas no roteador. É o caminho mais simples e mais rápido. |
| São diferentes, ou o IP WAN começa com `100.`, `10.` ou `192.168.` (CGNAT). Comum em Starlink, internet via rádio, 4G/5G e algumas fibras | **B**: Cloudflare Tunnel para o site e Cloudflare TURN para o vídeo. Ou peça à operadora um "IP público" (muitas fazem de graça) e use o A. |
| Vai rodar num servidor alugado na nuvem | **C** |

---

## Instalação manual (passo a passo)

### Passo comum: Docker e o projeto

Faça isto em qualquer cenário, na máquina que vai ser o servidor.

**1. Instale o Docker** (se ainda não tiver):

```sh
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# saia e entre de novo no terminal (ou no SSH) para valer
docker compose version   # deve mostrar a versão do Compose v2
```

**2. Baixe o PeekMe:**

```sh
git clone https://github.com/williampeixinho/PeekMe.git peekme
cd peekme
```

**3. Dê um IP fixo ao servidor na sua rede.** No roteador, procure "Reserva de DHCP" / "IP estático" e reserve o IP atual da máquina (veja com `hostname -I`). Nos exemplos abaixo, o IP do servidor na rede local aparece como `IP-DO-SERVIDOR` (algo como `192.168.0.50`).

Agora siga o seu cenário.

---

### Cenário A: com porta aberta no roteador

**A1. Crie um domínio grátis no DuckDNS** (pule se já tiver um domínio apontando para a sua casa)

1. Entre em https://www.duckdns.org com sua conta Google ou GitHub.
2. Crie um subdomínio, por exemplo `meu-peekme` (vira `meu-peekme.duckdns.org`).
3. Copie o **token** que aparece no topo da página. Ele é secreto.

**A2. Abra (redirecione) as portas no roteador**

Na página do roteador, procure "Redirecionamento de portas", "Port forwarding", "NAT" ou "Servidor virtual" e encaminhe para o `IP-DO-SERVIDOR`:

| Porta | Protocolo | Para quê |
|---|---|---|
| 443 | TCP | Site, certificado HTTPS e sinalização do vídeo |
| 7881 | TCP | Vídeo para quem está numa rede que bloqueia UDP |
| 7882 | UDP | Vídeo (caminho principal) |

A porta 80 **não** é usada: o certificado HTTPS é emitido pela própria 443. Se você já tem outro site na porta 80 da máquina, ele continua funcionando.

**A3. Configure**

```sh
sh setup.sh
```

O script pergunta o subdomínio do DuckDNS (ou o domínio completo, se for outro), o token do DuckDNS e a senha de transmissão, e cria o arquivo `.env` com um segredo aleatório para o LiveKit. Se preferir fazer à mão: `cp .env.example .env` e edite (veja [as configurações](#todas-as-configurações-do-env)).

**A4. Suba**

```sh
docker compose up -d --build
```

Espere um ou dois minutos (o Caddy pega o certificado HTTPS na primeira vez) e abra `https://seu-dominio`. Pronto!

Conferir: `docker compose ps` (tudo "running") e `docker compose logs -f` (registros; Ctrl+C para sair).

---

### Cenário B: sem porta aberta (CGNAT, Starlink, 4G)

Sem portas abertas, ninguém de fora consegue chegar no seu servidor diretamente. A solução usa dois serviços gratuitos do Cloudflare:

- **Cloudflare Tunnel** leva o **site** até você (o servidor abre a conexão para fora, então não precisa de porta).
- **Cloudflare TURN** leva o **vídeo**: o navegador de quem assiste e o seu servidor se encontram num servidor do Cloudflare. O plano grátis inclui 1.000 GB por mês.

Você precisa de uma conta grátis no [Cloudflare](https://dash.cloudflare.com) e de um domínio gerenciado por ele (dá para comprar um barato no próprio Cloudflare ou transferir o DNS de um domínio que você já tem).

**B1. Crie o túnel**

1. No painel do Cloudflare: **Zero Trust → Networks → Tunnels → Create a tunnel** → tipo **Cloudflared**. Dê um nome (ex.: `peekme`).
2. Na tela de instalação, escolha **Docker** e copie só o **token** (o texto longo depois de `--token`).
3. Em **Public Hostname**, adicione:
   - Subdomain: `peekme` (ou o que quiser), Domain: o seu domínio
   - Service: **HTTP**, URL: `localhost:3077`
4. Salve.

O site do PeekMe repassa a sinalização do vídeo (`/rtc`) para o LiveKit, então tudo passa por esse único endereço. O Caddy não é usado neste cenário.

> Já usa o `cloudflared` instalado direto no sistema? Também serve: aponte o hostname para `http://localhost:3077` (ou `http://IP-DO-SERVIDOR:3077` se o túnel roda em outra máquina) e não preencha `CLOUDFLARE_TUNNEL_TOKEN`.

**B2. Crie a chave TURN**

1. No painel do Cloudflare: **Realtime → TURN Server → Create** (ou "Create TURN key"). Dê um nome (ex.: `PeekMe`).
2. Copie o **Turn Token ID** e o **API Token**. O API Token só aparece uma vez. Guarde num lugar seguro e nunca cole em lugares públicos.

**B3. Configure**

```sh
cp .env.example .env
nano .env
```

Preencha:

```ini
DOMAIN=peekme.seu-dominio.com
HOST_PASSWORD=uma-senha-boa
LIVEKIT_API_SECRET=   # cole o resultado de: openssl rand -hex 32
COMPOSE_PROFILES=tunnel
CLOUDFLARE_TUNNEL_TOKEN=<token do passo B1>
CF_TURN_KEY_ID=<Turn Token ID>
CF_TURN_API_TOKEN=<API Token>
```

Proteja o arquivo: `chmod 600 .env`.

**B4. Suba** (sem o Caddy, que aqui não é necessário):

```sh
docker compose up -d --build app livekit cloudflared
```

Abra `https://peekme.seu-dominio.com`. Quem está na sua rede ou tem IPv6 conecta direto; os demais passam pelo TURN automaticamente.

---

### Cenário C: num servidor na nuvem (VPS)

Funciona igual ao cenário A, só que sem roteador:

1. Aponte o seu domínio (registro `A`) para o IP do VPS. Se não tiver domínio, use o DuckDNS (passo A1).
2. Libere no **firewall do provedor** (Security Group, Security List etc.) e no da máquina (`ufw`, se usar): `443/tcp`, `7881/tcp`, `7882/udp`.
3. Siga A3 e A4.

Opções baratas ou grátis: Oracle Cloud Free Tier (ARM), Hetzner, Contabo. Atenção à franquia de tráfego do plano: 1 hora em 720p para 5 pessoas usa uns 7 GB.

---

## Todas as configurações do .env

O arquivo `.env` fica na pasta do projeto e **nunca** deve ir para o git (já está no `.gitignore`). Depois de mudar algo, rode `docker compose up -d` de novo.

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `DOMAIN` | sim | Domínio do site, sem `https://` |
| `HOST_PASSWORD` | sim | Senha para transmitir. Quem assiste não precisa |
| `LIVEKIT_API_KEY` | sim | Nome da chave do LiveKit (pode ficar `peekme`) |
| `LIVEKIT_API_SECRET` | sim | Segredo do LiveKit, 32+ caracteres. Gere com `openssl rand -hex 32` |
| `MAX_VIEWERS` | não | Máximo de espectadores (padrão 5) |
| `MAX_SCREENS` | não | Máximo de telas no ar ao mesmo tempo, contando a de quem criou a sala (padrão 3). `1` = só quem tem a senha transmite |
| `APP_PORT` | não | Porta interna do site (padrão 3077) |
| `NODE_IP` | não | IP público fixo. Vazio = descobre sozinho ao iniciar |
| `CADDY_HTTP_PORT` | não | Porta HTTP interna do Caddy (padrão 8780, não precisa abrir) |
| `TZ` | não | Fuso horário dos registros |
| `COMPOSE_PROFILES` | não | Serviços extras: `duckdns`, `tunnel` ou `duckdns,tunnel` |
| `DUCKDNS_SUBDOMAIN` / `DUCKDNS_TOKEN` | com `duckdns` | Seu subdomínio e token do DuckDNS |
| `CLOUDFLARE_TUNNEL_TOKEN` | com `tunnel` | Token do Cloudflare Tunnel |
| `CF_TURN_KEY_ID` / `CF_TURN_API_TOKEN` | não | Chave TURN do Cloudflare (necessária no cenário B) |

O modelo comentado está em [`.env.example`](.env.example).

---

## Navegadores e áudio

Para **assistir**, qualquer navegador moderno serve, inclusive no celular. Para **transmitir**, use um computador. O áudio depende do navegador e do sistema:

| Sistema | Navegador | O que dá para transmitir com som |
|---|---|---|
| Windows | Chrome, Edge, Brave, Opera | Tela inteira com **som do sistema todo** (marque "Compartilhar áudio do sistema") ou uma aba com o som da aba |
| macOS | Chrome, Edge | Só o som de **abas** (marque "Compartilhar áudio da guia"). Tela inteira e janelas vão sem som |
| Linux | Chrome, Chromium, Edge | Som de abas. Para o som do sistema, use o truque do Firefox abaixo |
| Linux | Firefox | O Firefox não envia o som junto com a tela. O PeekMe pede então uma **entrada de áudio**: escolha **"Monitor of …"** (o monitor da sua saída de som) e o som do computador vai junto |
| Windows | Firefox | Mesmo esquema: escolha "Mixagem estéreo" / "Stereo Mix" (ative em Configurações de som → Mais configurações de som → Gravação) ou um cabo virtual como o VB-Cable |
| Qualquer | Safari | Transmite sem áudio |

Dicas:
- Compartilhar uma **janela** (em vez da tela inteira ou de uma aba) normalmente vai **sem som** no Chrome/Edge.
- Se o navegador de quem assiste bloquear o som automático, aparece um botão para ativar o áudio.
- Se a transmissão estiver sem som, o PeekMe avisa tanto quem transmite quanto quem assiste.
- A entrada de áudio é usada só no Firefox. Nos outros navegadores, se a tela vier sem som, o PeekMe apenas avisa, para nunca transmitir o seu microfone por engano.

---

## Uso no dia a dia

- **Trocar a senha:** edite `HOST_PASSWORD` no `.env` e rode `docker compose up -d`.
- **Mais ou menos espectadores:** mude `MAX_VIEWERS`. Faça a conta com o seu upload (tabela em [Requisitos](#requisitos)).
- **Espectadores transmitindo:** quem assiste pelo computador vê o botão **Transmitir minha tela** enquanto houver vaga (`MAX_SCREENS`). Cada tela é enviada pelo servidor a quem estiver vendo, então mais telas pesam no upload. Para poupar internet, quem assiste só recebe o vídeo das telas que aparecem na página: com uma tela em destaque, as outras não chegam; na grade, cada uma vem numa versão menor. Para desligar, use `MAX_SCREENS=1`.
- **Encerrar:** clique em Parar no site. Se a aba for fechada, a sala some sozinha em cerca de um minuto.
- **Parar o servidor:** `docker compose down`. Para ligar de novo: `docker compose up -d` (no cenário B, liste os serviços como no passo B4).

---

## Atualizar

O PeekMe usa [versionamento semântico](https://semver.org/lang/pt-BR/) (`MAIOR.MENOR.CORREÇÃO`). As novidades de cada versão ficam no [CHANGELOG](CHANGELOG.md) e nas [Releases](https://github.com/williampeixinho/PeekMe/releases). Uma versão MAIOR nova pode exigir mudanças no `.env`: leia o CHANGELOG antes.

Para atualizar para a versão mais recente:

```sh
cd peekme
git pull
docker compose pull
docker compose up -d --build            # cenário A/C
# ou: docker compose up -d --build app livekit cloudflared   (cenário B)
```

Para ficar numa versão fixa (ex.: `v1.0.0`), troque o `git pull` por:

```sh
git fetch --tags
git checkout v1.0.0
```

Para ver qual versão está rodando: `curl -s http://localhost:3077/healthz`.

---

## Problemas comuns

**O site não abre de fora de casa (cenário A)**
Confira o CGNAT ([Escolha o seu cenário](#escolha-o-seu-cenário)) e o redirecionamento da porta 443. Veja se o certificado foi emitido: `docker compose logs caddy`.

**O site abre, mas o vídeo fica em "Conectando…"**
- Cenário A/C: as portas `7881/tcp` e `7882/udp` não estão chegando ao servidor. Confira o roteador / firewall e `docker compose logs livekit`.
- Cenário B: confira se `CF_TURN_KEY_ID` e `CF_TURN_API_TOKEN` estão certos. Se estiverem errados, `docker compose logs app` mostra "Não foi possível obter o TURN do Cloudflare".

**Funciona fora de casa, mas não dentro (ou o contrário)**
Alguns roteadores não deixam acessar o próprio IP público de dentro da rede (falta de "NAT loopback"). Teste pelo 4G do celular. O LiveKit também anuncia o IP local, então quem está em casa normalmente conecta direto.

**Erro "Não consegui descobrir o IP público" nos registros do LiveKit**
O servidor não conseguiu acessar `api.ipify.org`. Defina `NODE_IP` no `.env` com o seu IP público.

**"Para compartilhar a tela, abra o PeekMe pelo endereço com https://"**
Compartilhar tela exige HTTPS. Abra sempre por `https://seu-dominio`, nunca pelo IP.

**Imagem travando para todo mundo**
O seu upload está no limite. Use 720p, reduza `MAX_VIEWERS` ou pause outros envios (backup na nuvem, torrent etc.).

**Mudei o site e o navegador mostra a versão antiga (Cloudflare)**
No Cloudflare, em **Caching → Configuration → Browser Cache TTL**, escolha **Respect Existing Headers**.

**Porta já em uso**
O PeekMe usa a rede do host. Se a 3077 ou a 8780 já estiverem ocupadas, mude `APP_PORT` ou `CADDY_HTTP_PORT`. As portas 443, 7880, 7881 e 7882 precisam estar livres.

---

## Segurança

- **Nunca publique o `.env`** (nem prints dele). Ele tem a senha de transmissão, o segredo do LiveKit e as chaves do Cloudflare/DuckDNS. Se algum vazar, gere outro e apague o antigo no painel correspondente.
- Use uma senha de transmissão forte. O site bloqueia por 1 minuto quem erra a senha 5 vezes seguidas.
- Os links de assistir são aleatórios e só funcionam enquanto a transmissão está no ar. Qualquer pessoa com o link pode assistir, então compartilhe só com quem você quer.
- Achou uma falha de segurança? Relate em privado, como explicado em [SECURITY.md](SECURITY.md).

---

## Desenvolvimento

O site fica em `app/` (Node.js 20+, sem framework):

- `app/server.js`: servidor HTTP, senha, tokens do LiveKit, TURN do Cloudflare e o repasse de `/rtc`.
- `app/public/`: a página (`index.html`, `app.js`, `style.css`), usando o [livekit-client](https://github.com/livekit/client-sdk-js).

Para rodar fora do Docker, suba um LiveKit local em modo de desenvolvimento e o site:

```sh
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server:v1.13 --dev
cd app && npm install
LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret HOST_PASSWORD=teste node server.js
```

Abra http://localhost:3077 (o navegador permite compartilhar tela em `localhost` sem HTTPS).

## Comentários, sugestões e contribuições

- 💬 **Dúvidas, comentários e ideias:** [Discussões](https://github.com/williampeixinho/PeekMe/discussions)
- 🐞 **Algo não funciona:** [abra uma issue de Problema](https://github.com/williampeixinho/PeekMe/issues/new/choose)
- 💡 **Sugestão de recurso:** [abra uma issue de Sugestão](https://github.com/williampeixinho/PeekMe/issues/new/choose)
- 🛠️ **Quer mandar código?** Leia o [guia de contribuição](CONTRIBUTING.md).

Se o PeekMe te ajudou, deixe uma ⭐ no repositório!

## Licença

[MIT](LICENSE)
