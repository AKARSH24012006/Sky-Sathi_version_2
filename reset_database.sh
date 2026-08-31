#!/usr/bin/env bash
read -p "This DELETES all SkySathi data. Continue? [y/N] " a
[ "$a" = "y" ] && docker compose down -v && echo "Database wiped. ./start.sh to begin fresh."
