const express = require("express");
const crypto = require("crypto");
const client = require("prom-client");
const pino = require("pino");

const PORT = process.env.PORT || 8080;
const APP_VERSION = process.env.APP_VERSION || "0.0.0";
const GIT_SHA = process.env.GIT_SHA || "unknown";
const APP_ENV = process.env.APP_ENV || "dev";

const app = express();
app.use(express.json());

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: { level: (label) => ({ level: label }) }, 
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { app_version: APP_VERSION, git_sha: GIT_SHA, env: APP_ENV },
  redact: {
    paths: ["user.cpf", "user.pix_key"],
    censor: "***MASCARADO_LGPD***",
  },
});

client.collectDefaultMetrics();

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total de requisicoes HTTP recebidas",
  labelNames: ["method", "route", "status_code"],
});

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duracao das requisicoes HTTP em segundos",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 1.5, 2],
});

const pixAmountTotal = new client.Counter({
  name: "pix_amount_reais_total",
  help: "Volume financeiro total transferido via PIX em Reais",
});

const appInfo = new client.Gauge({
  name: "app_info",
  help: "Informacoes de versao da aplicacao",
  labelNames: ["version", "git_sha", "env"],
});
appInfo.labels(APP_VERSION, GIT_SHA, APP_ENV).set(1);

const randomBetween = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const maskAccount = (account) => "*****-" + account.slice(-1);

app.use((req, res, next) => {
  if (req.path === "/metrics") return next(); 

  const stopTimer = httpRequestDuration.startTimer();
  const correlationId = req.headers["x-correlation-id"] || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader("x-correlation-id", correlationId);

  res.on("finish", () => {
    const route = req.route ? req.route.path : "rota_desconhecida";
    const status = res.statusCode.toString();
    httpRequestsTotal.labels(req.method, route, status).inc();
    stopTimer({ method: req.method, route, status_code: status });
  });

  next();
});

app.get("/saldo", (req, res) => {
  const delay = randomBetween(10, 50);
  setTimeout(() => {
    logger.info(
      {
        correlation_id: req.correlationId,
        event: "balance_check",
        account: maskAccount("98765-4"),
        latency_ms: delay,
      },
      "Saldo consultado com sucesso",
    );

    res.json({
      saldo: 1523.75,
      conta: maskAccount("98765-4"),
      correlation_id: req.correlationId,
    });
  }, delay);
});

app.get("/extrato", (req, res) => {
  const delay = randomBetween(300, 1200);
  setTimeout(() => {
    if (Math.random() < 0.1) {
      logger.error(
        {
          correlation_id: req.correlationId,
          event: "statement_error",
          error_code: "DB_TIMEOUT",
          latency_ms: delay,
        },
        "Timeout ao consultar o banco de dados",
      );

      return res.status(500).json({
        status: "failed",
        error: "db_timeout",
        message: "Não foi possível obter o extrato. Tente novamente.",
        correlation_id: req.correlationId,
      });
    }

    logger.info(
      {
        correlation_id: req.correlationId,
        event: "statement_fetch",
        latency_ms: delay,
      },
      "Extrato retornado",
    );

    res.json({
      lancamentos: [
        { descricao: "Mercado", valor: -120.5 },
        { descricao: "Salario", valor: 3500.0 },
      ],
      correlation_id: req.correlationId,
    });
  }, delay);
});

const pixHandler = (req, res) => {
  const delay = randomBetween(100, 1500);
  const amount = Number(req.body?.amount) || randomBetween(1, 2000);
  const user = {
    name: "Joao Silva",
    cpf: "123.456.789-00",
    pix_key: req.body?.pix_key || "joao@exemplo.com",
  };

  setTimeout(() => {
    if (Math.random() < 0.25) {
      logger.error(
        {
          correlation_id: req.correlationId,
          event: "pix_transfer_failed",
          amount,
          user,
          error_code: "BACEN_TIMEOUT",
          latency_ms: delay,
        },
        "Timeout na comunicacao com API do Banco Central",
      );

      return res.status(500).json({
        status: "failed",
        error: "spi_timeout",
        message: "Não foi possível concluir a transferência. Tente novamente.",
        correlation_id: req.correlationId,
      });
    }

    pixAmountTotal.inc(amount);

    logger.info(
      {
        correlation_id: req.correlationId,
        event: "pix_transfer_success",
        amount,
        user,
        latency_ms: delay,
      },
      "Transferencia PIX realizada com sucesso",
    );

    res.json({ status: "success", amount, correlation_id: req.correlationId });
  }, delay);
};
app.get("/pix", pixHandler);
app.post("/pix", pixHandler);

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(PORT, () => {
  logger.info({ event: "app_started", port: PORT }, "API PIX iniciada");
});
