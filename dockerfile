# Используем официальный образ Node.js
FROM node:18-alpine

# Создаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем остальные файлы проекта
COPY . .

# Порт, который будет использовать приложение
EXPOSE 8080

# Устанавливаем зависимости + ts-node
RUN npm install && npm install -g ts-node

# Запускаем в dev-режиме
CMD ["npm", "run", "dev"]