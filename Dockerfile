# syntax=docker/dockerfile:1

# --- Build the frontend (Vite + React) ---
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json vite.config.ts index.html .env ./
COPY public ./public
COPY src ./src
RUN npm run build

# --- Runtime image: Python backend (desktop/) + ffmpeg + built frontend ---
FROM python:3.12-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY desktop ./desktop
COPY --from=frontend-build /app/dist ./dist

# desktop/app.py serves dist/ + the JSON API + media over plain HTTP; put a
# reverse proxy in front for TLS. NO_BROWSER skips webbrowser.open(), which
# would otherwise error with nothing registered to launch it in a container.
ENV VIDGRID_HOST=0.0.0.0 \
    VIDGRID_PORT=8000 \
    VIDGRID_NO_BROWSER=1

EXPOSE 8000
CMD ["python", "-m", "desktop.app"]
