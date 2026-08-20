import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { sendersRouter } from "./routes/senders.js";
import { emailsRouter } from "./routes/emails.js";

const app = express();

app.use(cors({ origin: env.frontendOrigin }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/senders", sendersRouter);
app.use("/api/emails", emailsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.port, () => {
  console.log(`[server] listening on http://localhost:${env.port}`);
});
