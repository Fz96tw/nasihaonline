FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && rm -rf .next && npm run build && npm run start"]
