#!/bin/bash

echo "Building portfolio for production..."
npm run build

if [ $? -eq 0 ]; then
    echo "Build successful! Checking dist directory..."
    ls -lh dist/
    
    echo "Checking index.html..."
    cat dist/index.html | head -20
    
    echo "Ready for Cloudflare Pages deployment"
    echo "Files to deploy:"
    find dist/ -type f -name "*.html" -o -name "*.js" -o -name "*.css" | head -10
else
    echo "Build failed!"
    exit 1
fi