FROM node:18-alpine

WORKDIR /app

# Copy package manifests and lockfile
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the frontend source code
COPY . .

# Build the Next.js application
RUN npm run build

# Expose Next.js server port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]




