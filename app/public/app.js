// PeekMe no navegador: transmitir ou assistir uma tela via LiveKit.
const { Room, RoomEvent, Track, VideoPreset, AudioPresets, ConnectionQuality } = LivekitClient;

const $ = id => document.getElementById(id);
const views = ['home', 'host', 'join', 'watch', 'ended'];
function show(name) {
  for (const v of views) $(`view-${v}`).hidden = v !== name;
  $('live-badge').hidden = !(name === 'host' || name === 'watch');
}

// Por padrão o LiveKit fica no mesmo domínio do site (o Caddy encaminha /rtc).
function livekitUrl(url) {
  if (url) return url;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
}

// Servidores TURN extras (Cloudflare), quando o servidor fornece.
function connectOptions(session) {
  return session.iceServers?.length ? { rtcConfig: { iceServers: session.iceServers } } : {};
}

async function api(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Algo deu errado.'), { status: res.status });
  return data;
}

function ended(title, text) {
  $('ended-title').textContent = title;
  $('ended-text').textContent = text;
  show('ended');
  document.title = 'PeekMe';
}

// ---------- Transmitir ----------

// Qualidades que quem transmite pode escolher. O upload da Pi é o limite:
// com 5 espectadores, 720p usa ~15 Mbps e 1080p ~25 Mbps.
// As camadas menores servem quem tem internet fraca.
const QUALITIES = {
  '720': {
    resolution: { width: 1280, height: 720, frameRate: 60 },
    encoding: { maxBitrate: 3_000_000, maxFramerate: 60 },
    layers: [new VideoPreset(640, 360, 600_000, 30)],
  },
  '1080': {
    resolution: { width: 1920, height: 1080, frameRate: 60 },
    encoding: { maxBitrate: 5_000_000, maxFramerate: 60 },
    layers: [new VideoPreset(640, 360, 600_000, 30), new VideoPreset(1280, 720, 2_500_000, 60)],
  },
};
const SCREEN_CAPTURE = {
  contentHint: 'motion',
  selfBrowserSurface: 'exclude',
  surfaceSwitching: 'include',
  systemAudio: 'include',
};
const SCREEN_PUBLISH = {
  videoCodec: 'vp8',
  simulcast: true,
  degradationPreference: 'maintain-framerate',
  audioPreset: AudioPresets.musicHighQualityStereo,
  dtx: false,
  red: true,
  forceStereo: true,
};

let host = null; // { room, code, hostSecret }

async function startStream(force = false) {
  const btn = $('start-form').querySelector('button');
  $('start-error').textContent = '';
  btn.disabled = true;
  let session;
  try {
    session = await api('/api/start', { password: $('password').value, force });
  } catch (err) {
    btn.disabled = false;
    if (err.status === 409 && confirm(`${err.message}\n\nEncerrar a transmissão anterior e começar uma nova?`)) return startStream(true);
    $('start-error').textContent = err.message;
    return;
  }

  const room = new Room({ adaptiveStream: false, dynacast: true });
  host = { room, code: session.room, hostSecret: session.hostSecret };
  try {
    await room.connect(livekitUrl(session.url), session.token, connectOptions(session));
    const audio = $('audio').checked && { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    const q = QUALITIES[$('quality-select').value] || QUALITIES['720'];
    try { localStorage.setItem('peekme-quality', $('quality-select').value); } catch {}
    await room.localParticipant.setScreenShareEnabled(
      true,
      { ...SCREEN_CAPTURE, resolution: q.resolution, audio },
      { ...SCREEN_PUBLISH, screenShareEncoding: q.encoding, screenShareSimulcastLayers: q.layers },
    );
  } catch (err) {
    console.error(err);
    await stopStream(true);
    btn.disabled = false;
    $('start-error').textContent = err.name === 'NotAllowedError'
      ? 'Você cancelou a escolha da tela.'
      : 'Não foi possível iniciar a transmissão. Veja se o navegador permite compartilhar a tela.';
    return;
  }
  btn.disabled = false;

  const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
  $('preview').srcObject = new MediaStream([pub.track.mediaStreamTrack]);
  // O usuário clicou em "Parar de compartilhar" na barra do navegador.
  pub.track.on('ended', () => stopStream());
  // Avisa quando o navegador não entregou o áudio (janela, Firefox ou caixa desmarcada).
  $('host-audio').hidden = !!room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);

  const link = `${location.origin}/assistir/${session.room}`;
  $('share-link').value = link;
  $('viewer-max').textContent = session.maxViewers;
  updateViewers();
  room.on(RoomEvent.ParticipantConnected, updateViewers)
    .on(RoomEvent.ParticipantDisconnected, updateViewers)
    .on(RoomEvent.Reconnecting, () => { $('host-status').textContent = 'Conexão instável, reconectando…'; })
    .on(RoomEvent.Reconnected, () => { $('host-status').textContent = ''; })
    .on(RoomEvent.Disconnected, () => { if (host) { host = null; ended('Transmissão encerrada', 'A conexão com o servidor caiu.'); } });

  history.replaceState(null, '', '/');
  document.title = '🔴 Ao vivo · PeekMe';
  show('host');
}

