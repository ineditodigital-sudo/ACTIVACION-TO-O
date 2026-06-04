require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SCENARIO_MAP = {
  jardin: 'the iconic Jardín de San Marcos in Aguascalientes, beautiful colonial arches, lush green gardens, bright sunny day, friendly campaign event atmosphere',
  auditorio: 'a grand modern conference auditorium, clean executive stage, elegant blue lighting, presentation screen with campaign graphic in the background',
  oficina: 'a bright executive meeting office in Aguascalientes, clean glass window view of the city, professional business campaign atmosphere',
  rally: 'a vibrant outdoor campaign rally, colorful flags, supporter crowd silhouettes blurred in the background, warm daylight',
};

// Cargar foto de referencia del candidato (Toño Martín del Campo)
const candidatePhotoPath = path.join(__dirname, '..', 'FOTOS TOÑO', 'Martin-del-Campo.jpg');
let candidatePhotoBase64 = '';
try {
  if (fs.existsSync(candidatePhotoPath)) {
    candidatePhotoBase64 = fs.readFileSync(candidatePhotoPath).toString('base64');
    console.log("[DEBUG] Foto de referencia de Toño cargada correctamente.");
  } else {
    console.warn("[WARN] No se encontró la foto del candidato en:", candidatePhotoPath);
  }
} catch (err) {
  console.error("[ERROR] Error cargando foto del candidato:", err.message);
}

// Cargar foto de referencia de Kikín Fonseca (temática de fútbol)
const kikinPhotoPath = path.join(__dirname, '..', 'frontend', 'public', 'kikin-fonseca.png');
let kikinPhotoBase64 = '';
try {
  if (fs.existsSync(kikinPhotoPath)) {
    kikinPhotoBase64 = fs.readFileSync(kikinPhotoPath).toString('base64');
    console.log("[DEBUG] Foto de referencia de Kikín Fonseca cargada correctamente.");
  } else {
    console.warn("[WARN] No se encontró la foto de Kikín Fonseca en:", kikinPhotoPath);
  }
} catch (err) {
  console.error("[ERROR] Error cargando foto de Kikín Fonseca:", err.message);
}

