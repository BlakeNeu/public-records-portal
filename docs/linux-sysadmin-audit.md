# Linux System Administration Audit

Commands for reviewing the health and configuration of a Linux server: resources, services, accounts, access, networking, logging, updates and scheduled jobs. Each section lists the checks first, then a **Fixes** block covering how to fix what the checks turn up.

Related files:
- [vulnerability-audit.md](vulnerability-audit.md): malware, file integrity and web attack detection
- [aws-docker-audit.md](aws-docker-audit.md): EC2 instances and Docker containers

## Before you start

- **Run as root or with `sudo`.** Many of these commands read files only root can see (`/etc/sudoers`, `/var/log/secure`, other users' home directories). Without root they may print nothing, which looks like a clean result when it isn't.
- **Commands differ between distro families.** Find out which family you are on first:

  ```bash
  cat /etc/os-release
  ```

  | Item | RHEL family (Amazon Linux 2023, RHEL, Rocky, Alma, Fedora) | Debian family (Ubuntu, Debian) |
  |---|---|---|
  | Package manager | `dnf` / `rpm` | `apt` / `dpkg` |
  | Admin group | `wheel` | `sudo` |
  | Auth log | `/var/log/secure` | `/var/log/auth.log` |
  | Mail log | `/var/log/maillog` | `/var/log/mail.log` |
  | SSH service name | `sshd` | `ssh` |
  | Default firewall | `firewalld` | `ufw` |
  | Mandatory access control | SELinux | AppArmor |

- **Amazon Linux 2023 notes:** it logs to the systemd journal and does not install `rsyslog` by default. It also does not install `firewalld` by default, because traffic is normally filtered by AWS security groups.
### Before you change anything

- **Keep a second session open** while you change SSH, the firewall, sudo or security groups. Test a new login from another terminal before you close the one you have. If a change locks you out, the open session is how you undo it. [Section 14](#14-managing-terminal-sessions) shows how to run several sessions with tmux.
- **On EC2, take a snapshot before big changes:** `aws ec2 create-snapshot --volume-id <volume-id> --description "before <change>"`.
- **Try the fix on a non-production server first** when you have one.
- **If you think the server has been compromised, don't start fixing it.** Follow the incident steps in [the vulnerability audit](vulnerability-audit.md#1-malware-and-integrity) first. Cleaning up in place destroys evidence and often leaves the attacker's other way back in.

---

## 1. System overview

**OS, kernel and hostname**
```bash
cat /etc/os-release
uname -r
hostnamectl
```

**How long the system has been running, and its load averages (1, 5 and 15 minutes)**
```bash
uptime
```

**Disk space per filesystem.** A full `/` or `/var` breaks services and stops logging.
```bash
df -h
df -i          # inode usage: can run out even when there is free space
lsblk          # block devices and mount points (EBS volumes show up as nvme*)
```

**Largest directories under /var**
```bash
sudo du -xh /var --max-depth=2 2>/dev/null | sort -rh | head -n 15
```

**Memory and swap**
```bash
free -h
```

**Top memory consumers**
```bash
ps aux --sort=-%mem | head -n 10
```

**Top CPU consumers**
```bash
ps aux --sort=-%cpu | head -n 10
```

**Kernel messages, such as hardware errors, disk errors and out-of-memory kills**
```bash
sudo dmesg -T | tail -n 50
sudo journalctl -k -p err -b      # kernel errors since the last boot
```

### Fixes

**Free up disk space**
```bash
sudo journalctl --vacuum-size=500M    # shrink the systemd journal to 500 MB
sudo dnf clean all                    # RHEL family: clear the package cache
sudo apt clean                        # Debian family: clear the package cache
```
If Docker is installed, it is often the biggest user of disk. See the cleanup commands in [the AWS and Docker audit](aws-docker-audit.md#2-docker).

**Find what is using up inodes.** This counts files per top-level directory. Millions of tiny files, such as session or cache files, are the usual cause.
```bash
sudo find / -xdev -type f 2>/dev/null | cut -d/ -f2-3 | sort | uniq -c | sort -rn | head
```

**Grow a full EBS root volume.** Enlarge the volume first. Then grow the partition and the filesystem. No reboot is needed.
```bash
aws ec2 modify-volume --volume-id <volume-id> --size <new-size-GiB>       # from a workstation
aws ec2 describe-volumes-modifications --volume-ids <volume-id>           # wait for "optimizing" or "completed"
sudo growpart /dev/nvme0n1 1          # grow partition 1 to fill the disk
sudo xfs_growfs -d /                  # XFS: Amazon Linux and RHEL default
sudo resize2fs /dev/nvme0n1p1         # ext4: Ubuntu default
```
Check the device name and filesystem type with `lsblk` and `df -T /` first.

**Add a swap file.** Small instances often have no swap, so a memory spike gets processes killed.
```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048    # 2 GB
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap defaults 0 0' | sudo tee -a /etc/fstab   # keep it after a reboot
```

---

## 2. Services and systemd

**Running services**
```bash
systemctl list-units --type=service --state=running
```

**Failed (broken) services**
```bash
systemctl list-units --state=failed
systemctl --failed                # shorthand for the same thing
```

**Why a service failed**
```bash
systemctl status <service>
journalctl -u <service> -n 100 --no-pager
```

**Services enabled to start at boot**
```bash
systemctl list-unit-files --type=service --state=enabled
```

**Errors logged since the last boot**
```bash
sudo journalctl -p err -b --no-pager | tail -n 50
```

### Fixes

**Restart, stop or disable a service**
```bash
sudo systemctl restart <service>
sudo systemctl reset-failed <service>    # clear the "failed" state once it is fixed
sudo systemctl disable --now <service>   # stop it now and don't start it at boot
sudo systemctl mask <service>            # block it from starting at all, even as a dependency
```
Disable anything you don't use. Every running service is something that can be attacked.

**Restart a service automatically when it crashes.** `systemctl edit` creates an override file, so the change survives package updates.
```bash
sudo systemctl edit <service>
```
Add these lines, save, then run `sudo systemctl restart <service>`:
```ini
[Service]
Restart=on-failure
RestartSec=5s
```

---

## 3. Users and accounts

**Users with a login shell.** These accounts can log in interactively. The pattern excludes `nologin` and `false`, so it also catches `sh`, `zsh` and other shells, which a plain search for `/bin/bash` would miss.
```bash
grep -vE '(nologin|false)$' /etc/passwd
```

**Accounts with UID 0.** Only `root` should be in this list. Any other entry has full root power.
```bash
awk -F: '$3 == 0 {print $1}' /etc/passwd
```

**Most recently added accounts**
```bash
tail -n 10 /etc/passwd
```

**Accounts with an empty password**
```bash
sudo awk -F: '$2 == "" {print $1}' /etc/shadow
```

**Password age and expiry for a user**
```bash
sudo chage -l <username>
```

### Fixes

**Add a user.**
- `-m` creates a home directory, `-s` sets the login shell and `-c` adds a comment, normally the person's full name.
- RHEL-family systems create the home directory even without `-m`. Debian-family systems don't, so always include it.
- On Debian and Ubuntu, `sudo adduser <username>` is an interactive alternative that asks for each detail.

```bash
sudo useradd -m -s /bin/bash -c "Full Name" <username>
id <username>                                       # confirm the user and their groups
```

**Add a user whose account expires.** This suits contractors and temporary access. The account stops working after the date.
```bash
sudo useradd -m -s /bin/bash -c "Full Name" -e 2026-12-31 <username>
```

**Give the user admin (sudo) rights.** Always include `-a`. Without it, `-G` replaces every group the user is already in.
```bash
sudo usermod -aG wheel <username>     # RHEL family
sudo usermod -aG sudo <username>      # Debian family
```

**Set a temporary password, typing it in**
```bash
sudo passwd <username>
```

**Set a random temporary password.** This generates a strong password and sets it without leaving it in your shell history. Give it to the user over a secure channel, such as a password manager share, not email or chat.
```bash
TEMP_PW=$(openssl rand -base64 12)
echo "<username>:$TEMP_PW" | sudo chpasswd
echo "Temporary password: $TEMP_PW"
unset TEMP_PW
```

**Make them change it at first login.** This marks the password as expired, so the user has to choose a new one the first time they log in.
```bash
sudo chage -d 0 <username>
sudo chage -l <username>      # shows "Last password change: password must be changed"
```

**Install their SSH key.** If you have hardened SSH with `PasswordAuthentication no` (see [section 5](#5-ssh-access)), the user can't log in over SSH with the temporary password. Install their public key instead. Their first key login still asks them to replace the expired password, as long as `UsePAM yes` is set (the default on Amazon Linux and Ubuntu). After that, they use the password only for `sudo`.
```bash
sudo mkdir -p /home/<username>/.ssh
echo '<their-public-key>' | sudo tee -a /home/<username>/.ssh/authorized_keys
sudo chmod 700 /home/<username>/.ssh
sudo chmod 600 /home/<username>/.ssh/authorized_keys
sudo chown -R <username>:<username> /home/<username>/.ssh
```

**Check the new account**
```bash
id <username>                          # UID and groups
getent passwd <username>               # home directory and shell
sudo chage -l <username>               # password and account expiry
sudo -l -U <username>                  # what they can run with sudo
```

**Lock an account.** `-L` only locks the password, so SSH key logins still work. `-e 1` also expires the account, which blocks every kind of login.
```bash
sudo usermod -L -e 1 <username>
sudo usermod -s /sbin/nologin <username>    # also take away the login shell
```

**Unlock an account**
```bash
sudo usermod -U -e '' <username>
```

**Delete an account and its home directory.** This can't be undone, so archive anything you need first.
```bash
sudo tar czf /root/<username>-home.tgz /home/<username>
sudo userdel -r <username>
```

**An account other than root has UID 0.** Treat this as a compromise unless you can find a documented reason for it. Lock the account and follow the incident steps in [the vulnerability audit](vulnerability-audit.md#1-malware-and-integrity).

**An account has an empty password.** Lock it, or set a password:
```bash
sudo passwd -l <username>
sudo passwd <username>
```

**Make passwords expire.** This example requires a new password every 90 days, with a warning 14 days before. Set `PASS_MAX_DAYS` in `/etc/login.defs` to apply a default to new accounts.
```bash
sudo chage -M 90 -W 14 <username>
```

---

## 4. Sudo privileges

**Members of the admin group.** On the RHEL family this is `wheel`. On the Debian family it is `sudo`.
```bash
getent group wheel
getent group sudo
```

**Rules that grant sudo access.** This shows every line that isn't a comment and contains `ALL`.
```bash
sudo grep -rE '^[^#]*ALL' /etc/sudoers /etc/sudoers.d/
```

**Full contents of the drop-in sudoers files**
```bash
sudo cat /etc/sudoers.d/*
```

**What one user is allowed to run with sudo**
```bash
sudo -l -U <username>
```

**Rules with NOPASSWD.** These run commands as root without asking for a password.
```bash
sudo grep -rn 'NOPASSWD' /etc/sudoers /etc/sudoers.d/
```

### Fixes

**Remove a user from the admin group.** This takes effect at the user's next login.
```bash
sudo gpasswd -d <username> wheel     # RHEL family
sudo gpasswd -d <username> sudo      # Debian family
```

**Edit sudoers only with `visudo`.** It checks the syntax before it saves. A syntax error in a sudoers file can break sudo for everyone, which locks you out of root.
```bash
sudo visudo                                # main file
sudo visudo -f /etc/sudoers.d/<file>       # a drop-in file
sudo visudo -c                             # check every sudoers file
```

**Remove a drop-in rule, then check what is left**
```bash
sudo rm /etc/sudoers.d/<file>
sudo visudo -c
```

**Allow specific commands instead of `ALL`.** For example, a deploy user that only needs to restart one service:
```
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart myapp
```

> Cloud images give the default user (`ec2-user`, `ubuntu`) `NOPASSWD: ALL` in `/etc/sudoers.d/90-cloud-init-users`. That is expected. It also means anyone with that user's SSH key has root, so protect the key accordingly.

---

## 5. SSH access

**Which users have SSH keys installed**
```bash
sudo ls -la /home/*/.ssh/authorized_keys /root/.ssh/authorized_keys 2>/dev/null
```

**The keys themselves, for every user.** Compare each key's comment and fingerprint against people you expect to have access.
```bash
for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
  [ -f "$f" ] && echo "== $f" && sudo ssh-keygen -lf "$f"
done
```

**Keys for the current user only**
```bash
cat ~/.ssh/authorized_keys
```

**SSH server settings that are actually in effect.** `sshd -T` prints the merged configuration, including drop-in files under `/etc/ssh/sshd_config.d/`.
```bash
sudo sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|pubkeyauthentication|port|allowusers|allowgroups)'
```
Recommended: `permitrootlogin no` (or `prohibit-password`) and `passwordauthentication no`.

### Fixes

**Remove a key.** Open the file and delete the key's line. Alternatively, delete the line that contains a unique part of the key, such as its comment:
```bash
sudo sed -i '/<unique-part-of-key-line>/d' /home/<username>/.ssh/authorized_keys
```

**Fix permissions.** sshd ignores keys whose files other users can write to.
```bash
sudo chmod 700 /home/<username>/.ssh
sudo chmod 600 /home/<username>/.ssh/authorized_keys
sudo chown -R <username>:<username> /home/<username>/.ssh
```

**Harden the SSH server.** Create `/etc/ssh/sshd_config.d/00-hardening.conf` with these lines:
```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
```
For most settings, sshd keeps the first value it reads. It reads drop-in files in name order, so the `00-` prefix lets this file win over others such as cloud-init's `50-cloud-init.conf`. That only works if the `Include` line is at the top of `/etc/ssh/sshd_config`, which it is on Amazon Linux 2023 and on Ubuntu 22.04 and later. Check with `grep -n Include /etc/ssh/sshd_config`.

Optionally, add `AllowGroups wheel` on a line of its own to let only that group log in. Check that your own user is in the group before you reload. sshd_config only allows comments on lines of their own, so don't add one at the end of a setting.

**Check the settings and apply them.** Keep your current session open and test a new login before you close it.
```bash
sudo sshd -t                    # syntax check: prints nothing if the file is fine
sudo systemctl reload sshd      # the service is called ssh on Debian and Ubuntu
sudo sshd -T | grep -Ei 'permitrootlogin|passwordauthentication'   # confirm the new values
```

**Slow down brute-force attempts**
- On Debian or Ubuntu, install `fail2ban` with `sudo apt install fail2ban`. It enables an SSH jail by default.
- Amazon Linux 2023 doesn't package fail2ban. Limit port 22 to your own IP in the security group instead.
- Better still on AWS, close port 22 completely and connect with SSM Session Manager (see [the AWS and Docker audit](aws-docker-audit.md#1-aws-ec2)).

---

## 6. Logins

**Last 10 successful logins, with full dates and times**
```bash
last -F | head -n 10
```

**Last 20 failed logins.** This reads `/var/log/btmp`, so it needs root.
```bash
sudo lastb -n 20
```

**Who is logged in right now, and how long they have been idle**
```bash
who -u
w
```

**Last login time for every account**
```bash
lastlog
```

**Failed SSH logins from the journal.** Use `ssh` instead of `sshd` on Debian or Ubuntu.
```bash
sudo journalctl -u sshd --since "24 hours ago" | grep -Ei 'failed|invalid'
```

**Failed SSH logins from the log file**
```bash
sudo grep -Ei 'failed password|invalid user' /var/log/secure      # RHEL family
sudo grep -Ei 'failed password|invalid user' /var/log/auth.log    # Debian family
```

### Fixes

**Kick a user off the system.** Lock the account (section 3) and remove their keys (section 5) as well. Otherwise they can simply log back in.
```bash
sudo loginctl terminate-user <username>
sudo pkill -KILL -u <username>           # if loginctl doesn't end every process
```

**Block an IP address on the host**
```bash
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="<ip>" drop'
sudo firewall-cmd --reload
sudo ufw deny from <ip>                  # Debian family
```

**Block an IP address in AWS.** Security groups can only allow traffic, so use a deny rule in the subnet's network ACL. Rules are checked in number order, from lowest to highest.
```bash
aws ec2 create-network-acl-entry --network-acl-id <acl-id> --ingress \
  --rule-number 50 --protocol -1 --rule-action deny --cidr-block <ip>/32
```

---

## 7. Network ports and connections

**Listening ports and the processes that own them.** `-t` TCP, `-u` UDP, `-l` listening only, `-p` show the process, `-n` numeric output with no DNS lookups. Run it with `sudo` to see processes owned by other users.
```bash
sudo ss -tulpn
```

**Established TCP connections and their processes.** Look for outbound connections to addresses you don't recognise.
```bash
sudo ss -tnp state established
```

**Listening sockets, using `lsof`.** `-P` shows port numbers instead of service names and `-n` skips DNS lookups.
```bash
sudo lsof -i -P -n | grep LISTEN
```

**Pay attention to anything listening on `0.0.0.0` or `[::]`.** It accepts connections on every interface, not just localhost.

### Fixes

**Find out what a listening process is and which package installed it.** Take the PID from `ss -tulpn`.
```bash
sudo readlink -f /proc/<pid>/exe     # path to the binary
rpm -qf <path>                       # RHEL family: which package owns it
dpkg -S <path>                       # Debian family
```

**Stop a service you don't need, or remove it**
```bash
sudo systemctl disable --now <service>
sudo dnf remove <package>            # or: sudo apt remove <package>
```

**Make a service listen on localhost only.** Use this when only programs on the same server need to reach it. Change the bind address in its configuration, then restart it. Common examples:

| Service | Setting |
|---|---|
| Redis | `bind 127.0.0.1` in `redis.conf` |
| MySQL / MariaDB | `bind-address = 127.0.0.1` in `my.cnf` |
| PostgreSQL | `listen_addresses = 'localhost'` in `postgresql.conf` |
| Node / Next.js | listen on `127.0.0.1` (for example `HOSTNAME=127.0.0.1`), not `0.0.0.0` |

**Deal with an unknown process.** Record what it is before you kill it. Once it has stopped, the evidence is gone.
```bash
sudo ls -l /proc/<pid>/exe
sudo cat /proc/<pid>/cmdline | tr '\0' ' '; echo
sudo cp /proc/<pid>/exe /root/evidence-<pid>.bin     # a copy of the binary, even if it was deleted from disk
sudo kill -9 <pid>
```
Then treat the server as possibly compromised. See [the vulnerability audit](vulnerability-audit.md#1-malware-and-integrity).

---

## 8. Firewall

**Is firewalld running**
```bash
systemctl status firewalld
sudo firewall-cmd --state
```

**Active zones and the interfaces assigned to them**
```bash
sudo firewall-cmd --get-active-zones
```

**Ports and services allowed in the default zone**
```bash
sudo firewall-cmd --list-all
```

**Settings for every zone, including inactive ones**
```bash
sudo firewall-cmd --list-all-zones
```

**ufw on Debian or Ubuntu**
```bash
sudo ufw status verbose
```

**Raw rules, whatever front end manages them**
```bash
sudo nft list ruleset
sudo iptables -L -n -v
```

> On EC2, AWS security groups and network ACLs filter traffic before it reaches the instance. Check them as well; see [the AWS and Docker audit](aws-docker-audit.md#1-aws-ec2).
> Docker writes its own iptables rules. A port published with `-p` can be reachable from outside even when firewalld or ufw appears to block it; see [the AWS and Docker audit](aws-docker-audit.md#2-docker).

### Fixes

**Install and start firewalld (RHEL family).** Its default `public` zone allows SSH. Check that `ssh` is listed before you disconnect.
```bash
sudo dnf install -y firewalld
sudo systemctl enable --now firewalld
sudo firewall-cmd --list-services
```

**Open or close ports.** `--permanent` saves the change but doesn't apply it. The change takes effect at `--reload`.
```bash
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --remove-service=<service>
sudo firewall-cmd --permanent --remove-port=<port>/tcp
sudo firewall-cmd --reload
```

**Allow SSH from one address only**
```bash
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="<your-ip>/32" service name="ssh" accept'
sudo firewall-cmd --permanent --remove-service=ssh
sudo firewall-cmd --reload
```

**ufw (Debian family).** Allow SSH **before** you enable ufw, or enabling it cuts off your session.
```bash
sudo ufw allow OpenSSH
sudo ufw default deny incoming
sudo ufw enable
sudo ufw allow from <your-ip> to any port 22 proto tcp   # then: sudo ufw delete allow OpenSSH
sudo ufw delete allow <port>/tcp
```

---

## 9. SELinux (RHEL family)

**Current status: enabled or disabled, mode, and loaded policy**
```bash
sestatus
```

**Current mode only: Enforcing, Permissive or Disabled.** Permissive logs violations but does not block them. Amazon Linux 2023 ships in permissive mode.
```bash
getenforce
```

**Status plus the security contexts of the key files and processes** listed in `/etc/sestatus.conf`
```bash
sestatus -v
```

**Mode configured for the next boot**
```bash
grep '^SELINUX=' /etc/selinux/config
```

**Recent SELinux denials.** `-ts recent` means the last 10 minutes. Use `-ts today` for a wider window.
```bash
sudo ausearch -m avc -ts recent
sudo ausearch -m avc -ts today
```

**AppArmor on Debian or Ubuntu**
```bash
sudo aa-status
```

### Fixes

**Switch from permissive to enforcing.** `setenforce` changes the running system. The config file sets the mode used after the next boot.
```bash
sudo setenforce 1
sudo sed -i 's/^SELINUX=.*/SELINUX=enforcing/' /etc/selinux/config
```
Check `ausearch` for denials while the system is still permissive. Anything denied there will break once you switch to enforcing.

**Turn SELinux back on after it was disabled.** Every file needs relabelling, so go through permissive mode first:
```bash
sudo sed -i 's/^SELINUX=.*/SELINUX=permissive/' /etc/selinux/config
sudo grubby --update-kernel ALL --remove-args selinux    # remove any selinux=0 boot option
sudo touch /.autorelabel                                  # relabel every file on the next boot
sudo reboot
```
After the reboot, check the denials, fix them, then switch to enforcing as shown above.

**Fix denials instead of turning SELinux off.** These tools come from the `policycoreutils-python-utils` package.
```bash
sudo ausearch -m avc -ts recent | audit2why                         # explains each denial and often names the fix
sudo restorecon -Rv <path>                                          # reset wrong labels, e.g. on files moved with mv
sudo semanage fcontext -a -t httpd_sys_content_t '/srv/www(/.*)?'   # label a custom web directory
sudo restorecon -Rv /srv/www
sudo setsebool -P httpd_can_network_connect on                      # let a web server make outbound connections
sudo semanage port -a -t http_port_t -p tcp 8081                    # let a web server listen on a non-standard port
```

**Last resort: build a custom policy module from the denials.** Read the generated `.te` file before you install it. It allows whatever was denied, including anything an attacker did.
```bash
sudo ausearch -m avc -ts recent | audit2allow -M my-local-policy
cat my-local-policy.te
sudo semodule -i my-local-policy.pp
```

---

## 10. Logging

**Is logging forwarded to a remote syslog server?** In rsyslog, `@host` forwards over UDP and `@@host` forwards over TCP. Check the drop-in directory as well as the main file.
```bash
grep -rnE '^[^#]*@@?[a-zA-Z0-9]' /etc/rsyslog.conf /etc/rsyslog.d/ 2>/dev/null
grep -rni 'omfwd\|target=' /etc/rsyslog.conf /etc/rsyslog.d/ 2>/dev/null   # newer RainerScript syntax
```

**Is rsyslog installed and running?** It isn't installed on Amazon Linux 2023 by default.
```bash
systemctl status rsyslog
```

**Disk space used by the systemd journal**
```bash
journalctl --disk-usage
```

**Journal size limits.** If `SystemMaxUse` isn't set, the journal can use up to 10% of the filesystem.
```bash
grep -E '^(SystemMaxUse|Storage)' /etc/systemd/journald.conf /etc/systemd/journald.conf.d/*.conf 2>/dev/null
```

**Is log rotation configured, or will /var/log fill up?**
```bash
cat /etc/logrotate.conf
ls /etc/logrotate.d/                     # per-application rotation rules
grep -rE 'rotate|size|maxsize|daily|weekly' /etc/logrotate.conf /etc/logrotate.d/
```

**Does logrotate actually run?** This is a dry run that changes nothing.
```bash
sudo logrotate -d /etc/logrotate.conf 2>&1 | tail -n 20
systemctl status logrotate.timer
```

**Size of /var/log**
```bash
sudo du -sh /var/log
sudo du -ah /var/log | sort -rh | head -n 10
```

### Fixes

**Cap the journal's size and keep it across reboots**
```bash
sudo mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=500M\nStorage=persistent\n' | sudo tee /etc/systemd/journald.conf.d/size.conf
sudo systemctl restart systemd-journald
sudo journalctl --vacuum-size=500M      # trim it down to the new limit now
```

**Forward logs to a remote syslog server.** `@@` sends over TCP and `@` over UDP. Prefer TCP, because UDP drops messages silently.
```bash
sudo dnf install -y rsyslog && sudo systemctl enable --now rsyslog    # Amazon Linux 2023 doesn't include it
echo '*.* @@<log-server>:514' | sudo tee /etc/rsyslog.d/90-remote.conf
sudo systemctl restart rsyslog
```

**Send logs to CloudWatch on AWS.** The instance role needs the `CloudWatchAgentServerPolicy` policy.
```bash
sudo dnf install -y amazon-cloudwatch-agent
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/bin/config.json
```

**Add log rotation for an application.** Save the following as `/etc/logrotate.d/myapp`. It keeps 14 days of compressed logs. `copytruncate` is for apps that hold the log file open and can't be told to reopen it. It can lose a few lines at the moment of rotation.
```
/var/log/myapp/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```
Test it:
```bash
sudo logrotate -d /etc/logrotate.d/myapp     # dry run
sudo logrotate -f /etc/logrotate.d/myapp     # force a rotation now
```

---

## 11. Mail (SMTP) traffic

**Postfix activity**
```bash
sudo grep -i postfix /var/log/maillog     # RHEL family
sudo grep -i postfix /var/log/mail.log    # Debian family
sudo journalctl -u postfix --since today  # systems that log only to the journal
```

**Mail waiting in the queue.** A large queue can mean a spam relay or a delivery problem.
```bash
mailq
sudo postqueue -p | tail -n 1
```

**Is the mail server listening on an external address?** It should normally listen only on 127.0.0.1.
```bash
sudo ss -tlnp | grep -E ':25|:465|:587'
```

### Fixes

**Make Postfix accept mail only from the server itself.** Changing `inet_interfaces` needs a full restart. A reload isn't enough.
```bash
sudo postconf -e 'inet_interfaces = loopback-only'
sudo postconf -e 'mynetworks = 127.0.0.0/8 [::1]/128'
sudo systemctl restart postfix
postconf inet_interfaces mynetworks smtpd_relay_restrictions    # confirm the settings
```

**Empty the queue of spam.** This deletes the mail and can't be undone.
```bash
sudo postsuper -d ALL deferred     # only messages that failed to deliver
sudo postsuper -d ALL              # every queued message
```

**Turn Postfix off if the server doesn't send mail**
```bash
sudo systemctl disable --now postfix
```

> EC2 restricts outbound traffic on port 25 by default. To send mail from AWS, relay through Amazon SES on port 587 instead.

---

## 12. Packages and updates

**Package update history (RHEL family)**
```bash
sudo dnf history
sudo dnf history info last        # details of the most recent transaction
```

**Most recently installed or updated packages (RHEL family)**
```bash
rpm -qa --last | head -n 10
```

**Pending security updates (RHEL family)**
```bash
sudo dnf updateinfo list --security
sudo dnf check-update
```

**Package update history (Debian family).** `ls -l` on this file only shows when it last changed. `grep` shows what was installed and when.
```bash
grep -E '^(Start-Date|Commandline)' /var/log/apt/history.log | tail -n 20
zgrep -hE '^(Start-Date|Commandline)' /var/log/apt/history.log.*.gz | tail -n 20   # older, rotated logs
```

**Pending updates (Debian family)**
```bash
sudo apt update && apt list --upgradable
```

**Does the system need a reboot to load a new kernel or libraries?**
```bash
sudo dnf needs-restarting -r      # RHEL family
ls /var/run/reboot-required       # Debian family: the file exists if a reboot is needed
```

### Fixes

**Install updates (RHEL family)**
```bash
sudo dnf upgrade --security -y     # security fixes only
sudo dnf upgrade -y                # everything
```

**Move to a newer Amazon Linux 2023 release.** AL2023 pins its repositories to a release version, so `dnf upgrade` alone stays on the current one.
```bash
sudo dnf check-release-update
sudo dnf upgrade --releasever=latest
```

**Install security updates automatically (RHEL family)**
```bash
sudo dnf install -y dnf-automatic
sudo sed -i 's/^upgrade_type.*/upgrade_type = security/; s/^apply_updates.*/apply_updates = yes/' /etc/dnf/automatic.conf
sudo systemctl enable --now dnf-automatic.timer
```

**Install updates, and turn on automatic updates (Debian family)**
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

**Reboot when the checks above say one is needed**
```bash
sudo reboot
```

**Patch from AWS with SSM Patch Manager**, which reboots only if needed
```bash
aws ssm send-command --document-name AWS-RunPatchBaseline \
  --parameters 'Operation=Install,RebootOption=RebootIfNeeded' \
  --targets Key=InstanceIds,Values=<instance-id>
```

---

## 13. Scheduled jobs

**The current user's cron jobs**
```bash
crontab -l
```

**Another user's cron jobs**
```bash
sudo crontab -l -u <username>
```

**Every user's crontab file**
```bash
sudo ls -la /var/spool/cron/            # RHEL family
sudo ls -la /var/spool/cron/crontabs/   # Debian family
```

**System cron jobs**
```bash
cat /etc/crontab
ls -ltrh /etc/cron.d/
ls -l /etc/cron.hourly/ /etc/cron.daily/ /etc/cron.weekly/ /etc/cron.monthly/
```

**systemd timers, with their last and next run times**
```bash
systemctl list-timers --all
```

**One-off `at` jobs**
```bash
sudo atq
```

### Fixes

**Remove a job**
```bash
sudo crontab -e -u <username>              # edit the user's crontab and delete the line
sudo rm /etc/cron.d/<file>                 # a system cron file
sudo systemctl disable --now <name>.timer  # a systemd timer
sudo atrm <job-number>                     # an at job (the number comes from atq)
```

**Limit who can use cron.** When `/etc/cron.allow` exists, only the users listed in it can create crontabs.
```bash
echo root | sudo tee /etc/cron.allow
```

If you find a job you didn't create that downloads or runs something, treat it as a compromise. See [the vulnerability audit](vulnerability-audit.md#1-malware-and-integrity).

---

## 14. Managing terminal sessions

### tmux

tmux runs several terminal sessions on the server inside one SSH or SSM connection. The sessions keep running after you disconnect, so a long scan or upgrade survives a dropped connection. It also gives you the second session to keep open while you change SSH or firewall settings.

**Install it**
```bash
sudo dnf install -y tmux     # RHEL family
sudo apt install -y tmux     # Debian family
```

**Open sessions.** Give each session a name so you can find it again later.
```bash
tmux new -s audit                 # create a session called "audit" and attach to it
tmux new -s patching -d           # create a session called "patching" in the background
tmux new -s scan -d 'sudo clamscan -r -i /home'   # start a background session that runs a command
```

**List sessions**
```bash
tmux ls
```

**Pick a session to attach to**
```bash
tmux attach -t audit                 # attach to the "audit" session
tmux attach                          # attach to the most recent session
tmux switch-client -t patching       # switch to another session from inside tmux
```

**Remove sessions**
```bash
tmux kill-session -t scan            # end the "scan" session and everything running in it
tmux kill-session -a                 # end every session except the one you are attached to
tmux kill-server                     # end every session
```

**Keys inside tmux.** Press `Ctrl+b`, let go, then press the key.

| Keys | Action |
|---|---|
| `Ctrl+b` `d` | Detach. The session keeps running and you return to the normal shell. |
| `Ctrl+b` `s` | Show a list of sessions and pick one with the arrow keys and Enter. Press `x` in the list to kill the highlighted session. |
| `Ctrl+b` `(` / `)` | Previous or next session |
| `Ctrl+b` `$` | Rename the current session |
| `Ctrl+b` `c` | New window inside the session |
| `Ctrl+b` `n` / `p` | Next or previous window |
| `Ctrl+b` `%` / `"` | Split the window side by side, or top and bottom |
| `Ctrl+b` arrow key | Move between split panes |
| `Ctrl+b` `x` | Close the current pane (asks first) |
| `Ctrl+b` `[` | Scroll mode: use the arrow keys or Page Up, and press `q` to leave |

Typing `exit` in the last window also ends the session.

### screen

GNU screen is an older alternative to tmux. Some servers have it when tmux isn't installed.
```bash
screen -S audit              # open a session called "audit"
screen -ls                   # list sessions
screen -r audit              # attach to the "audit" session
screen -d -r audit           # attach, detaching it from wherever else it is attached
screen -S audit -X quit      # remove the "audit" session
```
Inside screen, `Ctrl+a` `d` detaches and `Ctrl+a` `"` lists the windows in the session.

### Login sessions

These are the actual SSH and console logins on the server, not tmux sessions.
```bash
loginctl list-sessions                    # every login session, with its ID, user and terminal
loginctl session-status <session-id>      # details and processes for one session
sudo loginctl terminate-session <session-id>   # end one session
sudo loginctl terminate-user <username>        # end every session for a user
```

### SSM Session Manager sessions (AWS)

**Open several sessions.** Run `start-session` in several local terminals to get several shells on the same instance.
```bash
aws ssm start-session --target <instance-id>
```

**List active sessions**
```bash
aws ssm describe-sessions --state Active \
  --query 'Sessions[].{ID:SessionId,Target:Target,Owner:Owner,Start:StartDate}'
```

**End a session**
```bash
aws ssm terminate-session --session-id <session-id>
```

