# PeekMe para Windows (teste 0.1.0)

Transmissor portátil para Windows feito em Electron. Você escolhe a janela de um aplicativo ou jogo e o PeekMe transmite a imagem e **só o áudio desse aplicativo** (o Discord aberto à parte e o microfone ficam de fora). Quem assiste continua usando o navegador normalmente.

Requisitos: Windows 11 x64 (ou Windows build 20348 ou posterior), por causa da captura de áudio por processo.

## Como gerar o executável

```powershell
cd desktop
npm install
node build-portable.cjs
```

A pasta `desktop/PeekMe-Windows/` sai pronta para usar (cerca de 357 MB). O `PeekMe.exe` dela é o runtime do Electron renomeado; o app fica em `resources/app`, então **mande a pasta inteira** (zipada), não só o `.exe`. A pasta não vai para o git.

Para testar sem gerar a pasta: `npm start`.

## Fluidez da transmissão

Em Qualidade, escolha 720p ou 1080p a **30 ou 60 fps**. Os modos de 30 fps usam menos processamento e menos internet. A escolha fica salva para a próxima transmissão.

O app continua ativo quando fica coberto pelo jogo ou minimizado. A captura fica limitada à resolução e aos FPS da qualidade escolhida e prioriza movimento. O envio prefere H.264 quando o runtime oferece esse formato, permitindo usar o codificador da GPU; sem suporte, usa VP8. A aceleração depende da placa e do driver.

Para medir a captura e o envio com uma janela de animação, sem conectar ao servidor nem capturar o jogo ou o áudio:

```powershell
.\node_modules\.bin\electron.cmd test-video-performance.cjs
# Para medir 720p a 30 fps:
.\node_modules\.bin\electron.cmd test-video-performance.cjs . 720-30
```

O teste usa um perfil temporário e dois participantes WebRTC locais. Mostra os FPS enviados, a resolução e o codificador da faixa principal com a janela coberta e minimizada. Não testa as camadas adaptativas do servidor nem a rede externa. O resultado depende do computador; teste a transmissão do jogo para confirmar a experiência real. O teste não altera o perfil normal do PeekMe.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `main.cjs` | Processo principal: lista as janelas do Windows, restaura a janela escolhida, inicia a captura de áudio e repassa as chamadas para o servidor |
| `preload.cjs` | Ponte segura entre a página e o processo principal |
| `capture-worker.cjs` | Captura o áudio só do processo escolhido (e filhos), com `loopback-capture` |
| `app/` | A interface do site adaptada para o app (já preparada; `desktop.js` e `pcm-worklet.js` são exclusivos do app) |
| `prepare.cjs`, `add-preview.cjs` | Scripts usados uma vez para adaptar a interface do site. Já foram aplicados em `app/`; não rode de novo sobre ela |
| `test-audio-isolation.cjs`, `test-tone.ps1`, `fixture.html` | Teste de isolamento do áudio com dois tons e uma janela sintética |
| `COMO-USAR.txt` | Instruções que vão junto com a pasta |

## Observações

- O servidor está fixo em `main.cjs`, `preload.cjs` e na política de segurança de `app/index.html` (`https://peekme.devpeixinho.uk`). Troque nos três para usar outro domínio.
- A lista de aplicativos vem do próprio Windows, porque o Electron não mostra janelas minimizadas (jogos em tela cheia minimizam no Alt+Tab). Ao escolher uma janela minimizada, ela é restaurada para poder ser capturada.
- O executável não é assinado e ainda usa o ícone do Electron, então o Windows pode mostrar um alerta do SmartScreen.