// ─── VISION ANALYSIS: Análisis del usuario con Gemini 2.5 Flash ─────────────
async function analyzePhotoWithVision(cleanBase64, isGroup) {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const groupPrompt = `You are a professional character artist. Analyze this GROUP PHOTO with extreme precision.
Count EXACTLY how many people are in the photo, then for EACH person provide a SEPARATE, DETAILED description.

For EACH person, follow this strict format:

=== PERSON [N] ===
POSITION IN PHOTO: [leftmost / second from left / center / second from right / rightmost]
GENDER & AGE: [e.g., Woman, approx 30-35 years old]
BODY BUILD: [Exact: slim/slender, average/medium, athletic/muscular, curvy/full-figured, petite, tall and thin]
SKIN TONE: [Exact: very light/pale, fair/light, warm beige, light tan, medium tan, olive, medium brown, dark brown]
HAIR: [exact color, length, style, texture]
FACE SHAPE: [oval/round/square/heart/long]
EYES: [color, shape, size]
NOSE: [size and shape]
LIPS: [thickness, details]
DISTINCTIVE FEATURES: [glasses, facial hair, dimples, etc.]
CLOTHING: [garment type + color]
OVERALL IMPRESSION: [Write 1 sentence describing their most unique/recognizable traits]

Return ONLY the formatted descriptions. Be extremely specific. Do NOT generalize.`;

  const singlePrompt = `You are a professional character artist. Analyze this photo with extreme precision to capture the person's exact likeness.

Provide a HIGHLY DETAILED description following this format:

=== PERSON 1 ===
GENDER & AGE: [e.g., Woman, approx 28-32 years old]
BODY BUILD: [Exact: slim/slender, average/medium, athletic/muscular, curvy/full-figured, petite]
SKIN TONE: [Exact: very light/pale, fair/light, warm beige, light tan, medium tan, olive, medium brown, dark brown]
HAIR: [exact color, length, style, texture]
FACE SHAPE: [oval/round/square/heart/long]
EYES: [color, shape, size]
NOSE: [size and exact shape]
LIPS: [thickness, color]
DISTINCTIVE FEATURES: [glasses, facial hair, moles, freckles, dimples, wrinkles]
CLOTHING: [describe garments worn, exact colors]
OVERALL IMPRESSION: [Their most unique recognizable physical traits]

Return ONLY the formatted description. Be extremely specific about facial features.`;

  const payload = {
    contents: [{
      parts: [
        { text: isGroup ? groupPrompt : singlePrompt },
        { inline_data: { mime_type: 'image/jpeg', data: cleanBase64 } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048
    }
  };

  try {
    console.log(`[DEBUG] Gemini Vision analizando (${isGroup ? 'GRUPAL' : 'INDIVIDUAL'})...`);
    const res = await axios.post(geminiUrl, payload, { timeout: 30000 });
    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      console.log("[DEBUG] Análisis de visión completado:", text.substring(0, 200) + '...');
      return text.trim();
    }
  } catch (e) {
    console.error("[ERROR] Gemini Vision failed:", e.response?.data || e.message);
  }
  return null;
}

// ─── FACE DETECTION & CROPPING ────────────────────────────────────────────────
async function detectFaceBBoxes(cleanBase64, personCount) {
  const numDesc = personCount === 1 ? 'one person' : `${personCount} people`;
  const prompt = `Locate the face(s) of ${numDesc} in this image. `
    + `For each face, return its bounding box as a JSON array. `
    + `Use this EXACT format with NO other text:\n`
    + '[{"person":1,"y_min":150,"x_min":300,"y_max":450,"x_max":600}]\n'
    + `Rules:\n`
    + `- Values are integers 0-1000 (0=top/left edge, 1000=bottom/right edge).\n`
    + `- Include the full head (forehead to chin) plus a bit of neck. Make the box generous.\n`
    + `- Order people left-to-right as they appear in the photo.\n`
    + `- Return ONLY the JSON array. No markdown, no explanation.`;

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: 'image/jpeg', data: cleanBase64 } }
      ]
    }],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 256
    }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  try {
    const res = await axios.post(url, payload, { timeout: 20000 });
    let text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/```json\s*/i, '').replace(/```/, '').trim();
    const boxes = JSON.parse(text);
    if (Array.isArray(boxes)) {
      return boxes.map(box => ({
        y_min: Math.max(0, Math.min(1000, parseInt(box.y_min))),
        x_min: Math.max(0, Math.min(1000, parseInt(box.x_min))),
        y_max: Math.max(0, Math.min(1000, parseInt(box.y_max))),
        x_max: Math.max(0, Math.min(1000, parseInt(box.x_max)))
      }));
    }
  } catch (e) {
    console.error("[ERROR] detectFaceBBoxes failed:", e.message);
  }
  return [];
}

async function cropFaceRegion(cleanBase64, box) {
  try {
    const buffer = Buffer.from(cleanBase64, 'base64');
    const image = await Jimp.read(buffer);
    const w = image.bitmap.width;
    const h = image.bitmap.height;

    let px1 = Math.round((box.x_min / 1000) * w);
    let py1 = Math.round((box.y_min / 1000) * h);
    let px2 = Math.round((box.x_max / 1000) * w);
    let py2 = Math.round((box.y_max / 1000) * h);

    // Padding del 55% para contexto del rostro
    const padX = Math.round((px2 - px1) * 0.55);
    const padY = Math.round((py2 - py1) * 0.55);

    px1 = Math.max(0, px1 - padX);
    py1 = Math.max(0, py1 - padY);
    px2 = Math.min(w, px2 + padX);
    py2 = Math.min(h, py2 + padY);

    const cropW = px2 - px1;
    const cropH = py2 - py1;

    if (cropW >= 20 && cropH >= 20) {
      const cropped = image.crop(px1, py1, cropW, cropH);
      const croppedBuffer = await cropped.getBufferAsync(Jimp.MIME_JPEG);
      return croppedBuffer.toString('base64');
    }
  } catch (e) {
    console.error("[ERROR] cropFaceRegion failed:", e.message);
  }
  return null;
}

