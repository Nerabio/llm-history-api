# Базовый образ для сборки
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./
COPY tsconfig.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY src ./src

# Собираем проект
RUN npm run build

# Финальный образ
FROM node:20-alpine

WORKDIR /app

# Копируем только необходимые файлы из builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist

# Устанавливаем только production зависимости
RUN npm install --production

# Открываем порт
EXPOSE 3000

# Команда для запуска
CMD ["node", "dist/index.js"]