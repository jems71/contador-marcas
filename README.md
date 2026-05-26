# Contador X — Herramienta de Terreno

App móvil ultra-rápida para contar marcas "X" en hojas de papel usando Roboflow + visión artificial. Diseñada para uso en obra: pulgar, sol fuerte, conexión irregular.

## 🏗️ Arquitectura

```
┌──────────────┐       ┌────────────────────┐       ┌──────────────┐
│   Celular    │ ───▶  │  /api/count        │ ───▶  │  Roboflow    │
│  (frontend)  │ POST  │  (Vercel Function) │       │  Detect API  │
└──────────────┘       └────────────────────┘       └──────────────┘
   base64                   API key oculta             modelo IA
```

La API key **nunca** se expone al navegador — vive solo en las variables de entorno del servidor.

## 📁 Estructura

```
contador-marcas/
├── api/
│   └── count.js          # Serverless function (proxy a Roboflow)
├── public/
│   ├── index.html        # Markup
│   ├── styles.css        # Diseño industrial mobile-first
│   └── app.js            # Lógica de cámara/captura/envío
├── .env.example          # Documenta variables necesarias
├── .gitignore
├── package.json
├── vercel.json
└── README.md
```

## 🚀 Despliegue rápido en Vercel

### 1. Subir a GitHub

```bash
git init
git add .
git commit -m "feat: contador X inicial"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/contador-marcas.git
git push -u origin main
```

### 2. Importar en Vercel

1. Entra a [vercel.com](https://vercel.com) → **Add New Project**
2. Selecciona tu repo `contador-marcas`
3. Framework Preset: **Other** (lo detecta automáticamente)
4. **No toques** Build/Output Settings — funciona con la estructura por defecto

### 3. Configurar variables de entorno

En el dashboard del proyecto en Vercel → **Settings → Environment Variables**, agrega:

| Nombre | Valor | Ejemplo |
|---|---|---|
| `ROBOFLOW_API_KEY` | Tu key privada de Roboflow | `rf_AbCd1234...` |
| `ROBOFLOW_MODEL_ENDPOINT` | `workspace/version` de tu modelo | `marcas-x/3` |

> Encuentra tu API key en: [app.roboflow.com](https://app.roboflow.com) → Settings → API Keys
> Encuentra el endpoint en tu proyecto → **Deploy** → **Hosted Image Inference**

### 4. Redeploy

Después de agregar las variables, ve a **Deployments** y haz **Redeploy** del último build (las env vars se inyectan en el siguiente despliegue).

## 🧪 Desarrollo local

```bash
npm install -g vercel
vercel dev
```

Crea un `.env.local` con las mismas variables del paso 3 y abre `http://localhost:3000`.

## 📱 Probar en celular

Una vez desplegado, abre la URL de Vercel desde tu celular en obra. Para una experiencia tipo app:

- **iOS**: Safari → Compartir → "Agregar a pantalla de inicio"
- **Android**: Chrome → menú → "Agregar a pantalla principal"

## ⚙️ Ajustar el modelo

En `api/count.js` puedes calibrar la detección:

```javascript
const params = new URLSearchParams({
    api_key: API_KEY,
    confidence: '40',   // sube si hay falsos positivos
    overlap:    '30',   // baja si las X están muy juntas
    format:     'json',
});
```

## 🩺 Solución de problemas

| Error | Causa probable | Solución |
|---|---|---|
| "Servidor mal configurado" | Faltan env vars en Vercel | Configura `ROBOFLOW_API_KEY` y `ROBOFLOW_MODEL_ENDPOINT`, luego redeploy |
| "Roboflow respondió 401" | API key inválida | Verifica la key en app.roboflow.com |
| "Roboflow respondió 404" | Endpoint mal escrito | Verifica formato `workspace/version` |
| Cuenta cero / muy baja | Confidence muy alta | Baja `confidence` en `api/count.js` |

## 🔒 Seguridad

- La API key **solo vive en el servidor**.
- Las cabeceras de seguridad básicas están en `vercel.json`.
- La función serverless valida el método HTTP y el payload.

## 📜 Licencia

MIT
