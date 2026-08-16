FROM python:3.13-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends iputils-ping \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY index.html style.css app.js auth.js server.py ./

RUN mkdir -p /data

ENV DASHBOARD_HOST=0.0.0.0 \
    DASHBOARD_PORT=8080 \
    DASHBOARD_DB=/data/dashboard.db \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8080

CMD ["python3", "/app/server.py"]
