import net from "node:net";
import tls from "node:tls";
import os from "node:os";

// Minimal SMTP client for plain-text alert mail: implicit TLS (port 465) or
// STARTTLS (587/25), AUTH LOGIN, one message per call. No third-party package.

function encodeHeader(value) {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function dotStuff(body) {
  return body.replace(/\r?\n/g, "\r\n").split("\r\n").map((line) => (line.startsWith(".") ? `.${line}` : line)).join("\r\n");
}

function createReader(socketRef) {
  let buffer = "";
  let waiting = null;
  const onData = (chunk) => {
    buffer += chunk.toString("utf8");
    flush();
  };
  function flush() {
    if (!waiting) return;
    const lines = buffer.split("\r\n");
    for (let i = 0; i < lines.length - 1; i += 1) {
      if (/^\d{3} /.test(lines[i])) {
        const reply = lines.slice(0, i + 1).join("\n");
        buffer = lines.slice(i + 1).join("\r\n");
        const { resolve } = waiting;
        waiting = null;
        resolve({ text: reply });
        return;
      }
    }
  }
  return {
    attach(socket) { socketRef.socket = socket; socket.on("data", onData); },
    next(timeoutMs) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiting = null; reject(new Error("Mail server did not answer in time")); }, timeoutMs);
        waiting = { resolve: (value) => { clearTimeout(timer); resolve(value); } };
        flush();
      });
    }
  };
}

export async function sendMail(config, message, { timeoutMs = 20000 } = {}) {
  const port = Number(config.port || 587);
  const implicitTls = config.secure === true || port === 465;
  const ref = {};
  const reader = createReader(ref);
  const connect = () => new Promise((resolve, reject) => {
    const socket = implicitTls
      ? tls.connect({ host: config.host, port, servername: config.host })
      : net.connect({ host: config.host, port });
    socket.once(implicitTls ? "secureConnect" : "connect", () => resolve(socket));
    socket.once("error", reject);
  });
  let socket = await connect();
  reader.attach(socket);
  socket.on("error", () => {});
  const send = async (line, expect) => {
    if (line !== null) socket.write(`${line}\r\n`);
    const reply = await reader.next(timeoutMs);
    const code = Number(reply.text.split("\n").pop().slice(0, 3));
    if (!expect.includes(code)) {
      const shown = line && /^AUTH|^[A-Za-z0-9+/=]+$/.test(line) ? "(credentials)" : line;
      throw new Error(`Mail server refused ${shown || "the connection"}: ${reply.text.split("\n").pop()}`);
    }
    return reply.text;
  };
  try {
    await send(null, [220]);
    let ehlo = await send(`EHLO ${os.hostname() || "gii-gem-erp"}`, [250]);
    if (!implicitTls && /STARTTLS/i.test(ehlo)) {
      await send("STARTTLS", [220]);
      socket.removeAllListeners("data");
      socket = await new Promise((resolve, reject) => {
        const secure = tls.connect({ socket, servername: config.host }, () => resolve(secure));
        secure.once("error", reject);
      });
      reader.attach(socket);
      socket.on("error", () => {});
      ehlo = await send(`EHLO ${os.hostname() || "gii-gem-erp"}`, [250]);
    } else if (!implicitTls && !(config.allowPlainLocal !== false && ["127.0.0.1", "localhost", "::1"].includes(String(config.host)))) {
      throw new Error("Mail server does not offer STARTTLS; the ERP will not send the password unencrypted. Use port 465 or a server with STARTTLS.");
    }
    if (config.user) {
      await send("AUTH LOGIN", [334]);
      await send(Buffer.from(config.user).toString("base64"), [334]);
      await send(Buffer.from(config.password || "").toString("base64"), [235]);
    }
    const from = config.from || config.user;
    await send(`MAIL FROM:<${from}>`, [250]);
    for (const to of message.to) await send(`RCPT TO:<${to}>`, [250, 251]);
    await send("DATA", [354]);
    const headers = [
      `From: ${from}`,
      `To: ${message.to.join(", ")}`,
      `Subject: ${encodeHeader(message.subject)}`,
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit"
    ];
    await send(`${headers.join("\r\n")}\r\n\r\n${dotStuff(message.text)}\r\n.`, [250]);
    await send("QUIT", [221]).catch(() => {});
    return { accepted: message.to };
  } finally {
    socket.end();
  }
}