function updateViewers() {
  if (!host) return;
  const viewers = [...host.room.remoteParticipants.values()];
  $('viewer-count').textContent = viewers.length;
  $('viewer-list').replaceChildren(...viewers.map(p => {
    const li = document.createElement('li');
    li.textContent = p.name || 'Alguém';
    return li;
  }));
}

async function stopStream(silent = false) {
  if (!host) return;
  const { room, code, hostSecret } = host;
  host = null;
  $('preview').srcObject = null;
  await api('/api/stop', { room: code, hostSecret }).catch(() => {});
  await room.disconnect();
  if (!silent) ended('Transmissão encerrada', 'Você parou de compartilhar a tela.');
}

$('start-form').addEventListener('submit', e => { e.preventDefault(); startStream(); });
$('stop').addEventListener('click', () => stopStream());
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('share-link').value);
  } catch {
    $('share-link').select();
    document.execCommand('copy');
  }
  $('copy').textContent = 'Copiado!';
  setTimeout(() => { $('copy').textContent = 'Copiar'; }, 1500);
});
window.addEventListener('beforeunload', e => { if (host) e.preventDefault(); });
window.addEventListener('pagehide', () => {
  if (host) navigator.sendBeacon('/api/stop', new Blob([JSON.stringify({ room: host.code, hostSecret: host.hostSecret })], { type: 'application/json' }));
});

// ---------- Assistir ----------

let viewer = null;
const screenEl = $('screen');
const audioEl = new Audio();

async function watch(code) {
  const btn = $('join-form').querySelector('button');
  $('join-error').textContent = '';
  btn.disabled = true;
  let session;
  try {
    session = await api('/api/watch', { room: code, name: $('name').value });
  } catch (err) {
    btn.disabled = false;
    $('join-error').textContent = err.message;
    return;
  }
  try { localStorage.setItem('peekme-name', $('name').value); } catch {}

  const room = new Room({ adaptiveStream: true, dynacast: true });
  viewer = room;
  room
    .on(RoomEvent.TrackSubscribed, track => {
      if (track.kind === Track.Kind.Video) {
        track.attach(screenEl);
        $('waiting').hidden = true;
        checkAudio(room);
      } else if (track.kind === Track.Kind.Audio) {
        track.attach(audioEl);
        applyVolume();
        $('no-audio').hidden = true;
        // Alguns navegadores bloqueiam o som até um novo clique.
        audioEl.play().catch(() => { $('unmute').hidden = false; });
      }
    })
    .on(RoomEvent.AudioPlaybackStatusChanged, () => { $('unmute').hidden = room.canPlaybackAudio; })
    .on(RoomEvent.TrackUnsubscribed, track => {
      track.detach();
      if (track.kind === Track.Kind.Video) { $('waiting').textContent = 'Aguardando a tela…'; $('waiting').hidden = false; }
    })
    .on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      if (!participant.isLocal) return;
      $('quality').textContent = quality === ConnectionQuality.Poor ? 'Conexão fraca' : '';
    })
    .on(RoomEvent.Reconnecting, () => { $('waiting').textContent = 'Reconectando…'; $('waiting').hidden = false; })
    .on(RoomEvent.Reconnected, () => { $('waiting').hidden = !!screenEl.srcObject; })
    .on(RoomEvent.Disconnected, () => {
      viewer = null;
      ended('Transmissão encerrada', 'Quem estava transmitindo parou de compartilhar a tela.');
    });

  show('watch');
  try {
    await room.connect(livekitUrl(session.url), session.token, connectOptions(session));
    // O clique em "Assistir" libera o som no navegador.
    await room.startAudio();
  } catch (err) {
    console.error(err);
    viewer = null;
    ended('Não foi possível conectar', 'Verifique sua internet e abra o link de novo.');
    return;
  }
  btn.disabled = false;
  document.title = 'Assistindo · PeekMe';
}

