#!/bin/bash

check_com() {
    domain="$1.com"
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "https://rdap.verisign.com/com/v1/domain/$domain")
    if [ "$http_code" -eq 404 ]; then
        echo "✅ $domain (Disponible)"
    else
        echo "❌ $domain (Ocupado)"
    fi
}

check_io() {
    domain="$1.io"
    # .io doesn't have a reliable open RDAP without auth sometimes, let's use whois
    if whois "$domain" | grep -iq "Domain not found\|No match for"; then
        echo "✅ $domain (Disponible)"
    else
        echo "❌ $domain (Ocupado)"
    fi
}

echo "Buscando dominios .com..."
check_com "quantcore"
check_com "alphanode"
check_com "macroquant"
check_com "apexalgo"
check_com "tradeos"
check_com "sniperterminal"
check_com "liquidityhunter"
check_com "quantify"
check_com "kage"
check_com "kagetrade"
check_com "macroquant"

echo ""
echo "Buscando dominios .io (Tech)..."
check_io "quantcore"
check_io "alphanode"
check_io "macroquant"
check_io "apexalgo"
check_io "tradeos"
check_io "sniperterminal"
check_io "liquidityhunter"

