# AWS EC2 and Docker Audit

Commands for auditing an EC2 instance, both from the instance and from a workstation with the AWS CLI, and for auditing the Docker daemon, containers and images running on it. Each section lists the checks first, then a **Fixes** block.

Related files:
- [linux-sysadmin-audit.md](linux-sysadmin-audit.md): system health, accounts, SSH, firewall, logging and updates
- [vulnerability-audit.md](vulnerability-audit.md): malware, file integrity and web attack detection

## Before you start

- **Run commands on the instance as root or with `sudo`.** Run the AWS CLI commands from a workstation, or from the instance itself, using credentials that can read EC2, IAM and SSM.
- **Replace the placeholders** in angle brackets, such as `<instance-id>`, `<sg-id>` and `<container>`. Addresses such as `169.254.169.254` are real fixed AWS addresses, not examples.
- **Keep a second session open** while you change security groups, IAM roles or SSH access, so you can undo a change that locks you out.
- **Take a snapshot before big changes:** `aws ec2 create-snapshot --volume-id <volume-id> --description "before <change>"`.

---

## 1. AWS EC2

### On the instance

**Instance metadata through IMDSv2.** IMDSv2 requires a session token. Request a token, then send it with each call.
```bash
TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
curl -sH "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id
curl -sH "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region
curl -sH "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/info   # attached IAM role
```

**Is IMDSv1 disabled?** A `401 Unauthorized` response is good: it means a token is required. If this returns data, IMDSv1 is still on, and an SSRF bug in any app on the box can be used to steal the instance's IAM credentials.
```bash
curl -s -o /dev/null -w '%{http_code}\n' http://169.254.169.254/latest/meta-data/
```

**Short form on Amazon Linux**
```bash
ec2-metadata --instance-id --instance-type --availability-zone
```

**Which AWS identity this instance uses**
```bash
aws sts get-caller-identity
```

**User data.** Scripts here run at first boot and sometimes contain hard-coded secrets.
```bash
curl -sH "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/user-data
```

**Did cloud-init (first-boot setup) succeed?**
```bash
cloud-init status --long
sudo tail -n 50 /var/log/cloud-init-output.log
```

**SSM Agent**, which Session Manager and Patch Manager depend on
```bash
systemctl status amazon-ssm-agent
```

**CloudWatch agent**, which ships logs and metrics off the box
```bash
systemctl status amazon-cloudwatch-agent
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status
ls /opt/aws/amazon-cloudwatch-agent/etc/
```

**Time sync.** EC2 uses the Amazon Time Sync Service at 169.254.169.123 through chrony.
```bash
chronyc tracking
chronyc sources -v
```

### From a workstation with the AWS CLI

**Is IMDSv2 enforced?** `HttpTokens` should be `required`.
```bash
aws ec2 describe-instances --instance-ids <instance-id> \
  --query 'Reservations[].Instances[].MetadataOptions'
```

**Security groups attached to the instance**
```bash
aws ec2 describe-instances --instance-ids <instance-id> \
  --query 'Reservations[].Instances[].SecurityGroups'
```

**Inbound rules open to the whole internet (0.0.0.0/0)**
```bash
aws ec2 describe-security-groups \
  --filters Name=ip-permission.cidr,Values=0.0.0.0/0 \
  --query 'SecurityGroups[].{ID:GroupId,Name:GroupName,Rules:IpPermissions}'
```

**Is the EBS volume encrypted?**
```bash
aws ec2 describe-volumes --filters Name=attachment.instance-id,Values=<instance-id> \
  --query 'Volumes[].{ID:VolumeId,Encrypted:Encrypted,Size:Size}'
```

**Is the instance managed by SSM?**
```bash
aws ssm describe-instance-information \
  --filters Key=InstanceIds,Values=<instance-id>
```

### Fixes

**Require IMDSv2.** First check that nothing still uses IMDSv1. The instance's `MetadataNoToken` CloudWatch metric should be 0, and AWS SDKs older than about 2019 don't support IMDSv2.
```bash
aws ec2 modify-instance-metadata-options --instance-id <instance-id> \
  --http-tokens required --http-endpoint enabled --http-put-response-hop-limit 1
aws ec2 modify-instance-metadata-defaults --http-tokens required    # default for new instances in this region
```
A hop limit of `1` stops Docker containers on the default bridge network from reaching the metadata service, and with it the instance's IAM credentials. Use `2` only if your containers need those credentials.

