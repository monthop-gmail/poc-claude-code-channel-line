FROM node:22-slim

# Install bun + claude + expect
RUN apt-get update -qq && apt-get install -y --no-install-recommends expect && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code bun --no-update-notifier

# Use existing 'node' user (uid 1000, matches host pi user)
WORKDIR /home/node/app
COPY package.json .mcp.json ./
RUN bun install --frozen-lockfile
COPY line.ts ./
COPY entrypoint.exp /entrypoint.exp
RUN chmod +x /entrypoint.exp && chown -R node:node /home/node/app

USER node

EXPOSE 3000

ENTRYPOINT ["/entrypoint.exp"]
