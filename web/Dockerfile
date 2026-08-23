FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

COPY . .

# Build-time only — `prisma generate` just needs a well-formed value (no live
# connection), and `next build` inlines NEXT_PUBLIC_* into client bundles.
# The real values are supplied again at container start via `environment:`,
# which overrides these.
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL=/accept-invite
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/whats-new
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL=/
ARG NEXT_PUBLIC_APP_URL
ENV DATABASE_URL=$DATABASE_URL \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL \
    NEXT_PUBLIC_CLERK_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_URL \
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL \
    NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN npx prisma generate

# next build's type-check pass on this app's size needs a bigger heap than
# Node's default (~2GB) or it OOMs mid-build.
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && npm run start"]
