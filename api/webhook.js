const PROJECT = "galax-store";
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const str = (v) => ({ stringValue: String(v ?? "") });

async function fsQuery(collectionId, field, value) {
  const r = await fetch(`${FS}:runQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: str(value) } },
        limit: 50,
      },
    }),
  });
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).filter((x) => x.document);
}

async function fsPatch(path, fields) {
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join("&");
  return fetch(`${FS}/${path}?${mask}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  const TOKEN = process.env.MP_ACCESS_TOKEN;

  try {
    const paymentId = req.body?.data?.id || req.query?.["data.id"] || req.query?.id || req.body?.id;
    if (!paymentId) return res.status(200).json({ ok: true });

    const pr = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const pay = await pr.json();
    if (pay.status !== "approved") return res.status(200).json({ ok: true });

    const pedidoId = pay.external_reference;
    if (!pedidoId) return res.status(200).json({ ok: true });

    const atual = await (await fetch(`${FS}/pedidos/${pedidoId}`)).json();
    if (atual?.fields?.contaSenha) return res.status(200).json({ ok: true });

    const categoriaId = atual?.fields?.categoriaId?.stringValue;
    const contas = await fsQuery("contas", "categoriaId", categoriaId);
    const livre = contas.find((c) => c.document.fields?.status?.stringValue === "disponivel");

    if (!livre) {
      await fsPatch(`pedidos/${pedidoId}`, {
        status: str("pago"),
        erro: str("Pagamento aprovado, mas o estoque acabou. Fale com o suporte no Discord."),
      });
      return res.status(200).json({ ok: true });
    }

    const contaPath = livre.document.name.split("/documents/")[1];
    const nome = livre.document.fields?.nome?.stringValue ?? "";
    const senha = livre.document.fields?.senha?.stringValue ?? "";

    await fsPatch(contaPath, { status: str("vendida") });
    await fsPatch(`pedidos/${pedidoId}`, {
      status: str("entregue"),
      contaNome: str(nome),
      contaSenha: str(senha),
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: false });
  }
}
