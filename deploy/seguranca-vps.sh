#!/usr/bin/env bash
# Proteção da VPS (decisão #105, itens 1 e 2). Rode uma vez como root: bash /opt/filapro/app/deploy/seguranca-vps.sh
# - SSH só com chave (sem senha); root continua entrando, mas só com chave
# - fail2ban: bloqueia por 1 hora quem errar o SSH 5 vezes em 10 minutos
# - atualizações de segurança automáticas do Ubuntu
# Pode rodar de novo sem problema.
set -euo pipefail
[ "$(id -u)" = "0" ] || { echo "Rode como root."; exit 1; }

# ===== 1. SSH só com chave =====
# Segurança contra se trancar fora: só desliga a senha se houver alguma chave cadastrada
if ! grep -qsE '^(ssh-|ecdsa-)' /root/.ssh/authorized_keys; then
  cat <<'MSG'
ATENÇÃO: nenhuma chave SSH cadastrada em /root/.ssh/authorized_keys.
Para não perder o acesso, o SSH continua aceitando senha.
Cadastre a sua chave primeiro (no seu computador):  ssh-copy-id root@IP_DA_VPS
Teste entrar sem senha e rode este script de novo.
MSG
  SEM_CHAVE=1
else
  mkdir -p /etc/ssh/sshd_config.d
  cat > /etc/ssh/sshd_config.d/10-filapro.conf <<'CONF'
# FilaPro Leads (decisão #105): só chave, sem senha
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PermitEmptyPasswords no
MaxAuthTries 4
CONF
  sshd -t && (systemctl reload ssh 2>/dev/null || systemctl reload sshd)
  echo "SSH: só com chave (senha desligada)."
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
[ "${SEM_CHAVE:-0}" = "1" ] && echo "Falta: cadastrar a chave SSH e rodar de novo." || true
echo "Pronto."
