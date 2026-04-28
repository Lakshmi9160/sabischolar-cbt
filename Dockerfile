# --- Frontend (Vite) ---
FROM node:20-bookworm AS frontend-build
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Backend (TypeScript → dist) ---
FROM node:20-bookworm AS backend-build
WORKDIR /be
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

# --- Runtime ---
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV DB_PATH=./data/cbt.sqlite
ENV FRONTEND_DIST=/app/static

COPY --from=backend-build /be/package.json /be/package-lock.json ./
COPY --from=backend-build /be/node_modules ./node_modules
COPY --from=backend-build /be/dist ./dist
COPY --from=frontend-build /fe/dist ./static

RUN mkdir -p /app/data

EXPOSE 4000
CMD ["node", "dist/index.js"]
