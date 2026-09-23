#!/bin/bash

check_com() {
    domain="$1.com"
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "https://rdap.verisign.com/com/v1/domain/$domain")
    if [ "$http_code" -eq 404 ]; then
        echo "✅ $domain"
    else
        echo "❌ $domain (Ocupado)"
    fi
}

echo "Buscando alternativas económicas (.com)..."
check_com "macroquantbot"
check_com "liquidityhunterbot"
check_com "tradekage"
check_com "kagequant"
check_com "alfaquantbot"
check_com "sniperquant"
check_com "thetradeos"
check_com "nexusquant"
check_com "quantstrike"
check_com "quantkage"

