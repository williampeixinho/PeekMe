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
