/* =========================================================
   CONTADOR X v1.1 — Lógica frontend con cajas + confianza
   - Captura imagen desde cámara móvil o galería
   - Convierte a base64
   - Envía a /api/count (proxy a Railway)
   - Dibuja cajas verdes/amarillas/rojas según confianza
   - Muestra desglose por nivel de confianza
   ========================================================= */

(() => {
    'use strict';

    // ===== Referencias del DOM =====
    const $ = (id) => document.getElementById(id);

    const cameraInput    = $('cameraInput');
    const captureBtn     = $('captureBtn');
    const captureBtnText = $('captureBtnText');
    const previewFrame   = $('previewFrame');
    const previewImage   = $('previewImage');
    const placeholder    = $('placeholder');
    const canvasWrap     = $('canvasWrap');
    const overlayCanvas  = $('overlayCanvas');
    const countBtn       = $('countBtn');
    const resultPanel    = $('resultPanel');
    const loadingMsg     = $('loadingMsg');
    const totalCount     = $('totalCount');
    const responseTime   = $('responseTime');
    const errorMsg       = $('errorMsg');
    const confChip       = $('confChip');
    const confValue      = $('confValue');
    const connStatus     = $('connStatus');

    // Desglose de confianza
    const confBreakdown  = $('confBreakdown');
    const confHigh       = $('confHigh');
    const confMid        = $('confMid');
    const confLow        = $('confLow');

    const states = {
        idle:    resultPanel.querySelector('[data-state="idle"]'),
        loading: resultPanel.querySelector('[data-state="loading"]'),
        success: resultPanel.querySelector('[data-state="success"]'),
        error:   resultPanel.querySelector('[data-state="error"]'),
    };

    // ===== Estado de la app =====
    let imageBase64 = null;
    let imageMime   = null;
    let lastPredictions = [];   // guardamos las últimas detecciones para redibujar
    let loadingTimer = null;

    // ===== Configuración =====
    const API_ENDPOINT = '/api/count';
    const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

    // Umbrales para clasificar confianza
    const CONF_HIGH_THRESHOLD = 0.80;   // >= 80% = alta
    const CONF_MID_THRESHOLD  = 0.60;   // 60-80% = media
                                         //  <60% = baja

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

    function clearCanvas() {
        const ctx = overlayCanvas.getContext('2d');
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        lastPredictions = [];
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
            const [meta, base64] = dataUrl.split(',');
            const mimeMatch = meta.match(/data:(.*?);base64/);
            imageMime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            imageBase64 = base64;

            previewImage.src = dataUrl;
            canvasWrap.hidden = false;
            placeholder.hidden = true;
            previewFrame.classList.add('capture__frame--filled');

            // Limpiar cajas previas al cargar nueva imagen
            clearCanvas();

            countBtn.disabled = false;
            captureBtnText.textContent = 'CAMBIAR FOTO';

            showState('idle');
        };
        reader.onerror = () => setError('No se pudo leer el archivo.');
        reader.readAsDataURL(file);
    });

    // ===== Dibujar cajas en el canvas =====
    function drawDetections(predictions, imgWidth, imgHeight) {
        // Ajustar tamaño del canvas al tamaño real de la imagen
        overlayCanvas.width = imgWidth;
        overlayCanvas.height = imgHeight;

        const ctx = overlayCanvas.getContext('2d');
        ctx.clearRect(0, 0, imgWidth, imgHeight);

        if (!predictions || predictions.length === 0) return;

        // Tamaño de fuente y línea relativo al tamaño de la imagen
        const baseSize = Math.max(imgWidth, imgHeight);
        const fontSize = Math.max(12, Math.round(baseSize / 60));
        const lineWidth = Math.max(2, Math.round(baseSize / 400));

        ctx.font = `bold ${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
        ctx.lineWidth = lineWidth;
        ctx.textBaseline = 'top';

        predictions.forEach((det, i) => {
            // Color según confianza
            let color, bgColor;
            if (det.confidence >= CONF_HIGH_THRESHOLD) {
                color = '#00d97e';       // verde
                bgColor = 'rgba(0, 217, 126, 0.15)';
            } else if (det.confidence >= CONF_MID_THRESHOLD) {
                color = '#f5a524';       // amarillo
                bgColor = 'rgba(245, 165, 36, 0.15)';
            } else {
                color = '#ef4444';       // rojo
                bgColor = 'rgba(239, 68, 68, 0.2)';
            }

            // Coordenadas: la API devuelve x,y como CENTRO de la caja
            const x = det.x - det.width / 2;
            const y = det.y - det.height / 2;
            const w = det.width;
            const h = det.height;

            // Caja con fondo semitransparente
            ctx.fillStyle = bgColor;
            ctx.fillRect(x, y, w, h);

            // Borde
            ctx.strokeStyle = color;
            ctx.strokeRect(x, y, w, h);

            // Etiqueta con número (arriba a la izquierda de la caja)
            const label = `#${i + 1}`;
            const labelPadding = Math.round(fontSize * 0.3);
            const labelMetrics = ctx.measureText(label);
            const labelHeight = fontSize + labelPadding * 2;
            const labelWidth = labelMetrics.width + labelPadding * 2;

            // Posición de la etiqueta: dentro de la caja si está cerca del borde superior
            let labelY = y - labelHeight;
            if (labelY < 0) labelY = y;  // si se sale por arriba, ponerla dentro

            ctx.fillStyle = color;
            ctx.fillRect(x, labelY, labelWidth, labelHeight);

            ctx.fillStyle = '#000';
            ctx.fillText(label, x + labelPadding, labelY + labelPadding);
        });
    }

    function calculateConfidenceBreakdown(predictions) {
        let high = 0, mid = 0, low = 0;
        predictions.forEach(det => {
            if (det.confidence >= CONF_HIGH_THRESHOLD)       high++;
            else if (det.confidence >= CONF_MID_THRESHOLD)   mid++;
            else                                              low++;
        });
        return { high, mid, low };
    }

    // Redibujar cuando la imagen termine de cargar (importante para canvas)
    previewImage.addEventListener('load', () => {
        if (lastPredictions.length > 0) {
            drawDetections(lastPredictions, previewImage.naturalWidth, previewImage.naturalHeight);
        }
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
        clearCanvas();              // limpiar cajas anteriores
        showState('loading');
        animateLoadingText();

        const t0 = performance.now();

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

            // === NUEVO: dibujar cajas + desglose ===
            if (Array.isArray(data.predictions) && data.predictions.length > 0) {
                lastPredictions = data.predictions;

                // Dibujar sobre la imagen
                drawDetections(
                    data.predictions,
                    previewImage.naturalWidth,
                    previewImage.naturalHeight
                );

                // Calcular y mostrar desglose
                const breakdown = calculateConfidenceBreakdown(data.predictions);
                confHigh.textContent = breakdown.high;
                confMid.textContent  = breakdown.mid;
                confLow.textContent  = breakdown.low;
                confBreakdown.hidden = false;
            } else {
                confBreakdown.hidden = true;
            }

            showState('success');

            // Vibración háptica en móvil
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
})();