// ─── COMPOSITOR: Logo overlay con Jimp ───────────────────────────────────────
async function compositeWithLogo(imgData, isFutbol) {
  try {
    const bgImage = await Jimp.read(Buffer.from(imgData, 'base64'));
    
    // Leer settings.json
    const configPath = path.join(__dirname, '../frontend/public/database/settings.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (e) {}
    }
    
    const profileKey = isFutbol ? 'futbol' : 'principal';
    const profile = config[profileKey] || {};
    const branding = profile.branding || {};
    let relativeFramePath = branding.frame;
    
    if (relativeFramePath) {
      if (relativeFramePath.startsWith('./')) relativeFramePath = relativeFramePath.substring(2);
      const framePath = path.join(__dirname, '../frontend/public', relativeFramePath);
      if (fs.existsSync(framePath)) {
        const frameImage = await Jimp.read(framePath);
        frameImage.resize(bgImage.bitmap.width, bgImage.bitmap.height);
        bgImage.composite(frameImage, 0, 0);
        
        const finalBuffer = await bgImage.getBufferAsync(Jimp.MIME_JPEG);
        return `data:image/jpeg;base64,${finalBuffer.toString('base64')}`;
      }
    }

    return `data:image/jpeg;base64,${imgData}`;
  } catch (err) {
    console.error("[ERROR] compositeWithLogo failed:", err.message);
    return `data:image/jpeg;base64,${imgData}`;
  }
}

