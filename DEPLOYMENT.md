# Deployment Guide

This guide covers deploying Vital-Sign to various platforms.

## Table of Contents
- [Docker (Recommended)](#docker)
- [Heroku](#heroku)
- [AWS EC2](#aws-ec2)
- [Self-Hosted VPS](#self-hosted-vps)

---

## Docker

### Prerequisites
- Docker installed
- Docker Compose installed

### Quick Start

```bash
# Clone repository
git clone https://github.com/nausherwannasir/Vital-Sign.git
cd Vital-Sign

# Start with Docker Compose
docker-compose up -d

# Access services
# Backend: http://localhost:3000
# Frontend: http://localhost:3001

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Stop services
docker-compose down
```

### Production Configuration

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - "3000:3000"
    environment:
      - FLASK_ENV=production
      - FLASK_DEBUG=False
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "80:3001"
    depends_on:
      - backend
    restart: always
```

Deploy:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

---

## Heroku

### Prerequisites
- Heroku account
- Heroku CLI installed

### Setup

1. **Create Heroku app:**
```bash
heroku create vital-sign-demo
```

2. **Create Procfile:**
```
web: cd backend && gunicorn --worker-class=sync -w 4 -b 0.0.0.0:$PORT app:app
```

3. **Add requirements:**
```bash
echo "gunicorn" >> backend/requirements.txt
```

4. **Configure environment:**
```bash
heroku config:set FLASK_ENV=production
heroku config:set FLASK_DEBUG=False
```

5. **Deploy:**
```bash
git push heroku main
```

6. **View logs:**
```bash
heroku logs --tail
```

---

## AWS EC2

### Prerequisites
- AWS account
- EC2 instance (Ubuntu 20.04+)
- Security group with ports 80, 443 open

### Setup

1. **Connect to instance:**
```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

2. **Install dependencies:**
```bash
sudo apt update
sudo apt install -y python3-pip python3-venv nodejs npm docker.io docker-compose
sudo usermod -aG docker ubuntu
```

3. **Clone repository:**
```bash
git clone https://github.com/nausherwannasir/Vital-Sign.git
cd Vital-Sign
```

4. **Configure Nginx (reverse proxy):**
```bash
sudo apt install -y nginx
```

Create `/etc/nginx/sites-available/vital-sign`:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

5. **Enable SSL (Let's Encrypt):**
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

6. **Start services:**
```bash
docker-compose up -d
sudo systemctl start nginx
```

---

## Self-Hosted VPS

### Prerequisites
- VPS with public IP
- SSH access
- Root/sudo privileges

### Setup

1. **Initial setup:**
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential

# Install Python
sudo apt install -y python3 python3-pip python3-venv

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.0.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

2. **Setup application:**
```bash
cd /opt
git clone https://github.com/nausherwannasir/Vital-Sign.git vital-sign
cd vital-sign

# Configure environment
cp .env.example .env
nano .env  # Edit as needed
```

3. **Create systemd service:**
```bash
sudo nano /etc/systemd/system/vital-sign.service
```

```ini
[Unit]
Description=Vital-Sign Heart Rate Monitor
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/vital-sign
ExecStart=/usr/local/bin/docker-compose up
Restart=always

[Install]
WantedBy=multi-user.target
```

4. **Start service:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable vital-sign
sudo systemctl start vital-sign
```

5. **Setup Nginx:**
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Edit `/etc/nginx/sites-available/vital-sign`:
```nginx
upstream backend {
    server localhost:3000;
}

upstream frontend {
    server localhost:3001;
}

server {
    listen 80;
    server_name your-domain.com;

    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /predict {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /health {
        proxy_pass http://backend;
    }
}
```

6. **Enable SSL:**
```bash
sudo certbot certonly --nginx -d your-domain.com
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## Monitoring

### Health Check
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "config": {
    "min_signal_length": 50,
    "sampling_rate": 30,
    "frequency_range": [0.8, 3.0]
  }
}
```

### Log Monitoring
```bash
# Docker
docker-compose logs -f

# Systemd
sudo journalctl -u vital-sign -f

# Nginx
sudo tail -f /var/log/nginx/error.log
```

### Performance Monitoring

```bash
# CPU/Memory usage
docker stats

# Top processes
top

# Disk usage
df -h

# Network connections
netstat -an | grep ESTABLISHED
```

---

## Troubleshooting

### Port Already in Use
```bash
# Find process on port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Docker Issues
```bash
# Rebuild images
docker-compose build --no-cache

# Remove old containers
docker system prune -a

# Check logs
docker-compose logs backend
```

### SSL Certificate Issues
```bash
# Renew certificate
sudo certbot renew

# Force renewal
sudo certbot renew --force-renewal
```

---

## Scaling

### Load Balancing
Use Nginx to distribute requests:

```nginx
upstream backend_pool {
    least_conn;
    server backend1:3000;
    server backend2:3000;
    server backend3:3000;
}
```

### Database Integration
For high-traffic deployments, add database:

```yaml
postgres:
  image: postgres:14
  environment:
    POSTGRES_PASSWORD: secure-password
  volumes:
    - pgdata:/var/lib/postgresql/data
```

### Caching Layer
Add Redis for signal caching:

```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
```

---

## Maintenance

### Backup
```bash
# Backup database (if used)
docker exec postgres pg_dump -U postgres > backup.sql

# Backup configuration
cp .env .env.backup
```

### Updates
```bash
# Pull latest code
git pull origin main

# Rebuild images
docker-compose build --no-cache

# Restart services
docker-compose up -d
```

### Security Updates
```bash
# Update base images
docker pull python:3.10-slim
docker pull node:18-alpine

# Rebuild and restart
docker-compose build --no-cache
docker-compose down
docker-compose up -d
```

---

## Support

Need help? Open an issue or discussion on [GitHub](https://github.com/nausherwannasir/Vital-Sign).