// Se em alguns segundos não chegar áudio, avisa que a transmissão está sem som.
function checkAudio(room) {
  setTimeout(() => {
    const hasAudio = [...room.remoteParticipants.values()]
      .some(p => p.getTrackPublication(Track.Source.ScreenShareAudio));
    $('no-audio').hidden = hasAudio;
  }, 3000);
}

$('unmute').addEventListener('click', async () => {
  try {
    await viewer?.startAudio();
    await audioEl.play();
    $('unmute').hidden = true;
  } catch (err) {
    console.error(err);
  }
});

function applyVolume() {
  audioEl.volume = Number($('volume').value);
  audioEl.muted = $('mute').dataset.muted === '1';
  $('mute').textContent = audioEl.muted || audioEl.volume === 0 ? '🔇' : '🔊';
}
$('volume').addEventListener('input', () => { $('mute').dataset.muted = '0'; applyVolume(); });
$('mute').addEventListener('click', () => { $('mute').dataset.muted = $('mute').dataset.muted === '1' ? '0' : '1'; applyVolume(); });
$('fullscreen').addEventListener('click', () => {
  const wrap = $('watch-wrap');
  if (document.fullscreenElement) document.exitFullscreen();
  else if (wrap.requestFullscreen) wrap.requestFullscreen();
  else if (screenEl.webkitEnterFullscreen) screenEl.webkitEnterFullscreen(); // iPhone
});
screenEl.addEventListener('dblclick', () => $('fullscreen').click());
// No celular, tocar no vídeo mostra os controles.
$('watch-wrap').addEventListener('click', e => {
  if (e.target === screenEl) $('watch-wrap').classList.toggle('show-controls');
});

// ---------- Início ----------

const match = location.pathname.match(/^\/assistir\/([a-z0-9]+)\/?$/i);
if (match) {
  const code = match[1].toLowerCase();
  try { $('name').value = localStorage.getItem('peekme-name') || ''; } catch {}
  $('join-form').addEventListener('submit', e => { e.preventDefault(); watch(code); });
  show('join');
} else {
  if (!window.isSecureContext) {
    $('start-error').textContent = 'Para compartilhar a tela, abra o PeekMe pelo endereço com https:// (o seu domínio).';
    $('start-form').querySelector('button').disabled = true;
  } else if (!navigator.mediaDevices?.getDisplayMedia) {
    $('start-error').textContent = 'Este navegador não consegue compartilhar a tela. Use Chrome, Edge ou Firefox no computador.';
    $('start-form').querySelector('button').disabled = true;
  }
  if (/firefox/i.test(navigator.userAgent)) {
    $('start-error').textContent = 'O Firefox não transmite áudio. Para ter som, transmita pelo Chrome ou pelo Edge.';
  }
  try { const saved = localStorage.getItem('peekme-quality'); if (QUALITIES[saved]) $('quality-select').value = saved; } catch {}
  show('home');
}
