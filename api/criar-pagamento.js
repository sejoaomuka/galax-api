export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ erro: "Método inválido" });

  const TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!TOKEN) return res.status(500).json({ erro: "Token não configurado" });

  try {
    const { pedidoId, titulo, preco, voltarPara } = req.body ?? {};
    if (!pedidoId || !preco) return res.status(400).json({ erro: "Dados incompletos" });
    const base = `https://${req.headers.host}`;

    const resp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ title: String(titulo || "Produto"), quantity: 1, unit_price: Number(preco), currency_id: "BRL" }],
        external_reference: String(pedidoId),
        notification_url: `${base}/api/webhook`,
        back_urls: { success: voltarPara || base, pending: voltarPara || base, failure: voltarPara || base },
        auto_return: "approved",
      }),
    });

    const data = await resp.json();
    if (!resp.ok) return res.status(500).json({ erro: data.message ?? "Erro no Mercado Pago" });
    return res.status(200).json({ initPoint: data.init_point });
  } catch (e) {
    return res.status(500).json({ erro: "Falha ao criar pagamento" });
  }
}
