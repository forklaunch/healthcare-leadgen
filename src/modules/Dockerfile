FROM node:23-alpine

# Set working directory
WORKDIR /uchicago-ideas

# Copy source code
COPY . .

# Install dependencies — pnpm pinned to v10: v11 (latest) rejects the
# workspace-yaml build-script approvals and breaks `pnpm install`
RUN npm install -g pnpm@10
RUN apk update
RUN apk add --no-cache libc6-compat
RUN apk add --no-cache git
RUN apk add --no-cache curl
RUN pnpm install

# Build TypeScript code

RUN pnpm build