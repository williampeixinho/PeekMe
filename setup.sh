#!/bin/sh
# Cria o arquivo .env do PeekMe com perguntas simples.
set -e
cd "$(dirname "$0")"

if [ -f .env ]; then
  printf 'Já existe um .env. Sobrescrever? [s/N] '
  read -r answer
  [ "$answer" = "s" ] || [ "$answer" = "S" ] || exit 0
fi

printf 'Seu subdomínio no DuckDNS (só o nome, ex.: peekme-do-will) ou o domínio completo se usar outro DDNS: '
read -r name
case "$name" in
  *.*) domain="$name"; duck_sub="" ;;
  *)   domain="$name.duckdns.org"; duck_sub="$name" ;;
esac

duck_token=""
if [ -n "$duck_sub" ]; then
  printf 'Token do DuckDNS (aparece no topo de duckdns.org depois de entrar): '
  read -r duck_token
fi

printf 'Senha para poder transmitir: '
stty -echo 2>/dev/null || true
read -r password
stty echo 2>/dev/null || true
echo

secret=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')

{
  echo "DOMAIN=$domain"
  echo "HOST_PASSWORD=$password"
  echo "LIVEKIT_API_KEY=peekme"
  echo "LIVEKIT_API_SECRET=$secret"
  echo "MAX_VIEWERS=5"
  echo "APP_PORT=3077"
  if [ -n "$duck_sub" ]; then
    echo "COMPOSE_PROFILES=duckdns"
    echo "DUCKDNS_SUBDOMAIN=$duck_sub"
    echo "DUCKDNS_TOKEN=$duck_token"
  fi
} > .env
chmod 600 .env

echo "Pronto! .env criado para https://$domain"
echo "Agora rode: docker compose up -d --build"
