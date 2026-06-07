FROM python:3.12-slim

WORKDIR /app

# 빌드 의존성 (pandas/scipy 휠 대부분 prebuilt이나 안전하게)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e . || pip install --no-cache-dir .

COPY engine ./engine

ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "engine.scheduler"]
