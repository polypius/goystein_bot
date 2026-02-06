FROM python:3.11-slim AS backend

WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY bot/ bot/

FROM node:20-slim AS frontend-build

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY frontend/ .
RUN npm run build

FROM python:3.11-slim

WORKDIR /app
COPY --from=backend /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=backend /usr/local/bin /usr/local/bin
COPY bot/ bot/
COPY --from=frontend-build /app/build /app/static

EXPOSE 8000
CMD ["python", "-m", "bot.main"]
