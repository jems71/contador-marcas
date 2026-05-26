/* =========================================================
   /api/count — Vercel Serverless Function (Node.js)
   Recibe { image: <base64 sin prefijo>, mime: <string> } del frontend,
   lo reenvía a la API de Roboflow y devuelve { count, predictions, avgConfidence }.

   Variables de entorno requeridas (configurar en Vercel → Settings → Environment Variables):
     - ROBOFLOW_API_KEY        Tu API key privada de Roboflow
     - ROBOFLOW_MODEL_ENDPOINT El "endpoint" del modelo en formato "workspace/version"
                               ej: "marcas-x/3"

   Endpoint base: https://detect.roboflow.com
   Docs: https://docs.roboflow.com/deploy/hosted-api
   ========================================================= */

export default async function handler(req, res) {
    // CORS — por si lo llamas desde otro dominio en pruebas. En el mismo
    // dominio de Vercel no es necesario, pero no estorba.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
    }

    // === Validar config del servidor ===
    const API_KEY  = process.env.ROBOFLOW_API_KEY;
    const ENDPOINT = process.env.ROBOFLOW_MODEL_ENDPOINT; // "workspace/version"

    if (!API_KEY || !ENDPOINT) {
        return res.status(500).json({
            error: 'Servidor mal configurado: faltan variables de entorno ROBOFLOW_API_KEY o ROBOFLOW_MODEL_ENDPOINT.',
        });
    }

    // === Validar payload ===
    const { image, mime } = req.body || {};
    if (!image || typeof image !== 'string') {
        return res.status(400).json({ error: 'Falta el campo "image" (base64).' });
    }

    // === Parámetros opcionales del modelo ===
    // Ajusta estos thresholds según tu modelo entrenado en Roboflow.
    const params = new URLSearchParams({
        api_key: API_KEY,
        confidence: '40',   // % mínimo de confianza
        overlap:    '30',   // % máximo de solapamiento entre cajas
        format:     'json',
    });

    const url = `https://detect.roboflow.com/${ENDPOINT}?${params.toString()}`;

    try {
        // Roboflow acepta la imagen como cuerpo base64 con content-type
        // application/x-www-form-urlencoded.
        const rfRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: image,
        });

        if (!rfRes.ok) {
            const text = await rfRes.text();
            return res.status(rfRes.status).json({
                error: `Roboflow respondió ${rfRes.status}: ${text.slice(0, 200)}`,
            });
        }

        const data = await rfRes.json();
        // Estructura típica de respuesta:
        // { predictions: [{x, y, width, height, confidence, class}, ...],
        //   image: {width, height}, time: ... }
        const predictions = Array.isArray(data.predictions) ? data.predictions : [];
        const count = predictions.length;

        const avgConfidence = count > 0
            ? predictions.reduce((sum, p) => sum + (p.confidence || 0), 0) / count
            : 0;

        return res.status(200).json({
            count,
            predictions,
            avgConfidence,
            modelTime: data.time || null,
        });

    } catch (err) {
        console.error('[api/count] Error:', err);
        return res.status(502).json({
            error: 'No se pudo contactar con el servicio de detección. Intenta de nuevo.',
        });
    }
}

// === Config: aumentar el tamaño máximo del body (imágenes base64 pesadas) ===
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '12mb',
        },
    },
};
