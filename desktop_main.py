"""PyInstaller entry point -- thin wrapper so the frozen exe has a plain
top-level script to bootstrap from (desktop/app.py is a package module)."""

from desktop.app import main

if __name__ == "__main__":
    main()
