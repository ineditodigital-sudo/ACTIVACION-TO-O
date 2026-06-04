require('dotenv').config();
const axios = require('axios');

// Usar la key de producción (auth_config.php)
const KEY = 'AIzaSyDlAHQrtWakTTQJCxCkMQjPi3Ez_6lhg1A';

const IMAGEN_MODELS = [
    'imagen-4.0-generate-001',
    'imagen-4.0-ultra-generate-001',
    'imagen-3.0-generate-001',
    'imagen-3.0-generate-002',
];

const GEMINI_IMAGE_MODELS = [
    'gemini-2.5-flash-image',
    'gemini-2.5-flash-preview-05-20',
    'gemini-2.0-flash-exp',
    'gemini-2.5-flash-preview-04-17',
];

async function testImagenModel(model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateImages?key=${KEY}`;
    try {
        const r = await axios.post(url, {
            instances: [{ prompt: 'a red apple on white background' }],
            parameters: { sampleCount: 1, outputMimeType: 'image/jpeg' }
        }, { timeout: 45000 });
        const hasImg = !!(r.data?.generatedImages?.[0] || r.data?.predictions?.[0]);
        return `✅ FUNCIONA - imagen generada: ${hasImg}`;
    } catch (e) {
        const code = e.response?.status || 'NET';
        const msg = e.response?.data?.error?.message || e.message;
        return `❌ [${code}] ${msg.substring(0, 100)}`;
    }
}

async function testGeminiImageModel(model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
    try {
        const r = await axios.post(url, {
            contents: [{ parts: [{ text: 'Generate a simple image of a red apple' }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
        }, { timeout: 45000 });
        // Check if image was returned
        const parts = r.data?.candidates?.[0]?.content?.parts || [];
        const hasImg = parts.some(p => p.inlineData?.data || p.inline_data?.data);
        return `✅ FUNCIONA - imagen en respuesta: ${hasImg}`;
    } catch (e) {
        const code = e.response?.status || 'NET';
        const msg = e.response?.data?.error?.message || e.message;
        return `❌ [${code}] ${msg.substring(0, 100)}`;
    }
}

async function main() {
    console.log('=== PROBANDO MODELOS IMAGEN (generateImages endpoint) ===');
    for (const m of IMAGEN_MODELS) {
        const result = await testImagenModel(m);
        console.log(`  ${m}: ${result}`);
    }

    console.log('\n=== PROBANDO MODELOS GEMINI (generateContent + IMAGE modality) ===');
    for (const m of GEMINI_IMAGE_MODELS) {
        const result = await testGeminiImageModel(m);
        console.log(`  ${m}: ${result}`);
    }

    console.log('\n=== MODELO ACTUAL EN PRODUCCIÓN ===');
    console.log('  gemini-2.5-flash-image (en admin.php)');
    const currentResult = await testGeminiImageModel('gemini-2.5-flash-image');
    console.log(`  Resultado: ${currentResult}`);
}

main().catch(console.error);
