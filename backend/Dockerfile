FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY backend/package.json backend/package-lock.json* backend/
RUN cd backend && npm ci || npm install

FROM base AS build
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend/ ./backend/
COPY shared/ ./shared/
RUN cd backend && npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/src/db/migrations ./backend/dist/backend/src/db/migrations
WORKDIR /app/backend
EXPOSE 3001
CMD ["node", "dist/backend/src/index.js"]
