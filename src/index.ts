import fastify, { FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { Static, Type } from "@sinclair/typebox";
import db from "./db/client";
import { Message, Session } from "./types/message";

const app = fastify();

const start = async () => {
  try {
    await app.register(cors, {
      origin: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
    });
    await app.listen({ port: 3000, host: "0.0.0.0" });
    console.log(`Server listening on 3000`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Схемы валидации
const MessageSchema = Type.Object({
  chatId: Type.Union([Type.String(), Type.Number()]),
  role: Type.Union([
    Type.Literal("user"),
    Type.Literal("assistant"),
    Type.Literal("system"),
    Type.Literal("tool"),
  ]),
  content: Type.String(),
});

type MessageRequest = Static<typeof MessageSchema>;

// Схема для параметров
const ParamsSchema = Type.Object({
  id: Type.Union([Type.String(), Type.Number()]),
});

// Тип из схемы
type ParamsType = Static<typeof ParamsSchema>;

// Унифицированный POST /messages (создаёт сессию при необходимости)
app.post(
  "/messages",
  {
    schema: {
      body: MessageSchema,
      response: {
        200: Type.Object({
          message_id: Type.Number(),
          session_id: Type.Number(),
        }),
      },
    },
  },
  async (req: FastifyRequest<{ Body: MessageRequest }>, reply) => {
    const { chatId, role, content } = req.body;

    // 1. Находим или создаем сессию
    let session = db
      .prepare("SELECT id FROM sessions WHERE chat_id = ?")
      .get(chatId) as Session | undefined;

    if (!session) {
      const stmt = db.prepare("INSERT INTO sessions (chat_id) VALUES (?)");
      const info = stmt.run(String(chatId));
      session = { id: info.lastInsertRowid } as Session;
    }

    // 2. Добавляем сообщение
    const stmt = db.prepare(
      "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)"
    );
    const info = stmt.run(session.id, role, content);

    return {
      message_id: Number(info.lastInsertRowid),
      session_id: Number(session.id),
    };
  }
);

// // Создание сессии (POST /sessions/:id)
// app.post(
//   "/sessions/:id",
//   {
//     schema: {
//       params: ParamsSchema,
//       response: {
//         200: Type.Object({
//           id: Type.Number(),
//         }),
//       },
//     },
//   },
//   async (req: FastifyRequest<{ Params: ParamsType }>, reply) => {
//     const { id } = req.params;
//     const newSession = db.prepare("INSERT INTO sessions DEFAULT VALUES").run();
//     return {
//       session_id: Number(newSession.lastInsertRowid),
//     };
//   }
// );

// Получение всех сообщений сессии (GET /sessions/:id)
app.get(
  "/sessions/:id",
  {
    schema: {
      params: ParamsSchema,
      response: {
        200: Type.Array(
          Type.Object({
            id: Type.Number(),
            role: Type.String(),
            content: Type.String(),
            created_at: Type.String(),
          })
        ),
      },
    },
  },
  async (req: FastifyRequest<{ Params: ParamsType }>, reply) => {
    const { id } = req.params;
    return db
      .prepare(
        `
        SELECT m.id, m.role, m.content, m.created_at 
        FROM messages m
        JOIN sessions s ON m.session_id = s.id
        WHERE s.chat_id = ?
        ORDER BY m.created_at
      `
      )
      .all(id) as Message[];
  }
);

// Удаление сессии и всех её сообщений (DELETE /sessions/:id)
app.delete(
  "/sessions/:id",
  {
    schema: {
      params: ParamsSchema,
      response: { 200: Type.Object({ success: Type.Boolean() }) },
    },
  },
  async (req: FastifyRequest<{ Params: ParamsType }>, reply) => {
    const { id } = req.params;
    const stmt = db.prepare("DELETE FROM sessions WHERE id = ?");
    const changes = stmt.run(id).changes;
    return { success: changes > 0 };
  }
);

start().catch(console.error);
