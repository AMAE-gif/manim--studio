FROM node:20-slim AS frontend-builder

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
# VITE_API_BASE_URL is empty → frontend uses relative paths, same origin as backend
RUN VITE_API_BASE_URL="" npm run build


FROM python:3.11-slim

# System deps: FFmpeg + minimal LaTeX + Cairo/Pango (for Text/Markup)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ \
    ffmpeg \
    texlive-latex-base texlive-latex-recommended \
    libcairo2-dev libpango1.0-dev pkg-config \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f -v

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
RUN mkdir -p /app/renders

# Copy frontend dist from builder stage
# main.py resolves: Path(__file__).parent.parent / "frontend" / "dist" = /frontend/dist
COPY --from=frontend-builder /build/dist /frontend/dist

EXPOSE 8000
COPY backend/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