**Close ports that are open to the whole internet**
```bash
aws ec2 revoke-security-group-ingress --group-id <sg-id> --protocol tcp --port 22 --cidr 0.0.0.0/0
aws ec2 revoke-security-group-ingress --group-id <sg-id> \
  --ip-permissions 'IpProtocol=tcp,FromPort=22,ToPort=22,Ipv6Ranges=[{CidrIpv6=::/0}]'   # the IPv6 rule
aws ec2 authorize-security-group-ingress --group-id <sg-id> --protocol tcp --port 22 --cidr <your-ip>/32
curl -s https://checkip.amazonaws.com     # shows your current public IP
```

**Replace SSH with Session Manager.** You get a shell over HTTPS with no inbound ports open, and AWS logs every session.
```bash
aws iam attach-role-policy --role-name <instance-role> \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws ssm start-session --target <instance-id>      # needs the Session Manager plugin installed locally
```
Once that works, remove the port 22 rule from the security group.

If the instance has no role yet, attach an instance profile:
```bash
aws ec2 associate-iam-instance-profile --instance-id <instance-id> --iam-instance-profile Name=<profile-name>
```

**Trim an instance role that has too much access**
```bash
aws iam list-attached-role-policies --role-name <instance-role>
aws iam detach-role-policy --role-name <instance-role> --policy-arn <policy-arn>
```

**Encrypt EBS volumes.** Turning on default encryption only affects new volumes in that region. An existing volume can't be encrypted in place, so copy its snapshot with encryption and swap the volume.
```bash
aws ec2 enable-ebs-encryption-by-default
aws ec2 create-snapshot --volume-id <volume-id>
aws ec2 copy-snapshot --source-region <region> --source-snapshot-id <snapshot-id> --encrypted
aws ec2 create-volume --snapshot-id <encrypted-snapshot-id> --availability-zone <az>
```
Then stop the instance, detach the old volume, attach the new one under the same device name, and start the instance.

**Move secrets out of user data.** Anything that could read the metadata service could see them, so rotate them too. Store them in SSM Parameter Store (as `SecureString`) or Secrets Manager, and read them when the server boots:
```bash
aws ssm get-parameter --name /myapp/db-password --with-decryption --query Parameter.Value --output text
```
To edit or clear the user data, stop the instance, then use the console: **Actions → Instance settings → Edit user data**.

**Get the SSM agent running.** It needs an instance role with `AmazonSSMManagedInstanceCore`, plus outbound HTTPS (443) to the `ssm`, `ssmmessages` and `ec2messages` endpoints. In a private subnet with no NAT gateway, that means VPC endpoints.
```bash
sudo systemctl enable --now amazon-ssm-agent
```

**Fix the clock**
```bash
sudo systemctl restart chronyd
sudo chronyc makestep      # correct the time immediately instead of slowly
```

**Turn on AWS threat detection and vulnerability scanning.** GuardDuty watches for attacks. Inspector scans EC2 instances and ECR images for known vulnerabilities.
```bash
aws guardduty create-detector --enable
aws inspector2 enable --resource-types EC2 ECR
```

---

## 2. Docker

### Daemon and host

**Docker version and daemon settings.** Check `Security Options` for seccomp, SELinux, AppArmor and rootless mode, and check the `Logging Driver` line.
```bash
docker version
docker info
```

**Who is in the `docker` group.** Membership is root-equivalent, because any member can start a container that mounts the host's `/`.
```bash
getent group docker
```

**Daemon configuration**, including log rotation, user namespaces and the live-restore setting
```bash
cat /etc/docker/daemon.json
```

**Disk space used by images, containers, volumes and build cache**
```bash
docker system df
docker system df -v      # per-item breakdown
```

**Oversized container log files.** The default `json-file` log driver doesn't rotate unless `max-size` is set in `daemon.json`.
```bash
sudo find /var/lib/docker/containers -name '*-json.log' -size +100M -exec ls -lh {} \;
```

