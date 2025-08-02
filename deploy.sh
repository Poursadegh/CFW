#!/bin/bash

set -e

echo "🚀 Starting AI Itinerary Generator Deployment..."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
    print_status "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    if ! command -v wrangler &> /dev/null; then
        print_warning "Wrangler CLI not found. Installing..."
        npm install -g wrangler
    fi
    
    print_status "Dependencies check passed ✓"
}

install_dependencies() {
    print_status "Installing backend dependencies..."
    npm install
    
    print_status "Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
}

setup_env() {
    if [ ! -f ".env" ]; then
        print_warning ".env file not found. Creating from template..."
        if [ -f "env.example" ]; then
            cp env.example .env
            print_status "Created .env file from template"
            print_warning "Please edit .env file with your actual API keys before deploying"
        else
            print_error "env.example file not found. Please create .env file manually"
            exit 1
        fi
    else
        print_status ".env file found ✓"
    fi
}

deploy_worker() {
    print_status "Deploying Cloudflare Worker..."
    
    if [ "$1" = "local" ]; then
        print_status "Deploying to local environment (using .env file)..."
        wrangler deploy --env local
    else
        print_status "Deploying to production environment (using secrets)..."
        
        if ! wrangler secret list | grep -q "FIREBASE_SERVICE_ACCOUNT_KEY"; then
            print_warning "FIREBASE_SERVICE_ACCOUNT_KEY not found. Please set it manually:"
            echo "wrangler secret put FIREBASE_SERVICE_ACCOUNT_KEY"
            echo "Then paste your Firebase service account JSON"
        fi
        
        if ! wrangler secret list | grep -q "OPENAI_API_KEY"; then
            print_warning "OPENAI_API_KEY not found. Please set it manually:"
            echo "wrangler secret put OPENAI_API_KEY"
            echo "Then enter your OpenAI API key"
        fi
        
        print_status "Deploying to development environment..."
        wrangler deploy --env development
        
        print_status "Deploying to production environment..."
        wrangler deploy --env production
    fi
    
    print_status "Cloudflare Worker deployed successfully ✓"
}

deploy_frontend() {
    print_status "Building frontend..."
    cd frontend
    npm run build
    cd ..
    
    print_status "Frontend built successfully ✓"
    print_warning "Please deploy the frontend/dist folder to Cloudflare Pages manually"
    print_warning "Or use the Cloudflare Pages CLI if available"
}

update_api_url() {
    local worker_url=$1
    
    if [ -z "$worker_url" ]; then
        print_warning "Please provide your Cloudflare Worker URL to update the frontend"
        print_warning "Example: ./deploy.sh https://ai-itinerary-generator.your-subdomain.workers.dev"
        return
    fi
    
    print_status "Updating API URL in frontend..."
    
    sed -i "s|https://ai-itinerary-generator.your-subdomain.workers.dev|$worker_url|g" frontend/src/App.svelte
    
    print_status "API URL updated ✓"
}

main() {
    local worker_url=$1
    local env_type=${2:-production}
    
    print_status "Starting deployment process..."
    
    check_dependencies
    install_dependencies
    
    if [ "$env_type" = "local" ]; then
        setup_env
    fi
    
    if [ ! -z "$worker_url" ]; then
        update_api_url "$worker_url"
    fi
    
    deploy_worker "$env_type"
    deploy_frontend
    
    print_status "🎉 Deployment completed!"
    print_status "Next steps:"
    echo "1. Deploy the frontend/dist folder to Cloudflare Pages"
    echo "2. Test the API endpoints"
    echo "3. Update the API URL in frontend/src/App.svelte if needed"
    echo ""
    print_status "API Endpoints:"
    echo "- POST /generate - Generate itinerary"
    echo "- GET /status/{jobId} - Check status"
    echo "- GET / - API info"
    echo ""
    if [ "$env_type" = "local" ]; then
        print_warning "Local deployment completed. Make sure your .env file has the correct API keys."
    fi
}

main "$@" 