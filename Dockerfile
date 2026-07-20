# APIVerve CLI — the containerized, zero-install form of the same `apiverve` command
# published to npm. The catalog is baked into manifest.json at build time, so the only
# runtime network call is the API request itself.
FROM node:20-alpine

LABEL org.opencontainers.image.title="APIVerve CLI" \
      org.opencontainers.image.description="Call 350+ APIVerve APIs from one command." \
      org.opencontainers.image.url="https://apiverve.com" \
      org.opencontainers.image.source="https://github.com/apiverve/cli" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app
# Zero runtime dependencies by design — no `npm install` step, nothing to audit.
COPY bin ./bin
COPY src ./src
COPY manifest.json package.json README.md LICENSE ./

# Run as the built-in unprivileged user.
USER node

ENTRYPOINT ["node", "/app/bin/apiverve.js"]
CMD ["--help"]
