const BASE = process.env.BASE_URL || "http://localhost:8080";

const hit = async (method, path) => {
  try {
    await fetch(BASE + path, { method });
  } catch (e) {
    console.error("falha de conexão em", path);
  }
};

const loop = async (method, path, intervalMs) => {
  while (true) {
    await hit(method, path);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
};

loop("GET", "/saldo", 200);
loop("GET", "/extrato", 300);
loop("POST", "/pix", 300);
console.log("Gerando carga... Ctrl+C para parar");
