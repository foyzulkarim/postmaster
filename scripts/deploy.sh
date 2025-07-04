#!/bin/bash

# Postmaster Production Deployment Script
set -e

echo "🚀 Starting Postmaster deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="postmaster"
APP_DIR="/opt/postmaster"
SERVICE_USER="postmaster"
BACKUP_DIR="/opt/postmaster/backups"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   log_error "This script should not be run as root for security reasons"
   exit 1
fi

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    # Check PM2
    if ! command -v pm2 &> /dev/null; then
        log_error "PM2 is not installed. Install with: npm install -g pm2"
        exit 1
    fi
    
    # Check Redis
    if ! command -v redis-cli &> /dev/null; then
        log_warning "Redis CLI not found. Make sure Redis server is running"
    else
        if ! redis-cli ping &> /dev/null; then
            log_error "Redis server is not responding"
            exit 1
        fi
    fi
    
    log_success "Prerequisites check passed"
}

# Backup current deployment
backup_current() {
    if [ -d "$APP_DIR" ]; then
        log_info "Creating backup of current deployment..."
        
        # Create backup directory
        mkdir -p "$BACKUP_DIR"
        
        # Create timestamped backup
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        BACKUP_PATH="$BACKUP_DIR/backup_$TIMESTAMP"
        
        # Backup database
        if [ -f "$APP_DIR/data/postmaster.db" ]; then
            mkdir -p "$BACKUP_PATH/data"
            cp "$APP_DIR/data/postmaster.db" "$BACKUP_PATH/data/"
            log_success "Database backed up to $BACKUP_PATH/data/"
        fi
        
        # Backup environment file
        if [ -f "$APP_DIR/.env.production" ]; then
            cp "$APP_DIR/.env.production" "$BACKUP_PATH/"
            log_success "Environment file backed up"
        fi
        
        # Keep only last 5 backups
        cd "$BACKUP_DIR"
        ls -t | tail -n +6 | xargs -r rm -rf
        
        log_success "Backup completed: $BACKUP_PATH"
    fi
}

# Deploy application
deploy_app() {
    log_info "Deploying application..."
    
    # Create app directory if it doesn't exist
    sudo mkdir -p "$APP_DIR"
    sudo chown $USER:$USER "$APP_DIR"
    
    # Navigate to app directory
    cd "$APP_DIR"
    
    # Pull latest code (assuming git repository)
    if [ -d ".git" ]; then
        log_info "Pulling latest code from repository..."
        git pull origin main
    else
        log_info "Cloning repository..."
        # Replace with your actual repository URL
        # git clone https://github.com/your-username/postmaster.git .
        log_warning "Please clone your repository to $APP_DIR"
    fi
    
    # Install dependencies
    log_info "Installing dependencies..."
    npm ci --only=production
    
    # Build application
    log_info "Building application..."
    npm run build
    
    log_success "Application deployed"
}

# Setup database
setup_database() {
    log_info "Setting up database..."
    
    cd "$APP_DIR"
    
    # Create data directory
    mkdir -p data
    
    # Run database migrations
    log_info "Running database migrations..."
    npx prisma migrate deploy
    
    # Seed production database if it's a fresh install
    if [ ! -f "data/postmaster.db" ] || [ ! -s "data/postmaster.db" ]; then
        log_info "Seeding production database..."
        npx ts-node scripts/seed-production.ts
    fi
    
    log_success "Database setup completed"
}

# Configure PM2
configure_pm2() {
    log_info "Configuring PM2..."
    
    cd "$APP_DIR"
    
    # Stop existing PM2 processes
    pm2 stop $APP_NAME 2>/dev/null || true
    pm2 delete $APP_NAME 2>/dev/null || true
    
    # Start application with PM2
    pm2 start ecosystem.config.js --env production
    
    # Save PM2 configuration
    pm2 save
    
    # Setup PM2 startup script
    pm2 startup | grep -E '^sudo' | bash || true
    
    log_success "PM2 configured and application started"
}

# Setup log rotation
setup_log_rotation() {
    log_info "Setting up log rotation..."
    
    # Create logrotate configuration
    sudo tee /etc/logrotate.d/postmaster > /dev/null <<EOF
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
    
    log_success "Log rotation configured"
}

# Setup monitoring
setup_monitoring() {
    log_info "Setting up monitoring..."
    
    # Install PM2 monitoring (optional)
    if command -v pm2 &> /dev/null; then
        pm2 install pm2-logrotate
        pm2 set pm2-logrotate:max_size 10M
        pm2 set pm2-logrotate:retain 30
        pm2 set pm2-logrotate:compress true
    fi
    
    log_success "Monitoring configured"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Wait for application to start
    sleep 5
    
    # Check if PM2 process is running
    if pm2 list | grep -q "$APP_NAME.*online"; then
        log_success "PM2 process is running"
    else
        log_error "PM2 process is not running"
        pm2 logs $APP_NAME --lines 20
        exit 1
    fi
    
    # Check health endpoint
    if command -v curl &> /dev/null; then
        if curl -f http://localhost:3000/api/v1/health > /dev/null 2>&1; then
            log_success "Health check passed"
        else
            log_error "Health check failed"
            exit 1
        fi
    fi
    
    log_success "Deployment verification completed"
}

# Main deployment process
main() {
    log_info "Starting Postmaster deployment process..."
    
    check_prerequisites
    backup_current
    deploy_app
    setup_database
    configure_pm2
    setup_log_rotation
    setup_monitoring
    verify_deployment
    
    log_success "🎉 Postmaster deployment completed successfully!"
    log_info "Application is running at: http://localhost:3000"
    log_info "Health check: http://localhost:3000/api/v1/health"
    log_info "PM2 status: pm2 status"
    log_info "PM2 logs: pm2 logs $APP_NAME"
    log_info "PM2 monitoring: pm2 monit"
    
    echo ""
    log_warning "Next steps:"
    echo "1. Update .env.production with your actual webhook URLs"
    echo "2. Test the API endpoints"
    echo "3. Configure your LMS to use the Postmaster API"
    echo "4. Set up external monitoring (optional)"
}

# Run main function
main "$@"
