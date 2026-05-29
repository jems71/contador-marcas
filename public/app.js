/* =========================================================
   CONTADOR X — Lógica frontend
   - Captura imagen desde cámara móvil
   - Convierte a base64
   - Envía a /api/count (proxy serverless en Vercel)
   ========================================================= */

(() => {
    'use strict';

    // ===== Referencias del DOM =====
    const $ = (id) => document.getElementById(id);

    const cameraInput   = $('cameraInput');
    const captureBtn    = $('captureBtn');
    const captureBtnText = $('captureBtnText');
    const previewFrame  = $('previewFrame');
    const previewImage  = $('previewImage');
    const placeholder   = $('placeholder');
    const countBtn      = $('countBtn');
    const resultPanel   = $('resultPanel');
    const loadingMsg    = $('loadingMsg');
    const totalCount    = $('totalCount');
    const responseTime  = $('responseTime');
    const errorMsg      = $('errorMsg');
    const confChip      = $('confChip');
    const confValue     = $('confValue');
    const connStatus    = $('connStatus');

    const states = {
        idle:    resultPanel.querySelector('[data-state="idle"]'),
        loading: resultPanel.querySelector('[data-state="loading"]'),
        success: resultPanel.querySelector('[data-state="success"]'),
        error:   resultPanel.querySelector('[data-state="error"]'),
    };

    // ===== Estado de la app =====
    let imageBase64 = null;   // imagen lista para enviar (sin prefijo data:)
    let imageMime   = null;
    let loadingTimer = null;

    // ===== Configuración =====
    // El endpoint serverless está en /api/count.
    // Las credenciales viven SOLO en el servidor (variables de entorno en Vercel):
    //   - ROBOFLOW_API_KEY
    //   - ROBOFLOW_MODEL_ENDPOINT  (ej: "tu-proyecto/3")
    // Si por alguna razón quisieras llamar directo a Roboflow desde el frontend
    // (NO recomendado por seguridad), reemplaza /api/count por la URL completa
    // y descomenta el bloque marcado más abajo.
  // Cambia la línea por esta (asegúrate de incluir el https://)
   const API_ENDPOINT = '/api/count';
   
    const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

    const loadingPhrases = [
        'Analizando imagen...',
        'Detectando marcas...',
        'Aplicando modelo IA...',
        'Procesando coordenadas...',
        'Casi listo...',
    ];

    // ===== Helpers de UI =====
    function showState(name) {
        Object.entries(states).forEach(([key, el]) => {
            el.hidden = key !== name;
        });
    }

    function animateLoadingText() {
        let i = 0;
        loadingMsg.textContent = loadingPhrases[0];
        loadingTimer = setInterval(() => {
            i = (i + 1) % loadingPhrases.length;
            loadingMsg.textContent = loadingPhrases[i];
        }, 900);
    }

    function stopLoadingText() {
        if (loadingTimer) {
            clearInterval(loadingTimer);
            loadingTimer = null;
        }
    }

    function setError(msg) {
        stopLoadingText();
        errorMsg.textContent = msg;
        showState('error');
    }

    // ===== Conectividad =====
    function updateConnStatus() {
        if (navigator.onLine) {
            connStatus.textContent = 'EN LÍNEA';
            connStatus.classList.remove('header__status--offline');
        } else {
            connStatus.textContent = 'SIN RED';
            connStatus.classList.add('header__status--offline');
        }
    }
    window.addEventListener('online', updateConnStatus);
    window.addEventListener('offline', updateConnStatus);
    updateConnStatus();

    // ===== Captura de imagen =====
    captureBtn.addEventListener('click', () => {
        cameraInput.click();
    });

    cameraInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('El archivo seleccionado no es una imagen válida.');
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            setError(`Imagen demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máx 8 MB.`);
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            const dataUrl = ev.target.result;
            // dataUrl = "data:image/jpeg;base64,XXXXX"
            const [meta, base64] = dataUrl.split(',');
            const mimeMatch = meta.match(/data:(.*?);base64/);
            imageMime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            imageBase64 = base64;

            previewImage.src = dataUrl;
            previewImage.hidden = false;
            placeholder.hidden = true;
            previewFrame.classList.add('capture__frame--filled');

            countBtn.disabled = false;
            captureBtnText.textContent = 'CAMBIAR FOTO';

            // Reset del panel de resultado
            showState('idle');
        };
        reader.onerror = () => setError('No se pudo leer el archivo.');
        reader.readAsDataURL(file);
    });

    // ===== Envío a la API =====
    countBtn.addEventListener('click', async () => {
        if (!imageBase64) {
            setError('Captura una imagen primero.');
            return;
        }
        if (!navigator.onLine) {
            setError('Sin conexión a internet. Revisa tu red.');
            return;
        }

        countBtn.disabled = true;
        showState('loading');
        animateLoadingText();

        const t0 = performance.now();

        // AbortController para timeout (30 s — los modelos lentos pueden tardar)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
            const res = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: imageBase64,
                    mime: imageMime,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                let detail = `HTTP ${res.status}`;
                try {
                    const errBody = await res.json();
                    if (errBody && errBody.error) detail = errBody.error;
                } catch { /* respuesta no era JSON */ }
                throw new Error(detail);
            }

            const data = await res.json();
            const elapsed = Math.round(performance.now() - t0);

            // Esperamos: { count: number, predictions?: Array, avgConfidence?: number }
            const count = typeof data.count === 'number'
                ? data.count
                : (Array.isArray(data.predictions) ? data.predictions.length : null);

            if (count === null || count === undefined) {
                throw new Error('Respuesta inválida del servidor.');
            }

            stopLoadingText();
            totalCount.textContent = count;
            responseTime.textContent = `${elapsed} ms`;

            if (typeof data.avgConfidence === 'number') {
                confValue.textContent = `${(data.avgConfidence * 100).toFixed(0)}% conf.`;
                confChip.hidden = false;
            } else {
                confChip.hidden = true;
            }

            showState('success');

            // Feedback háptico en móvil cuando se obtiene resultado
            if (navigator.vibrate) navigator.vibrate(80);

        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                setError('Tiempo de espera agotado (30s). Intenta de nuevo.');
            } else if (err.message && err.message.includes('Failed to fetch')) {
                setError('Sin conexión con el servidor. Verifica tu red.');
            } else {
                setError(err.message || 'Error desconocido al procesar la imagen.');
            }
        } finally {
            countBtn.disabled = false;
        }
    });

    /* =========================================================
       OPCIONAL — Llamada directa a Roboflow (NO recomendado)
       Solo si NO usas el endpoint serverless. Expone tu API key
       en el navegador, así que úsalo únicamente para pruebas.

       async function callRoboflowDirect(base64) {
           const ROBOFLOW_API_KEY = "TU_TOKEN_AQUI";
           const ROBOFLOW_MODEL   = "tu-proyecto/3"; // formato workspace/version
           const url = `https://detect.roboflow.com/${ROBOFLOW_MODEL}?api_key=${ROBOFLOW_API_KEY}`;

           const res = await fetch(url, {
               method: 'POST',
               headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
               body: base64,
           });
           return res.json();
       }
       ========================================================= */
})();
