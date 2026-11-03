#!/bin/bash

# Install script for SnapRAID Web Manager dependencies
# Run this from the project root directory

echo "Installing frontend dependencies..."
cd frontend
bun install

echo "Installing backend dependencies..."
cd ../backend
bun install

echo "Installation complete."