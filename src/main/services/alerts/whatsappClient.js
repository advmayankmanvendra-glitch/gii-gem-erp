// WhatsApp Business Cloud API (Meta). Business-initiated messages need an approved
// message template; free text is only accepted inside a 24-hour customer window.
const GRAPH_VERSION = "v21.0";

export async function sendWhatsApp(config, { to, text, templateParams = [] }, { fetchImpl = globalThis.fetch } = {}) {
  if (!config.phoneNumberId || !config.token) throw new Error("WhatsApp is not set up: enter the Phone Number ID and access token in Settings > Alerts.");
  const body = config.templateName
    ? {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: config.templateName,
        language: { code: config.templateLanguage || "en" },
        components: templateParams.length ? [{ type: "body", parameters: templateParams.map((value) => ({ type: "text", text: String(value).slice(0, 1000) })) }] : []
      }
    }
    : { messaging_product: "whatsapp", to, type: "text", text: { preview_url: false, body: text.slice(0, 4096) } };
  const response = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = result?.error?.message || `HTTP ${response.status}`;
    throw new Error(`WhatsApp refused the message to ${to}: ${reason}. Check the token, the recipient number (with country code, no +) and, for alerts outside a chat window, an approved template name.`);
  }
  return { to, id: result?.messages?.[0]?.id || null };
}
