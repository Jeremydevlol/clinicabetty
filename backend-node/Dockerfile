FROM node:20-alpine

WORKDIR /app

# git es necesario: baileys instala dependencias desde repos git (libsignal).
RUN apk add --no-cache git

# Cache de dependencias.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Código de la app.
COPY server.js plugins.mjs ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]
