#!/bin/bash

# Install script for SnapRAID Web Manager dependencies
# Run this from the project root directory

echo "Installing frontend dependencies..."
cd frontend
npm install

echo "Installing backend dependencies..."
cd ../backend
# Deno loads dependencies on demand, but we can cache them
deno cache src/main.ts

echo "Installation complete."