### Containers

**Running containers**
```bash
docker ps
```

**All containers, including stopped ones**
```bash
docker ps -a
docker ps -a --filter status=exited
```

**Live CPU, memory and network use per container**
```bash
docker stats --no-stream
```

**Status, health and restart count for every container.** A high restart count means a container is crash-looping.
```bash
docker inspect --format '{{.Name}}  status={{.State.Status}}  restarts={{.RestartCount}}  health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $(docker ps -aq)
```

**Published ports.** Anything mapped as `0.0.0.0:PORT` is reachable from outside the host, and Docker's iptables rules bypass firewalld and ufw. Bind to `127.0.0.1:PORT:PORT` when only the host itself needs to reach the port.
```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

**Container logs**
```bash
docker logs --tail 100 <container>
docker logs --since 1h -f <container>     # follow output from the last hour
```

**Processes running inside a container**
```bash
docker top <container>
```

**Files added (A), changed (C) or deleted (D) inside a container since it started.** Unexpected changes can point to a compromise.
```bash
docker diff <container>
```

**Recent daemon events: starts, stops, kills, out-of-memory kills**
```bash
docker events --since 1h --until now
```

**Open a shell inside a container**
```bash
docker exec -it <container> sh
```

### Container security

**Privileged containers, the user each container runs as, and network mode.** An empty `user=` means the container runs as root. `privileged=true` or `network=host` removes most of the isolation.
```bash
docker inspect --format '{{.Name}}  privileged={{.HostConfig.Privileged}}  user={{.Config.User}}  network={{.HostConfig.NetworkMode}}  capAdd={{.HostConfig.CapAdd}}' $(docker ps -q)
```

**Containers with the Docker socket mounted.** These have full control of the host.
```bash
docker inspect --format '{{.Name}} {{range .Mounts}}{{.Source}}->{{.Destination}} {{end}}' $(docker ps -q) | grep docker.sock
```

**All host paths mounted into containers**
```bash
docker inspect --format '{{.Name}} {{range .Mounts}}{{.Type}}:{{.Source}}->{{.Destination}}(rw={{.RW}}) {{end}}' $(docker ps -q)
```

**Environment variables.** Warning: this prints any secrets passed in as environment variables, so don't paste the output anywhere.
```bash
docker inspect --format '{{.Name}} {{.Config.Env}}' <container>
```

**Scan images for known vulnerabilities.** Requires Trivy or Docker Scout to be installed.
```bash
trivy image <image:tag>
docker scout cves <image:tag>
```

### Images, networks and volumes

```bash
docker image ls                          # local images and their sizes
docker image ls --filter dangling=true   # untagged leftovers from old builds
docker network ls                        # Docker networks
docker network inspect <network>         # which containers are attached
docker volume ls                         # named volumes
```

### Docker Compose

Run these from the directory that contains `compose.yaml` or `docker-compose.yml`.
```bash
docker compose ps
docker compose logs --tail 100 -f <service>
docker compose config        # the fully resolved configuration after variable substitution
```

### Cleanup (destructive)

These delete data, so review what they will remove first.
```bash
docker container prune       # remove stopped containers
docker image prune           # remove dangling images
docker system prune          # stopped containers, unused networks, dangling images, build cache
```
Leave out `--volumes` unless you mean to delete volume data. `docker system prune -a --volumes` also removes every unused image and every unused volume, including database data.

### Fixes

**Remove a user from the `docker` group.** This takes effect at their next login. On a developer machine, consider rootless Docker, which runs the daemon without root.
```bash
sudo gpasswd -d <username> docker
```

**Harden the daemon.** Put this in `/etc/docker/daemon.json`, merging it with any settings already in the file:
```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true,
  "no-new-privileges": true,
  "icc": false
}
```
- `log-opts` keeps each container's logs to three files of 10 MB.
- `live-restore` keeps containers running while the daemon restarts.
- `no-new-privileges` stops processes inside containers from gaining privileges, for example through SUID binaries.
- `icc: false` blocks container-to-container traffic on the default bridge network. Containers on user-defined networks, such as the ones Compose creates, are not affected.

Check the file and apply it:
```bash
sudo dockerd --validate --config-file /etc/docker/daemon.json
sudo systemctl restart docker
docker compose up -d --force-recreate     # log settings only apply to containers created after the change
```

**Empty an oversized log file right away**, as a stopgap until rotation is configured
```bash
sudo truncate -s 0 "$(docker inspect --format '{{.LogPath}}' <container>)"
```

**Keep published ports private.** Bind to localhost and put a reverse proxy (nginx, Caddy) or an AWS load balancer in front:
```bash
docker run -p 127.0.0.1:8080:8080 <image>
```
In Compose, the equivalent is `ports: ["127.0.0.1:8080:8080"]`.

**Filter published ports with Docker's iptables chain.** Docker checks the `DOCKER-USER` chain before its own rules. Run these two commands in this order, so that the rule allowing reply traffic ends up first:
```bash
sudo iptables -I DOCKER-USER -i <external-interface> ! -s <allowed-cidr> -j DROP
sudo iptables -I DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
```
These rules disappear on reboot unless you save them, for example with `iptables-services`. On AWS, the security group is usually the simpler place to filter.

**Run containers with least privilege**
```bash
docker run -d --name app \
  --user 1000:1000 \
  --read-only --tmpfs /tmp \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --memory 512m --cpus 1 --pids-limit 200 \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  myapp:1.2.3
