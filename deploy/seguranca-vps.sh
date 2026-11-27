#!/usr/bin/env bash
# Proteção da VPS (decisão #105, itens 1 e 2). Rode uma vez como root: bash /opt/filapro/app/deploy/seguranca-vps.sh
# - (SSH só com chave agora é feito por ssh-chave.sh e ssh-travar.sh, decisão #174)
# - fail2ban: bloqueia por 1 hora quem errar o SSH 5 vezes em 10 minutos
# - atualizações de segurança automáticas do Ubuntu
# Pode rodar de novo sem problema.
set -euo pipefail
[ "$(id -u)" = "0" ] || { echo "Rode como root."; exit 1; }

# ===== 1. SSH só com chave =====
# Desde a decisão #174 este script NÃO desliga mais a senha por conta própria (antes desligava assim que existia qualquer chave, sem provar
# que ela funciona, e podia te trancar fora). O passo é feito por deploy/ssh-travar.sh, que exige a prova de um login real com chave e desfaz sozinho.
if grep -qsE '^(ssh-|ecdsa-|sk-)' /root/.ssh/authorized_keys; then
  echo "SSH: há chave cadastrada. Para desligar a senha COM PROVA e desfazer automático:  bash /opt/filapro/app/deploy/ssh-travar.sh"
else
  echo "SSH: nenhuma chave cadastrada ainda. Cadastre:  bash /opt/filapro/app/deploy/ssh-chave.sh --adicionar  (passo a passo: docs/publicacao-vps.md 6.2e)"
fi

# ===== fail2ban =====
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban unattended-upgrades >/dev/null
cat > /etc/fail2ban/jail.d/filapro.conf <<'CONF'
# FilaPro Leads (decisão #105)
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
CONF
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban
echo "fail2ban: ligado (SSH)."

# ===== 2. Atualizações de segurança automáticas =====
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
# Só atualizações de segurança; não reinicia a VPS sozinha (o WhatsApp ficaria fora do ar sem aviso)
cat > /etc/apt/apt.conf.d/52filapro-unattended <<'CONF'
Unattended-Upgrade::Allowed-Origins { "${distro_id}:${distro_codename}-security"; };
Unattended-Upgrade::Automatic-Reboot "false";
CONF
systemctl enable --now unattended-upgrades >/dev/null
echo "Atualizações de segurança automáticas: ligadas."

# ===== Firewall (confere) =====
ufw status | grep -q "Status: active" && echo "Firewall: ativo." || echo "ATENÇÃO: firewall (ufw) desligado — veja docs/publicacao-vps.md."
echo "Pronto."
