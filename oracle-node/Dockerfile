FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY oracle.config.json ./
COPY src ./src

RUN npm install --no-audit --no-fund \
 && npx tsc -p tsconfig.json \
 && npm prune --omit=dev

EXPOSE 4001

CMD ["node", "dist/index.js"]
