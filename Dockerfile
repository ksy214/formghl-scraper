FROM node:20-slim

RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libfontconfig1 \
    fontconfig \
    fonts-liberation \
    fonts-noto-color-emoji \
    --no-install-recommends \
    && fc-cache -f -v \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install
RUN npx playwright install chromium

COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
