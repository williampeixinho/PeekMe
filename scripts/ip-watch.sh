#!/bin/sh
# Reinicia o LiveKit quando o IP público muda (a Starlink troca de IP) e não há ninguém conectado.
# O LiveKit só descobre o IP ao iniciar; com IP antigo, quem está fora de casa não conecta.
# Uso (cron a cada 3 min): */3 * * * * flock -n /tmp/peekme-ip.lock /caminho/do/PeekMe/scripts/ip-watch.sh
DIR=${PEEKME_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
cd "$DIR" || exit 1
LOG="$DIR/ip-watch.log"
log() { echo "$(date "+%F %T") $*" >> "$LOG"; tail -n 300 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; }

ip=$(curl -s -m 10 https://api.ipify.org || curl -s -m 10 https://ifconfig.me/ip)
echo "$ip" | grep -Eq "^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$" || exit 0
announced=$(docker logs peekme-livekit-1 2>&1 | grep "starting LiveKit" | tail -1 | grep -o "\"nodeIP\": \"[0-9.]*\"" | grep -o "[0-9.]*\"$" | tr -d "\"")
{ [ -z "$announced" ] || [ "$ip" = "$announced" ]; } && exit 0

people=$(docker exec peekme-app-1 node -e "
const {RoomServiceClient}=require(\"livekit-server-sdk\");
new RoomServiceClient(process.env.LIVEKIT_HTTP_URL||\"http://127.0.0.1:7880\",process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET)
 .listRooms().then(r=>console.log(r.reduce((n,x)=>n+x.numParticipants,0))).catch(()=>console.log(-1));" 2>/dev/null)
if [ "$people" != "0" ]; then log "IP mudou ($announced -> $ip), mas há $people conectado(s); espero"; exit 0; fi
log "IP mudou ($announced -> $ip); reiniciando o LiveKit"
docker compose restart livekit >/dev/null 2>&1 && log "LiveKit reiniciado"
