FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application source code
COPY . .

# Set default cloud runtime port to 8080
ENV PORT=8080
EXPOSE 8080

# Run Express server
CMD ["node", "server.js"]
