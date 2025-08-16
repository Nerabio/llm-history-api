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

// SCHEMA FOR PROMPT
// Define the schema for the prompt
const PromptSchema = Type.Object({
  role: Type.Union([
    Type.Literal("user"),
    Type.Literal("assistant"),
    Type.Literal("system"),
    Type.Literal("tool"),
  ]),
  content: Type.String(),
});

type PromptRequest = Static<typeof PromptSchema>;

// Схема для параметров
const ParamsSchema = Type.Object({
  id: Type.Union([Type.String(), Type.Number()]),
});

type ParamsType = Static<typeof ParamsSchema>;

// Схема для связывания промта и сессии
const SessionPromptSchema = Type.Object({
  chatId: Type.Union([Type.String(), Type.Number()]),
  promptId: Type.Union([Type.String(), Type.Number()]),
});

type SessionPrompt = Static<typeof SessionPromptSchema>;

app.post(
  "/prompt",
  {
    schema: {
      body: PromptSchema,
      response: {
        200: Type.Object({
          prompt_id: Type.Number(),
        }),
      },
    },
  },
  async (req: FastifyRequest<{ Body: PromptRequest }>, reply) => {
    const { role, content } = req.body;

    const stmt = db.prepare(
      "INSERT INTO prompts (role, content) VALUES ( ?, ?)"
    );
    const info = stmt.run(role, content);

    return {
      prompt_id: Number(info.lastInsertRowid),
    };
  }
);

app.post(
  "/add-prompt-to-session",
  {
    schema: {
      body: SessionPromptSchema,
      response: { 200: Type.Object({ success: Type.Boolean() }) },
    },
  },
  async (req: FastifyRequest<{ Body: SessionPrompt }>, reply) => {
    const { chatId, promptId } = req.body;
    let session = db
      .prepare("SELECT id FROM sessions WHERE chat_id = ?")
      .get(chatId) as Session | undefined;

    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    const stmt = db.prepare(
      "INSERT INTO session_prompts (session_id, prompt_id) VALUES (?, ?);"
    );
    const changes = stmt.run(session.id, promptId).changes;

    return { success: changes > 0 };
  }
);

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

// Получение сообщения по ID (GET /messages/:id)
app.get(
  "/messages/:id",
  {
    schema: {
      params: ParamsSchema,
      response: {
        200: Type.Object({
          id: Type.Number(),
          role: Type.String(),
          content: Type.String(),
          created_at: Type.String(),
        }),
      },
    },
  },
  async (req: FastifyRequest<{ Params: ParamsType }>, reply) => {
    const { id } = req.params;
    const message = db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
    if (!message) {
      return reply.status(404).send({ error: "Message not found" });
    }
    return message;
  }
);

// Редактирование сообщения по ID (PUT /messages/:id)
app.put(
  "/messages/:id",
  {
    schema: {
      params: ParamsSchema,
      body: Type.Object({
        role: Type.String(),
        content: Type.String(),
      }),
      response: {
        200: Type.Object({
          id: Type.Number(),
          role: Type.String(),
          content: Type.String(),
          created_at: Type.String(),
        }),
      },
    },
  },
  async (
    req: FastifyRequest<{ Params: ParamsType; Body: MessageRequest }>,
    reply
  ) => {
    const { id } = req.params;
    const { role, content } = req.body;
    const stmt = db.prepare(
      "UPDATE messages SET role = ?, content = ? WHERE id = ?"
    );
    const changes = stmt.run(role, content, id).changes;
    if (changes === 0) {
      return reply.status(404).send({ error: "Message not found" });
    }
    const updatedMessage = db
      .prepare("SELECT * FROM messages WHERE id = ?")
      .get(id);
    return updatedMessage;
  }
);

// Удаление сообщения по ID (DELETE /messages/:id)
app.delete(
  "/messages/:id",
  {
    schema: {
      params: ParamsSchema,
      response: { 200: Type.Object({ success: Type.Boolean() }) },
    },
  },
  async (req: FastifyRequest<{ Params: ParamsType }>, reply) => {
    const { id } = req.params;
    const stmt = db.prepare("DELETE FROM messages WHERE id = ?");
    const changes = stmt.run(id).changes;
    return { success: changes > 0 };
  }
);

// Получение всех сообщений сессии (GET /sessions/:id)
app.get(
  "/sessions/:id",
  {
    schema: {
      params: ParamsSchema,
      response: {
        200: Type.Object({ prompts: Type.Any(), messages: Type.Any() }),
      },
    },
  },
  async (req: FastifyRequest<{ Params: ParamsType }>, reply) => {
    const { id } = req.params;
    const sessionPrompt = db
      .prepare(
        `SELECT p.*
        FROM sessions s
        LEFT JOIN session_prompts sp ON s.id = sp.session_id
        JOIN prompts p ON sp.prompt_id = p.id WHERE s.chat_id = ?`
      )
      .all(id) as Message[];

    const messages = db
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

    return {
      prompts: sessionPrompt,
      messages: messages,
    };
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
    const stmt = db.prepare("DELETE FROM sessions WHERE chat_id = ?");
    const changes = stmt.run(id).changes;
    return { success: changes > 0 };
  }
);

start().catch(console.error);
