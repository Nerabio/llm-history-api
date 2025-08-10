# Используем официальный образ Node.js
FROM node:20-alpine

# Создаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install --include=dev --force

# Копируем остальные файлы
COPY . .

# Собираем TypeScript (если нужно)
RUN npm run build

# Открываем порт, на котором работает Fastify
EXPOSE 3000

# Запускаем сервер
CMD ["npm", "run", "dev"]