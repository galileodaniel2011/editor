FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY public ./public
ENV PORT=3100 DATA_DIR=/data
EXPOSE 3100
CMD ["node", "server.js"]
