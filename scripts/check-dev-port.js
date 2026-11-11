import net from "node:net";

const host = "127.0.0.1";
const port = 5173;
const server = net.createServer();

server.unref();
server.once("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`Cannot start GII GeM ERP: development port ${host}:${port} is already in use.`);
    console.error("Close the existing ERP development session before starting another one.");
  } else {
    console.error(`Cannot verify development port ${host}:${port}: ${error?.message || error}`);
  }
  process.exitCode = 1;
});

server.listen({ host, port, exclusive: true }, () => {
  server.close(() => {
    console.log(`Development port ${host}:${port} is available.`);
  });
});
