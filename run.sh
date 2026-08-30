#!/bin/bash
# Launches VidGrid: starts the local server and opens it in your browser.
# Used by the desktop shortcut (see desktop/vidgrid.desktop) but also fine
# to run directly.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -x .venv/bin/python ]; then
    echo "error: .venv not found. Set it up first (see README's Desktop App section):" >&2
    echo "  python -m venv .venv && .venv/bin/pip install -r requirements-desktop.txt" >&2
    exit 1
fi

if [ ! -d dist ]; then
    echo "error: dist/ not found. Build the frontend first:" >&2
    echo "  npm run build" >&2
    exit 1
fi

exec .venv/bin/python -m desktop.app
