FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

# Копируем ВСЁ
COPY . .

# Отладка: что есть в контейнере?
RUN ls -la
RUN ls -la src

# Собираем
RUN npm run build

# Проверяем результат
RUN ls -la dist

EXPOSE 3000
CMD ["node", "dist/index.js"]