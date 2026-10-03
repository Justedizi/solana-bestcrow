FROM node:22.16.0-alpine@sha256:41e4389f3d988d2ed55392df4db1420ad048ae53324a8e2b7c6d19508288107e

WORKDIR /app
COPY rust/clients/js /app/rust/clients/js
COPY backend/package.json backend/package-lock.json backend/tsconfig.json /app/backend/
WORKDIR /app/backend
RUN npm ci --ignore-scripts --no-audit
RUN ln -s /app/backend/node_modules /app/node_modules
COPY backend/src /app/backend/src
COPY backend/test /app/backend/test
RUN npm run check
RUN npm test

ENV PORT=3001
EXPOSE 3001
USER node
CMD ["npm", "start"]
