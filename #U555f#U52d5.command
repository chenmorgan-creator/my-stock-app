#!/bin/bash
cd "$(dirname "$0")"

echo "================================================"
echo "  Starting website (pure frontend, no backend needed)"
echo "================================================"
echo ""
echo "Installing dependencies, this may take 1-2 minutes on first run..."
npm install
if [ $? -ne 0 ]; then
    echo ""
    echo "npm install failed. Please make sure Node.js is installed:"
    echo "https://nodejs.org/"
    read -p "Press Enter to close..."
    exit 1
fi

echo ""
echo "Starting the website, your browser should open automatically..."
echo "If not, open this address manually: http://localhost:5173"
echo ""
echo "To stop the website, close this window or press Ctrl+C."
echo "================================================"

(sleep 5 && open http://localhost:5173) &
npm run dev

read -p "Press Enter to close..."