// ─── PIPELINE DE GENERACIÓN MULTIMODAL CON GEMINI 2.5 FLASH IMAGE ───────────
async function generateGeminiImage(base64Photo, options) {
  try {
    console.log("[DEBUG] Iniciando pipeline de generación multimodal...");
    const cleanBase64 = base64Photo.includes(",") ? base64Photo.split(",")[1] : base64Photo;
    const isGroup = options.gender === 'group';

    // 1. Análisis visual del usuario
    const visionAnalysis = await analyzePhotoWithVision(cleanBase64, isGroup);
    let numPeople = 1;
    if (isGroup) {
      pregMatches = visionAnalysis?.match(/===\s*PERSON\s*\d+\s*===/gi);
      numPeople = pregMatches ? pregMatches.length : 2;
    }
    numPeople = Math.max(1, Math.min(numPeople, 5));

    // 2. Detección y recorte de caras del usuario
    const faceCrops = [];
    const faceBoxes = await detectFaceBBoxes(cleanBase64, numPeople);
    for (const box of faceBoxes) {
      const crop = await cropFaceRegion(cleanBase64, box);
      if (crop) faceCrops.push(crop);
    }
    // Fallback heurístico de cara si no se detectó ninguna
    if (faceCrops.length === 0) {
      const fallbackBox = { y_min: 100, x_min: 300, y_max: 450, x_max: 700 };
      const crop = await cropFaceRegion(cleanBase64, fallbackBox);
      if (crop) faceCrops.push(crop);
    }

    // 3. Definición de la escena y vestimenta
    const isFutbol = options.category === 'futbol';
    const scenarioDesc = isFutbol
      ? 'a professional sports commentator cabin with a desk and microphones in a stadium, blurred soccer pitch with supporter crowd in the background during a Mexico soccer match. There are absolutely NO logos, brand signs, or text anywhere in the cabin or background; it is completely free of any logos.'
      : (SCENARIO_MAP[options.selection] || SCENARIO_MAP['jardin']);

    // 4. Construcción del Prompt Multimodal
    let finalPrompt = "";
    if (isFutbol) {
      finalPrompt = `
=== PRIMARY TASK: REALISTIC SPORTS PHOTO GENERATION ===
Generate a highly realistic, professional sports commentary portrait featuring three people standing together: 
1. The candidate (Toño Martín del Campo, shown in CANDIDATE REFERENCE IMAGE)
2. Kikín Fonseca (the soccer commentator, shown in KIKIN REFERENCE IMAGE)
3. The person (or group of people, shown in IMAGE 1 / FACE REFERENCE IMAGES)

=== SCENE ===
- Background Setting: ${scenarioDesc}
- The background backdrop shows a blurred soccer field pitch, stadium lights, and excited fans.
- The environment is a commentator booth with professional microphones.
- NO LOGOS: There are absolutely no logos, signs, decals, or text in the commentator cabin or background.

=== POSING & INTERACTION ===
- The user, Toño Martín del Campo, and Kikín Fonseca are sports commentators looking away from the camera, looking towards the soccer match on the pitch, reacting with intense excitement, cheering, and celebrating, gesturing dynamically. They are NOT looking at the camera.
- Very natural, organic, and heartfelt posture, celebrating a goal or victory of Mexico.

=== CHARACTER SPECIFICATIONS ===
- CANDIDATE (Toño Martín del Campo): Replicate the exact facial features, hair, build, and charismatic smile of the candidate from the CANDIDATE REFERENCE IMAGE. His hair MUST be solid black. He must NEVER have white, gray, or brown hair.
- KIKIN FONSECA: Replicate the exact facial features, hair, build, and smile from the KIKIN REFERENCE IMAGE. He has a very light stubble or is clean-shaven. He must NEVER have a thick, bushy, or frondose beard.
- USER(S): Replicate the exact facial features, skin tone, hair color/style, eye color, and smile of the person (or people) from the FACE REFERENCE IMAGES.
- All characters are dressed in neat, official green Mexican national soccer team jerseys (completely clean with NO corporate logos or advertising) or professional plain blazers/suits.

=== IDENTITY & QUALITY RULES — STRICT ===
1. IDENTITY PRESERVATION: Maintain a 100% perfect likeness of the user's face from the FACE REFERENCE IMAGES.
2. CANDIDATE PRESERVATION: Maintain a 100% perfect likeness of candidate Toño Martín del Campo.
3. KIKIN PRESERVATION: Maintain a 100% perfect likeness of Kikín Fonseca.
4. NO CLONING: The user, Toño, and Kikín must be completely separate, distinct individuals.
5. FOTORREALISMO: Perfect photographic quality, realistic skin textures, 8k resolution, soft stadium lighting, professional photography.
6. NO watermarks, signatures, double faces, extra limbs, or synthetic text overlays.
7. The final output must be 100% complete with a clean crop.
`;
    } else {
      finalPrompt = `
=== PRIMARY TASK: REALISTIC CAMPAIGN PHOTO GENERATION ===
Generate a highly realistic, professional campaign portrait featuring BOTH the candidate (Toño Martín del Campo, shown in CANDIDATE REFERENCE IMAGE) and the person (or group of people, shown in IMAGE 1 / FACE REFERENCE IMAGES) standing side-by-side.

=== SCENE ===
- Background: Use the provided reference backgrounds to recreate the event atmosphere.

=== POSING & INTERACTION ===
- The candidate (Toño Martín del Campo) and the user are standing close together in a warm, friendly, natural pose.
- Toño has his arm around the user's shoulder in a supportive, charismatic campaign gesture.
- Both characters are looking directly at the camera and smiling warmly and confidently.
- Very natural, organic, and heartfelt posture. NOT stiff or artificial.

=== CHARACTER SPECIFICATIONS ===
- CANDIDATE (Toño Martín del Campo): Replicate the exact facial features, hair, build, and charismatic smile of the candidate from the CANDIDATE REFERENCE IMAGE.
- USER(S): Replicate the exact facial features, skin tone, hair color/style, eye color, and smile of the person (or people) from the FACE REFERENCE IMAGES.
- Both characters are dressed in neat, professional business-casual or campaign attire (e.g. white or light-blue button-down shirts, or executive wear).

=== IDENTITY & QUALITY RULES — STRICT ===
1. IDENTITY PRESERVATION: Maintain a 100% perfect likeness of the user's face from the FACE REFERENCE IMAGES.
2. CANDIDATE PRESERVATION: Maintain a 100% perfect likeness of the candidate Toño Martín del Campo.
3. NO CLONING: The user and Toño must be completely separate, distinct individuals.
4. FOTORREALISMO: Perfect photographic quality, realistic skin textures, 8k resolution, soft campaign studio lighting, professional photography.
5. NO watermarks, signatures, double faces, extra limbs, or synthetic text overlays.
6. The final output must be 100% complete with a clean 3:4 or 4:3 crop (characters fully visible).
`;
    }

    // 5. Armar Partes Multimodales para la API
    const parts = [
      { text: isFutbol 
          ? "You are an expert photo editor. Your task is to generate a realistic photo of the user standing together with candidate Toño Martín del Campo and commentator Kikín Fonseca as sports commentators inside a broadcast booth, holding microphones and celebrating, looking at the camera."
          : "You are an expert photo editor. Your task is to generate a realistic photo of the user standing together with the political candidate Toño Martín del Campo, in a natural friendly pose, embracing by the shoulder, smiling at the camera." 
      },
      { text: isGroup ? "[IMAGE 1 - ORIGINAL USER PHOTO (Group)]:" : "[IMAGE 1 - ORIGINAL USER PHOTO (Single)]:" },
      { inline_data: { mime_type: "image/jpeg", data: cleanBase64 } }
    ];

    // Inyectar recortes de cara de usuario
    faceCrops.forEach((cropB64, idx) => {
      parts.push({ text: `[FACE REFERENCE IMAGE ${idx + 1} - User Face]: Use this exact face with perfect similarity in the final image.` });
      parts.push({ inline_data: { mime_type: "image/jpeg", data: cropB64 } });
    });

    // Inyectar foto del candidato Toño Martín del Campo como referencia primordial
    if (candidatePhotoBase64) {
      parts.push({ text: "[CANDIDATE REFERENCE IMAGE - Toño Martín del Campo]: This is the candidate. You must replicate his face, hair, and smile with perfect, pixel-perfect accuracy in the generated image." });
      parts.push({ inline_data: { mime_type: "image/jpeg", data: candidatePhotoBase64 } });
    }

    // Inyectar foto de Kikín Fonseca si es fútbol
    if (isFutbol && kikinPhotoBase64) {
      parts.push({ text: "[KIKIN REFERENCE IMAGE - Kikín Fonseca]: This is the soccer commentator Kikín Fonseca. You must replicate his face, hair, and smile with perfect, pixel-perfect accuracy in the generated image." });
      parts.push({ inline_data: { mime_type: "image/png", data: kikinPhotoBase64 } });
    }

    // Inyectar fondos si NO es fútbol
    if (!isFutbol) {
      const assetsDir = path.join(__dirname, '../frontend/public/assets_ia');
      try {
        if (fs.existsSync(path.join(assetsDir, 'fondo_evento_base.png'))) {
          parts.push({ text: "[REFERENCE IMAGE 1 - EVENT BACKGROUND]: Use this exact background environment, including the people and the structural layout." });
          parts.push({ inline_data: { mime_type: "image/png", data: fs.readFileSync(path.join(assetsDir, 'fondo_evento_base.png')).toString('base64') } });
        }
        if (fs.existsSync(path.join(assetsDir, 'pancartas_fondo.jpeg'))) {
          parts.push({ text: "[REFERENCE IMAGE 2 - BANNERS]: Integrate these exact banners into the background seamlessly." });
          parts.push({ inline_data: { mime_type: "image/jpeg", data: fs.readFileSync(path.join(assetsDir, 'pancartas_fondo.jpeg')).toString('base64') } });
        }
        if (fs.existsSync(path.join(assetsDir, 'logo_evento.png'))) {
          parts.push({ text: "[REFERENCE IMAGE 3 - EVENT LOGO]: Integrate this event logo seamlessly in the background structure (e.g. on a screen or backdrop). DO NOT add the candidate's personal logo." });
          parts.push({ inline_data: { mime_type: "image/png", data: fs.readFileSync(path.join(assetsDir, 'logo_evento.png')).toString('base64') } });
        }
      } catch (err) {
        console.warn("[WARN] Could not load background images:", err.message);
      }
    }

    // Inyectar prompt de texto final
    parts.push({ text: finalPrompt });

    // 6. Enviar a Gemini 3.1 Flash Image
    console.log("[DEBUG] Enviando a Gemini 3.1 Flash Image...");
    const geminiGenUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${GEMINI_API_KEY}`;
    
    const aspectRatio = isGroup ? '4:3' : '3:4';

    const res = await axios.post(geminiGenUrl, {
      contents: [{ parts: parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio,
        }
      }
    }, { timeout: 120000 });

    console.log("[DEBUG] Respuesta de Gemini Image recibida.");

    // Helper: extraer imagen del response
    const extractImg = (data) => {
      let bytes = '';
      const cands = data?.candidates || [];
      for (const cand of cands) {
        for (const p of cand.content?.parts || []) {
          if (p.inlineData?.data && p.inlineData.data.length > 100) return p.inlineData.data;
          if (p.inline_data?.data && p.inline_data.data.length > 100) return p.inline_data.data;
        }
      }
      // Búsqueda de respaldo
      JSON.stringify(data, (key, value) => {
        if (typeof value === 'string' && value.length > 1000 && ['data', 'imageBytes', 'bytesBase64Encoded'].includes(key)) {
          bytes = value;
        }
        return value;
      });
      return bytes;
    };

    let imgBytes = extractImg(res.data);
    let finishReason = res.data?.candidates?.[0]?.finishReason || 'UNKNOWN';

    // Retry automático si el modelo bloqueó
    if (!imgBytes && ['OTHER', 'SAFETY', 'UNKNOWN'].includes(finishReason)) {
      console.warn(`[WARN] Primer intento bloqueado (${finishReason}). Reintentando con prompt simplificado...`);
      const retryParts = parts.filter(p => p.inline_data || p.inlineData);
      retryParts.push({ text: 'Create a fun, festive photo-realistic composite image. ' + finalPrompt });
      const retryPayload = {
        contents: [{ parts: retryParts }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio } }
      };
      try {
        const res2 = await axios.post(geminiGenUrl, retryPayload, { timeout: 120000 });
        imgBytes = extractImg(res2.data);
        finishReason = res2.data?.candidates?.[0]?.finishReason || finishReason;
      } catch (e) { console.warn('[WARN] Retry 1 falló:', e.message); }

      // Fallback a gemini-2.5-flash-image
      if (!imgBytes) {
        console.warn('[WARN] Usando modelo fallback gemini-2.5-flash-image...');
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`;
        try {
          const res3 = await axios.post(fallbackUrl, retryPayload, { timeout: 120000 });
          imgBytes = extractImg(res3.data);
          finishReason = res3.data?.candidates?.[0]?.finishReason || finishReason;
        } catch (e) { console.warn('[WARN] Fallback falló:', e.message); }
      }
    }

    if (!imgBytes) {
      console.error("[ERROR] Respuesta de Gemini vacía. finishReason:", finishReason, JSON.stringify(res.data).substring(0, 500));
      throw new Error(`finishReason=${finishReason}. ${res.data?.error?.message || 'No image bytes received from Gemini'}`);
    }

    // 7. Compositar marco activo
    console.log("[DEBUG] Compositando marco activo...");
    const processedImageBase64 = await compositeWithLogo(imgBytes, isFutbol);
    console.log("[DEBUG] Pipeline de generación completado exitosamente.");

    return {
      imageUrl: processedImageBase64,
      status: 'success'
    };

  } catch (error) {
    console.error('[ERROR] generateGeminiImage falló:', error.response?.data || error.message);
    throw error;
  }
}

app.post('/api/process-photo', async (req, res) => {
  try {
    const { photo, options } = req.body;
    const sessionId = Date.now().toString();

    const aiResult = await generateGeminiImage(photo, options);

    // QR redirect para descargar la foto localmente
    // Cuando el usuario escanee el QR local, apuntará al servidor local de dev
    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const qrUrl = `${protocol}://${host}/admin.php?action=download_image&id=${sessionId}`;

    res.json({
      processedImage: aiResult.imageUrl,
      qrUrl: qrUrl,
      sessionId: sessionId
    });

  } catch (error) {
    console.error('Error in backend api route:', error.message);
    res.status(500).json({ error: 'Failed to process photo activation', details: error.message });
  }
});

// Configuración para servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));

const distPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res.json({ message: "Servidor Express corriendo localmente. Accede a http://localhost:3000 para el frontend en modo dev." });
  });
}

app.listen(PORT, () => {
  console.log(`Backend de Activación de Toño corriendo en http://localhost:${PORT}`);
});
