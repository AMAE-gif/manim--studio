FROM python:3.11-slim

# System deps: FFmpeg + minimal LaTeX + Cairo/Pango (for Text/Markup)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ \
    ffmpeg \
    texlive-latex-base texlive-latex-recommended \
    libcairo2-dev libpango1.0-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
RUN mkdir -p /app/renders

EXPOSE 8000
COPY backend/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