```
Add `--cap-add NET_BIND_SERVICE` only if the app must listen on a port below 1024. Remove `--privileged` and `--network host` unless there is no other way.

The same settings in Compose:
```yaml
services:
  app:
    image: myapp:1.2.3
    user: "1000:1000"
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    mem_limit: 512m
    pids_limit: 200
    restart: unless-stopped
    ports: ["127.0.0.1:8080:8080"]
```

**Run as a non-root user inside the image.** Add this to the Dockerfile:
```dockerfile
RUN useradd --system --uid 10001 --no-create-home app    # Debian/Ubuntu-based images
# RUN adduser -S -u 10001 app                            # Alpine-based images
USER app
```

**Remove Docker socket mounts.** Mounting the socket with `:ro` does **not** make it safe, because the API still accepts commands. If a tool such as Traefik or a monitoring agent really needs the Docker API, give it a socket proxy that only allows the endpoints it uses.

**Move secrets out of environment variables.** Anyone who can run `docker inspect` can read environment variables. Build arguments are also visible in `docker history`. Use Compose secrets instead. The app reads the value from the file `/run/secrets/db_password`.
```yaml
services:
  app:
    secrets: [db_password]
secrets:
  db_password:
    file: ./secrets/db_password.txt
```
Rotate any secret that was previously passed in as an environment variable.

**Fix vulnerable images.** Rebuild on an up-to-date base image, then recreate the containers. Pin exact versions, prefer small base images (`-slim`, Alpine, distroless) and rebuild regularly.
```bash
docker build --pull --no-cache -t myapp:1.2.4 .
docker compose pull && docker compose up -d
trivy image --exit-code 1 --severity CRITICAL,HIGH myapp:1.2.4    # in CI: fails the build on serious findings
```

**Find out why a container keeps restarting.** Exit code 137 with `OOMKilled=true` means it ran out of memory. Raise its memory limit or fix the leak.
```bash
docker inspect --format '{{.Name}} exit={{.State.ExitCode}} OOMKilled={{.State.OOMKilled}}' <container>
docker logs --tail 100 <container>
```

**Handle a compromised container**
```bash
docker pause <container>                                  # freeze it without losing its state
docker commit <container> evidence/<container>:<date>     # save its filesystem as an image
docker logs <container> > /root/evidence-<container>.log 2>&1
docker rm -f <container>
```
Then redeploy from a clean image and rotate its secrets. If the container was privileged or had the Docker socket mounted, assume the host is compromised as well, and follow the incident steps in [vulnerability-audit.md](vulnerability-audit.md#1-malware-and-integrity).

**Keep Docker itself up to date**
```bash
sudo dnf upgrade docker                     # Amazon Linux
sudo apt install --only-upgrade docker-ce   # Docker's own repository on Ubuntu
```

