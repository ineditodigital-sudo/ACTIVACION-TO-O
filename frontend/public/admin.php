<?php
/**
 * ACTIVACIÓN TOÑO MARTÍN DEL CAMPO - NANO BANANA 3.1
 * Lógica de 2 Etapas: Visión (Gemini 1.5 Flash) + Generación (Gemini 2.5 Flash Image)
 * QR: Token system via save_qr_token + view_photo
 */
// CRÍTICO: Forzar a Cloudflare a no cachear NINGUNA respuesta de este archivo
header('Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('Surrogate-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Manejar preflight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Buffer de salida principal
ob_start();

if (file_exists(__DIR__ . '/auth_config.php')) {
    require_once __DIR__ . '/auth_config.php';
}

// Iniciar sesión para el panel de administración
session_start();

$KEY       = $GLOBALS['GEMINI_API_KEY'] ?? '';
$FRAME_PATH = __DIR__ . '/frame_feria.png';

// ─── Función helper CURL ───────────────────────────────────────────
function geminiPost(string $url, array $payload): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT        => 90,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    ]);
    $res  = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($err) return ['_curl_error' => $err];
    return json_decode($res, true) ?? ['_parse_error' => substr($res, 0, 300)];
}

// ─── Función helper: Guardar imagen en disco para QR ──────────────
function saveImageForQR(string $b64, string $dir): ?string {
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
    }
    @chmod($dir, 0777);
    $filename  = 'img_' . uniqid() . '.jpg';
    $filepath  = $dir . '/' . $filename;
    $bytes     = base64_decode($b64);
    if ($bytes && file_put_contents($filepath, $bytes) !== false) {
        @chmod($filepath, 0666);
        return $filename;
    }
    return null;
}

// ── HELPER: Detectar caras y obtener bounding boxes vía Gemini Vision ──────
// Retorna array de [ ['y_min'=>N, 'x_min'=>N, 'y_max'=>N, 'x_max'=>N], ... ]
// Valores en escala 0-1000 (formato nativo de Gemini)
function detectFaceBBoxes(string $base64Img, string $apiKey, int $personCount): array {
    $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={$apiKey}";
    
    $numDesc = $personCount === 1 ? 'one person' : "{$personCount} people";
    $prompt =
        "Locate the face(s) of {$numDesc} in this image. "
        . "For each face, return its bounding box as a JSON array. "
        . "Use this EXACT format with NO other text:\n"
        . '[{"person":1,"y_min":150,"x_min":300,"y_max":450,"x_max":600}]' . "\n"
        . "Rules:\n"
        . "- Values are integers 0-1000 (0=top/left edge, 1000=bottom/right edge).\n"
        . "- Include the full head (forehead to chin) plus a bit of neck. Make the box generous.\n"
        . "- Order people left-to-right as they appear in the photo.\n"
        . "- Return ONLY the JSON array. No markdown, no explanation.";

    $payload = [
        'contents' => [[
            'parts' => [
                ['text' => $prompt],
                ['inline_data' => ['mime_type' => 'image/jpeg', 'data' => $base64Img]],
            ],
        ]],
        'generationConfig' => ['temperature' => 0.0, 'maxOutputTokens' => 256],
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    ]);
    $res = curl_exec($ch);
    curl_close($ch);

    $data = json_decode($res, true);
    $text = trim($data['candidates'][0]['content']['parts'][0]['text'] ?? '');

    // Limpiar posibles bloques de markdown
    $text = preg_replace('/```json\s*/i', '', $text);
    $text = preg_replace('/```/', '', $text);
    $text = trim($text);

    // Intentar parsear el JSON
    $boxes = json_decode($text, true);
    if (!is_array($boxes)) return [];

    // Validar estructura
    $valid = [];
    foreach ($boxes as $box) {
        if (isset($box['y_min'], $box['x_min'], $box['y_max'], $box['x_max'])) {
            $valid[] = [
                'y_min' => max(0, min(1000, (int)$box['y_min'])),
                'x_min' => max(0, min(1000, (int)$box['x_min'])),
                'y_max' => max(0, min(1000, (int)$box['y_max'])),
                'x_max' => max(0, min(1000, (int)$box['x_max'])),
            ];
        }
    }
    return $valid;
}

// ── HELPER: Recortar cara de la imagen usando GD ──────────────────────────
// Retorna base64 del recorte, o null si GD no está disponible
function cropFaceRegion(string $base64Img, int $yMin, int $xMin, int $yMax, int $xMax, float $padding = 0.55): ?string {
    if (!function_exists('imagecreatefromstring')) return null;

    $imgData = base64_decode($base64Img);
    $srcImg  = @imagecreatefromstring($imgData);
    if (!$srcImg) return null;

    $srcW = imagesx($srcImg);
    $srcH = imagesy($srcImg);

    // Convertir de escala 0-1000 a píxeles
    $px1 = (int)($xMin / 1000 * $srcW);
    $py1 = (int)($yMin / 1000 * $srcH);
    $px2 = (int)($xMax / 1000 * $srcW);
    $py2 = (int)($yMax / 1000 * $srcH);

    // Añadir padding dinámico
    $padX = (int)(($px2 - $px1) * $padding);
    $padY = (int)(($py2 - $py1) * $padding);
    $px1  = max(0, $px1 - $padX);
    $py1  = max(0, $py1 - $padY);
    $px2  = min($srcW, $px2 + $padX);
    $py2  = min($srcH, $py2 + $padY);

    $cropW = $px2 - $px1;
    $cropH = $py2 - $py1;
    if ($cropW < 20 || $cropH < 20) {
        imagedestroy($srcImg);
        return null;
    }

    $dstImg = imagecreatetruecolor($cropW, $cropH);
    imagecopy($dstImg, $srcImg, 0, 0, $px1, $py1, $cropW, $cropH);

    ob_start();
    imagejpeg($dstImg, null, 95);
    $output = ob_get_clean();

    imagedestroy($srcImg);
    imagedestroy($dstImg);

    return base64_encode($output);
}

// ─────────────────────────────────────────────────────────────────
$rawInput = file_get_contents('php://input');
$input    = json_decode($rawInput, true);
$action   = $_GET['action'] ?? ($input['action'] ?? '');

// ══════════════════════════════════════════════════════════════════
//  ACCIÓN: debug_gen  (diagnóstico de generación de imagen)
// ══════════════════════════════════════════════════════════════════
if ($action === 'debug_gen') {
    $genUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key={$KEY}";
    $payload = [
        'contents' => [['parts' => [['text' => 'A simple red cartoon circle on white background']]]],
        'generationConfig' => ['responseModalities' => ['TEXT', 'IMAGE']],
    ];
    $result = geminiPost($genUrl, $payload);

    $imgFound = false;
    $finishReason = $result['candidates'][0]['finishReason'] ?? 'N/A';
    foreach ($result['candidates'][0]['content']['parts'] ?? [] as $p) {
        if (isset($p['inlineData']['data']) || isset($p['inline_data']['data'])) $imgFound = true;
    }

    ob_end_clean();
    header('Content-Type: application/json');
    echo json_encode([
        'key_len'       => strlen($KEY),
        'img_found'     => $imgFound,
        'finish_reason' => $finishReason,
        'error'         => $result['error']['message'] ?? ($result['_curl_error'] ?? null),
        'top_keys'      => array_keys($result),
        'candidate_keys'=> array_keys($result['candidates'][0] ?? []),
    ], JSON_PRETTY_PRINT);
    exit;
}

// ══════════════════════════════════════════════════════════════════
//  ACCIÓN: save_qr_token  (guardar imagen y generar token único de QR)
// ══════════════════════════════════════════════════════════════════
if ($action === 'save_qr_token') {
    $imgB64  = $input['img'] ?? '';
    if (!$imgB64) {
        ob_end_clean();
        echo json_encode(['error' => 'No image data']);
        exit;
    }

    $outputDir = __DIR__ . '/outputs';
    if (!is_dir($outputDir)) @mkdir($outputDir, 0777, true);
    @chmod($outputDir, 0777);

    // Token único de 16 chars
    $token    = bin2hex(random_bytes(8));
    $filename = 'qr_' . $token . '.jpg';
    $filepath = $outputDir . '/' . $filename;
    $bytes    = base64_decode($imgB64);

    if ($bytes && file_put_contents($filepath, $bytes) !== false) {
        @chmod($filepath, 0644);
        ob_end_clean();
        echo json_encode(['token' => $token]);
    } else {
        ob_end_clean();
        echo json_encode(['error' => 'No se pudo guardar la imagen', 'dir_writable' => is_writable($outputDir)]);
    }
    exit;
}

// ══════════════════════════════════════════════════════════════════
//  ACCIÓN: view_photo  (pantalla de descarga para el celular)
// ══════════════════════════════════════════════════════════════════
if ($action === 'view_photo') {
    $token    = preg_replace('/[^a-f0-9]/', '', $_GET['token'] ?? '');
    $filename = 'qr_' . $token . '.jpg';
    $filepath = __DIR__ . '/outputs/' . $filename;

    ob_end_clean();

    if (!$token || !file_exists($filepath)) {
        header('Content-Type: text/html; charset=utf-8');
        echo '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
           . '<body style="font-family:sans-serif;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;text-align:center">'
           . '<div><h2>Imagen no disponible</h2><p style="color:#999;margin-top:10px">La sesión ha expirado. Vuelve al kiosco para una nueva foto.</p></div></body></html>';
        exit;
    }

    // Si pide descarga directa
    if (isset($_GET['dl'])) {
        header('Content-Type: image/jpeg');
        header('Content-Disposition: attachment; filename="MiFotoConTono.jpg"');
        header('Content-Length: ' . filesize($filepath));
        header('Cache-Control: no-store');
        readfile($filepath);
        exit;
    }

    // Página de aterrizaje para el celular
    $imgB64Encoded = base64_encode(file_get_contents($filepath));
    $dlUrl = '?action=view_photo&token=' . urlencode($token) . '&dl=1';
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo '<!DOCTYPE html><html lang="es"><head>';
    echo '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">';
    echo '<meta property="og:title" content="Mi Foto con ToÃ±o">';
    echo '<title>Tu Foto con ToÃ±o</title>';
    echo '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap" rel="stylesheet">';
    echo '<style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Outfit,sans-serif;background:#000;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;overflow-x:hidden}
        .mesh-bg{position:fixed;inset:0;z-index:0;filter:blur(80px);opacity:0.6}
        .c1{position:absolute;top:10%;left:10%;width:400px;height:400px;background:#0A4F8F;border-radius:50%}
        .c2{position:absolute;bottom:10%;right:10%;width:400px;height:400px;background:#2563EB;border-radius:50%}
        .wrap{position:relative;z-index:10;width:100%;max-width:400px;text-align:center;background:rgba(255,255,255,0.05);backdrop-filter:blur(25px);border-radius:32px;padding:32px 24px;box-shadow:0 40px 100px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1)}
        .logo{height:50px;margin-bottom:30px;}
        .photo-wrap{width:100%;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.2);margin-bottom:24px;box-shadow:0 20px 40px rgba(0,0,0,0.3)}
        .photo{width:100%;display:block;height:auto}
        h1{font-size:24px;font-weight:900;text-transform:uppercase;margin-bottom:12px;letter-spacing:0.1em}
        p{color:rgba(255,255,255,0.5);font-size:14px;margin-bottom:24px;line-height:1.6;font-weight:600}
        .btn{display:flex;align-items:center;justify-content:center;width:100%;padding:18px;border-radius:20px;font-family:Outfit,sans-serif;font-weight:900;font-size:16px;text-transform:uppercase;letter-spacing:0.1em;text-decoration:none;background:#fff;color:#000;transition:transform 0.2s;box-shadow:0 10px 25px rgba(255,255,255,0.15)}
        .btn:active{transform:scale(0.97)}
        .btn-share{display:flex;align-items:center;justify-content:center;width:100%;padding:18px;border-radius:20px;font-family:Outfit,sans-serif;font-weight:900;font-size:16px;text-transform:uppercase;letter-spacing:0.1em;text-decoration:none;background:linear-gradient(135deg, #0A4F8F, #002f6c);color:#fff;border:none;margin-top:14px;cursor:pointer;transition:transform 0.2s;box-shadow:0 10px 25px rgba(10,79,143,0.3)}
        .btn-share:active{transform:scale(0.97)}
        .btn-share:disabled{opacity:0.7;cursor:not-allowed}
        .btn svg, .btn-share svg{margin-right:10px;flex-shrink:0}
        .tip{color:rgba(255,255,255,0.3);font-size:11px;margin-top:20px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase}
    </style>';
    echo '</head><body>
    <div class="mesh-bg"><div class="c1"></div><div class="c2"></div></div>
    <div class="wrap">';
    echo '<img src="logo-tono-martin-del-campo.png" class="logo" alt="Toño Martín del Campo">';
    echo '<div class="photo-wrap"><img src="data:image/jpeg;base64,' . $imgB64Encoded . '" class="photo" alt="Tu Foto"></div>';
    echo '<h1>¡TU FOTO LISTA!</h1>';
    echo '<p>Guarda este recuerdo de tu encuentro con Toño Martín del Campo.</p>';
    echo '<a href="' . $dlUrl . '" class="btn">';
    echo '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
    echo 'DESCARGAR FOTO</a>';
    echo '<button class="btn-share" onclick="sharePhoto()">';
    echo '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>';
    echo 'COMPARTIR FOTO</button>';
    echo '<div class="tip">MANTÉN PRESIONADA PARA GUARDAR</div>';
    echo '</div>';
    echo '<script>
    async function sharePhoto() {
        const shareBtn = document.querySelector(".btn-share");
        const originalText = shareBtn.innerHTML;
        
        if (!navigator.share) {
            alert("Tu navegador no soporta la opción de compartir directamente. Puedes guardar la imagen dejando presionada la foto y compartirla en tus redes.");
            return;
        }
        
        try {
            shareBtn.disabled = true;
            shareBtn.style.opacity = "0.7";
            shareBtn.innerHTML = "Preparando...";
            
            const imgElement = document.querySelector(".photo");
            const response = await fetch(imgElement.src);
            const blob = await response.blob();
            const file = new File([blob], "MiFotoConTono.jpg", { type: "image/jpeg" });
            
            const shareData = {
                title: "Mi Foto con ToÃ±o",
                text: "¡Mira mi foto del Congreso Unidas 2026!",
            };
            
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                shareData.files = [file];
            } else {
                shareData.url = window.location.href;
            }
            
            await navigator.share(shareData);
        } catch (err) {
            console.log("Error sharing:", err);
            // Intentar compartir solo texto/link como fallback si falló con archivo
            try {
                await navigator.share({
                    title: "Mi Foto con ToÃ±o",
                    text: "¡Mira mi foto del Congreso Unidas 2026!",
                    url: window.location.href
                });
            } catch (err2) {
                console.log("Fallback sharing failed:", err2);
            }
        } finally {
            shareBtn.disabled = false;
            shareBtn.style.opacity = "1";
            shareBtn.innerHTML = originalText;
        }
    }
    </script>';
    echo '</body></html>';
    exit;
}

// ══════════════════════════════════════════════════════════════════
//  ACCIÓN: save_lead  (guardar datos del usuario)
// ══════════════════════════════════════════════════════════════════
if ($action === 'save_lead') {
    $leadsFile = __DIR__ . '/database/leads.json';
    $leadsDir  = dirname($leadsFile);
    if (!is_dir($leadsDir)) @mkdir($leadsDir, 0755, true);

    $leads = [];
    if (file_exists($leadsFile)) {
        $leads = json_decode(file_get_contents($leadsFile), true) ?? [];
    }

    $newLead = [
        'id'        => uniqid(),
        'timestamp' => date('Y-m-d H:i:s'),
        'name'      => $input['name']  ?? '',
        'phone'     => $input['phone'] ?? '',
        'email'     => $input['email'] ?? '',
    ];
    $leads[] = $newLead;
    file_put_contents($leadsFile, json_encode($leads, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    ob_end_clean();
    echo json_encode(['status' => 'ok', 'id' => $newLead['id']]);
    exit;
}

// ══════════════════════════════════════════════════════════════════
//  ACCIÓN: process (o payload con 'p') – Generación de imagen
// ══════════════════════════════════════════════════════════════════
if (isset($input['p']) || $action === 'process') {

    $userPhotoB64 = '';
    if (isset($input['p'])) {
        $raw = $input['p'];
        $userPhotoB64 = (strpos($raw, ',') !== false) ? explode(',', $raw)[1] : $raw;
    }

    $opts      = $input['o'] ?? [];
    $category  = $opts['category']  ?? 'feria';
    $selection = $opts['selection'] ?? 'rueda';
    $gender    = $opts['gender']    ?? 'male';
    $userData  = $input['u'] ?? [];

    // Load candidate's reference photo (Toño Martín del Campo)
    $candidatePhotoPath = __DIR__ . '/martin-del-campo.jpg';
    $candidatePhotoBase64 = '';
    if (file_exists($candidatePhotoPath)) {
        $candidatePhotoBase64 = base64_encode(file_get_contents($candidatePhotoPath));
    }

    // Load Kikín Fonseca's reference photo (soccer mode only)
    $kikinPhotoPath = __DIR__ . '/kikin-fonseca.png';
    $kikinPhotoBase64 = '';
    if ($category === 'futbol' && file_exists($kikinPhotoPath)) {
        $kikinPhotoBase64 = base64_encode(file_get_contents($kikinPhotoPath));
    }

    if ($gender === 'group') {
        $genderText = 'MULTIPLE PEOPLE (group)';
        $visionGenderInstruction = 'Identify the exact gender (Male/Female) of this specific person from the photo';
        $primaryTaskText = 'Generate a highly realistic, professional campaign portrait featuring BOTH the candidate (Toño Martín del Campo, shown in CANDIDATE REFERENCE IMAGE) and the people from IMAGE 1 standing side-by-side in a friendly embrace.';
        $outfitInstruction = 'Dress EVERY person in clean, neat, professional business-casual or campaign attire (e.g. white or light-blue button-down shirts, or executive wear).';
    } else {
        $genderText = ($gender === 'female') ? 'FEMALE (woman/girl)' : 'MALE (man/boy)';
        $visionGenderInstruction = "{$genderText} (trust the user's selection)";
        $primaryTaskText = 'Generate a highly realistic, professional campaign portrait featuring BOTH the candidate (Toño Martín del Campo, shown in CANDIDATE REFERENCE IMAGE) and the person from IMAGE 1 standing side-by-side in a friendly embrace.';
        $outfitInstruction = 'Dress the person in clean, neat, professional business-casual or campaign attire (e.g. white or light-blue button-down shirts, or executive wear).';
    }

    // ── ETAPA 1: VISION (análisis profundo por persona) ──────────
    $visionUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={$KEY}";

    if ($gender === 'group') {
        $visionPrompt =
            "You are a professional character artist analyzing a GROUP PHOTO. "
            . "Count EXACTLY how many people are visible, then describe EACH person SEPARATELY.\n\n"
            . "For EACH person, use this STRICT FORMAT:\n\n"
            . "=== PERSON [N] ===\n"
            . "POSITION IN PHOTO: [leftmost / second from left / center / second from right / rightmost]\n"
            . "GENDER & AGE: [e.g., Woman approx 30-35 / Man approx 45]\n"
            . "BODY BUILD: [slim/slender | average/medium | athletic/muscular | curvy/full-figured | heavy-set | petite | tall-thin]\n"
            . "SKIN TONE: [very light/pale | fair | warm beige | light tan | medium tan | olive | medium brown | dark brown | very dark]\n"
            . "HEIGHT IMPRESSION: [short/average/tall compared to others]\n"
            . "HAIR: [exact color, length (short/medium/long), style (straight/wavy/curly/braided/up), accessories if any]\n"
            . "FACE SHAPE: [oval/round/square/heart/long]\n"
            . "EYES: [color, shape (almond/round/hooded), size, any makeup]\n"
            . "NOSE: [size: small/medium/large, shape: upturned/straight/broad/pointed]\n"
            . "LIPS: [thin/medium/full, any lipstick color]\n"
            . "JAWLINE: [sharp/soft/round/defined]\n"
            . "EYEBROWS: [thin/medium/thick, arched/flat/straight]\n"
            . "DISTINCTIVE FEATURES: [glasses frame+color if any, facial hair, moles, freckles, dimples, makeup details]\n"
            . "EXPRESSION & GAZE: [exact expression and where eyes look]\n"
            . "CLOTHING TOP: [exact type + color + patterns]\n"
            . "CLOTHING BOTTOM: [exact type + color]\n"
            . "ACCESSORIES: [jewelry, bags, hats, etc.]\n"
            . "UNIQUE TRAITS: [Describe their eye shape, nose shape, smile type, jawline, and any distinctive facial markings. Be exhaustively detailed about their facial structure to ensure a 1:1 match]\n\n"
            . "Return ONLY the formatted descriptions. Be extremely specific. Do NOT merge or average features across people.";
    } else {
        $visionPrompt =
            "You are a professional character artist. Analyze this photo with extreme precision to capture the person's exact likeness.\n\n"
            . "The user selected gender: {$genderText}.\n\n"
            . "Provide a HIGHLY DETAILED description following this format:\n\n"
            . "=== PERSON 1 ===\n"
            . "GENDER & AGE: [e.g., Woman approx 28-32 years old]\n"
            . "BODY BUILD: [slim/slender | average/medium | athletic/muscular | curvy/full-figured | heavy-set | petite]\n"
            . "SKIN TONE: [very light/pale | fair | warm beige | light tan | medium tan | olive | medium brown | dark brown | very dark]\n"
            . "HAIR: [exact color, length, style, texture, any accessories]\n"
            . "FACE SHAPE: [oval/round/square/heart/long]\n"
            . "EYES: [color, shape, size, any makeup — eye shadow, liner, mascara]\n"
            . "NOSE: [size and exact shape]\n"
            . "LIPS: [thickness, any lip color/gloss]\n"
            . "JAWLINE: [sharp/soft/defined/round]\n"
            . "EYEBROWS: [thin/medium/thick, arched/flat/straight]\n"
            . "DISTINCTIVE FEATURES: [ALL visible: glasses, facial hair, moles, freckles, dimples, wrinkles, makeup details]\n"
            . "EXPRESSION & GAZE: [exact expression and where eyes look — critical for likeness]\n"
            . "CLOTHING: [all garments worn, exact colors and patterns]\n"
            . "ACCESSORIES: [all visible accessories]\n"
            . "UNIQUE TRAITS: [Describe their eye shape, nose shape, smile type, jawline, and any distinctive facial markings. Be exhaustively detailed about their facial structure to ensure a 1:1 match]\n\n"
            . "Return ONLY the formatted description. Be extremely specific about facial features and expression.";
    }

    $vPayload = [
        'contents' => [[
            'parts' => [
                ['text' => $visionPrompt],
                ['inline_data' => ['mime_type' => 'image/jpeg', 'data' => $userPhotoB64]],
            ],
        ]],
        'generationConfig' => [
            'temperature' => 0.1,
            'maxOutputTokens' => 2048,
        ],
    ];

    $vData = geminiPost($visionUrl, $vPayload);
    $personDescription = trim($vData['candidates'][0]['content']['parts'][0]['text']
                      ?? "A {$genderText} person with distinctive facial features");

    // Si Pro falla, intentar Flash como fallback
    if (empty($personDescription) || isset($vData['_curl_error'])) {
        $visionUrlFallback = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={$KEY}";
        $vData2 = geminiPost($visionUrlFallback, $vPayload);
        $personDescription = trim($vData2['candidates'][0]['content']['parts'][0]['text']
                          ?? "A {$genderText} person with distinctive facial features");
    }

    // Extraer cantidad de personas desde la descripción
    $numPeople = 1;
    preg_match_all('/===\s*PERSON\s*\d+\s*===/i', $personDescription, $personMatches);
    if (!empty($personMatches[0])) {
        $numPeople = count($personMatches[0]);
    } elseif (preg_match('/([0-9]+)\s+people/i', $personDescription, $countMatch)) {
        $numPeople = (int)$countMatch[1];
    }
    if ($gender === 'group' && $numPeople === 1) $numPeople = 2;
    $numPeople    = max(1, min($numPeople, 6));
    $numPeopleText = $numPeople === 1 ? '1 (ONE)' : "{$numPeople}";

    // ── DETECCIÓN DE CARAS + RECORTE (Dual Face Reference) ─────────────────
    // Llamamos a Gemini Vision para obtener bounding boxes de cada cara.
    // Luego recortamos cada cara con GD y las guardamos para inyectarlas
    // como imágenes de referencia adicionales en el prompt de generación.
    $faceCrops = [];  // [{'data'=>'...', 'desc'=>'...'}, ...]
    $faceBoxes = detectFaceBBoxes($userPhotoB64, $KEY, $numPeople);
    foreach ($faceBoxes as $idx => $box) {
        $pId = $idx + 1;
        $cropTight  = cropFaceRegion($userPhotoB64, $box['y_min'], $box['x_min'], $box['y_max'], $box['x_max'], 0.15);
        $cropNormal = cropFaceRegion($userPhotoB64, $box['y_min'], $box['x_min'], $box['y_max'], $box['x_max'], 0.60);
        $cropBust   = cropFaceRegion($userPhotoB64, $box['y_min'], $box['x_min'], $box['y_max'], $box['x_max'], 1.30);
        
        if ($cropTight)  $faceCrops[] = ['data' => $cropTight,  'desc' => 'TIGHT FACE CLOSEUP', 'pId' => $pId];
        if ($cropNormal) $faceCrops[] = ['data' => $cropNormal, 'desc' => 'FULL HEAD CLOSEUP', 'pId' => $pId];
        if ($cropBust)   $faceCrops[] = ['data' => $cropBust,   'desc' => 'HEAD AND SHOULDERS BUST', 'pId' => $pId];
    }
    // Si la detección falló pero hay una sola persona, intentar recorte heurístico múltiple
    if (empty($faceCrops) && $numPeople === 1) {
        $h1 = cropFaceRegion($userPhotoB64, 0, 200, 400, 800, 0.2);
        $h2 = cropFaceRegion($userPhotoB64, 0, 200, 400, 800, 0.6);
        if ($h1) $faceCrops[] = ['data' => $h1, 'desc' => 'TIGHT FACE CLOSEUP', 'pId' => 1];
        if ($h2) $faceCrops[] = ['data' => $h2, 'desc' => 'FULL HEAD CLOSEUP', 'pId' => 1];
    }

    // ═══════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════
    //  MAPAS DE ESTILO DE CAMPAÑA - TOÑO MARTÍN DEL CAMPO
    // ═══════════════════════════════════════════════════════════════
    if ($category === 'futbol') {
        $scenarioDesc = 'a professional sports commentator cabin with a desk and microphones in a stadium, blurred soccer pitch with supporter crowd in the background during a Mexico soccer match. Lighting must be FLAT and NATURAL broadcasting light. Do NOT use dramatic shadows, HDR, or cinematic lighting. ABSOLUTELY NO LOGOS ALLOWED. Do NOT generate any broadcasting network logos, TV station logos, or sponsor logos anywhere.';
        $outfitDesc = 'generic plain green blank t-shirts or professional commentators blazers and suits. CLOTHING MUST BE 100% BLANK WITH NO LOGOS. Do NOT generate Nike, Adidas, Puma, or any sports brand logos on the clothing. No sponsor logos on the clothing.';
        $interactionDesc = 'The user, Toño Martín del Campo, and Kikín Fonseca are sports commentators looking away from the camera, looking towards the soccer match on the pitch, reacting with intense excitement, cheering, and celebrating, gesturing dynamically. They are NOT looking at the camera.';
    } else {
        $scenarioMap = [
            'jardin'    => 'the iconic Jardín de San Marcos in Aguascalientes, beautiful colonial arches, lush green gardens, bright sunny day, friendly campaign event atmosphere',
            'auditorio' => 'a grand modern conference auditorium, clean executive stage, elegant blue lighting, presentation screen with campaign graphic in the background',
            'oficina'   => 'a bright executive meeting office in Aguascalientes, clean glass window view of the city, professional business campaign atmosphere',
            'rally'     => 'a vibrant outdoor campaign rally, colorful flags, supporter crowd silhouettes blurred in the background, warm daylight',
        ];

        $scenarioDesc = $scenarioMap[$selection] ?? $scenarioMap['jardin'];
        $outfitDesc = 'neat, professional business-casual or campaign attire (e.g. white or light-blue button-down shirt, or executive wear)';
        $interactionDesc = 'The candidate (Toño Martín del Campo) and the user are standing close together in a warm, friendly, natural pose, with Toño having his arm around the user\'s shoulder.';
    }

    // ── LEER SETTINGS (PROMPT STUDIO) ─────────────────────────────
    $settingsFile = __DIR__ . '/database/settings.json';
    $customBasePrompt = 'Photorealistic political campaign photography, charismatic executive style, perfect facial likeness';
    $customNegativePrompt = 'cartoon, illustration, low quality, deformed, ugly, distorted faces, unrealistic, fat, overweight, thick, chubby, heavy, wide body, wide face, double chin, out of proportion, red carpet, gala, dress, high fashion';
    if (file_exists($settingsFile)) {
        $cfg = json_decode(file_get_contents($settingsFile), true);
        if (!empty(($category === 'futbol' ? $cfg['futbol']['basePrompt'] ?? null : $cfg['principal']['basePrompt'] ?? null))) $customBasePrompt = ($category === 'futbol' ? $cfg['futbol']['basePrompt'] ?? null : $cfg['principal']['basePrompt'] ?? null);
        if (!empty(($category === 'futbol' ? $cfg['futbol']['negativePrompt'] ?? null : $cfg['principal']['negativePrompt'] ?? null))) $customNegativePrompt = ($category === 'futbol' ? $cfg['futbol']['negativePrompt'] ?? null : $cfg['principal']['negativePrompt'] ?? null);
    }

    // ── ETAPA 2A: ANALIZAR REFERENCIAS (SOLO TEXTO → nunca llegan al generador) ──
    $sceneDescriptionFromRefs = '';
    $refDir = __DIR__ . '/references';
    if (is_dir($refDir)) {
        $refFiles = [];
        $allFiles = scandir($refDir);
        foreach ($allFiles as $f) {
            if ($f === '.' || $f === '..') continue;
            $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
            if (in_array($ext, ['jpg','jpeg','png','webp'])) $refFiles[] = $refDir . '/' . $f;
        }
        if (!empty($refFiles)) {
            // Llamada Vision para extraer SOLO descripción del ambiente (sin personas)
            $refParts = [['text' =>
                "You are a scene analyst. Analyze the following reference images and describe ONLY:\n"
                . "- The venue or environment type (e.g. gala hall, outdoor garden, convention center)\n"
                . "- The dominant colors and lighting mood\n"
                . "- Architectural elements, decorations, textures\n"
                . "- Overall atmosphere and energy\n"
                . "DO NOT describe any people, faces, clothing, or human features. Only environment.\n"
                . "Return a concise paragraph (3-5 sentences) describing the ideal scene for a photo shoot."
            ]];
            foreach ($refFiles as $f) {
                $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
                $mime = ($ext === 'png') ? 'image/png' : 'image/jpeg';
                $refParts[] = ['inline_data' => ['mime_type' => $mime, 'data' => base64_encode(file_get_contents($f))]];
            }
            $visionUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={$KEY}";
            $refVisionData = geminiPost($visionUrl, ['contents' => [['parts' => $refParts]]]);
            $sceneDescriptionFromRefs = trim($refVisionData['candidates'][0]['content']['parts'][0]['text'] ?? '');
        }
    }

    // ── ETAPA 2B: CARGAR FONDOS DEL EVENTO (Solo para principal) ──
    $bgParts = [];
    $hasLogos = false; // Ya no se usarán logos dibujados por IA
    if ($category !== 'futbol') {
        $assetsDir = __DIR__ . '/assets_ia';
        
        // Cargar FONDO EVENTO BASE
        if (file_exists($assetsDir . '/fondo_evento_base.png')) {
            $bgParts[] = ['text' => "[REFERENCE IMAGE 1 - EVENT BACKGROUND]: Use this exact background structural layout, BUT YOU MUST POPULATE IT WITH A VIBRANT CROWD OF PEOPLE. The final image MUST have a busy crowd of people in the background."];
            $bgParts[] = ['inline_data' => ['mime_type' => 'image/png', 'data' => base64_encode(file_get_contents($assetsDir . '/fondo_evento_base.png'))]];
        }
        // Cargar PANCARTAS
        if (file_exists($assetsDir . '/pancartas_fondo.jpeg')) {
            $bgParts[] = ['text' => "[REFERENCE IMAGE 2 - BANNERS]: Integrate these exact banners into the background seamlessly."];
            $bgParts[] = ['inline_data' => ['mime_type' => 'image/jpeg', 'data' => base64_encode(file_get_contents($assetsDir . '/pancartas_fondo.jpeg'))]];
        }
        // El usuario solicitó no enviar el logo al motor de IA para evitar que lo dibuje sobre las caras
        // Cargar LOGO EVENTO (DESHABILITADO)
        // if (file_exists($assetsDir . '/logo_evento.png')) { ... }
    }

    $hasRefs = !empty($sceneDescriptionFromRefs);

    // ── PROMPT FINAL DE GENERACIÓN (v54) ───────────────────────────
    $sceneBlock = $hasRefs
        ? "=== SCENE & ATMOSPHERE ===\n- " . $sceneDescriptionFromRefs . "\n\n"
        : "=== SCENE ===\n- Background: Use the provided reference backgrounds to recreate the event atmosphere, but YOU MUST ADD A VIBRANT CROWD OF BLURRED PEOPLE in the background.\n\n";

    $logoBlock = "";

    // ── CONSTRUIR PERSONA CARDS (para grupos) ─────────────────────
    $characterCardsBlock = '';
    if ($gender === 'group') {
        $personBlocks = preg_split('/===\s*PERSON\s*\d+\s*===/i', $personDescription);
        $personBlocks = array_filter($personBlocks, fn($b) => strlen(trim($b)) > 20);
        $personBlocks = array_values($personBlocks);
        $positions = ['leftmost', 'second from left', 'center', 'second from right', 'rightmost'];
        foreach ($personBlocks as $idx => $block) {
            $posMatch = [];
            if (preg_match('/POSITION IN PHOTO:\s*([^\n]+)/i', $block, $posMatch)) {
                $pos = trim($posMatch[1]);
            } else {
                $pos = $positions[$idx] ?? 'position ' . ($idx + 1);
            }
            $characterCardsBlock .=
                "--- CHARACTER " . ($idx + 1) . " (standing at " . $pos . ") ---\n"
                . trim($block) . "\n\n";
        }
    }

    $finalPrompt =
        "=== PRIMARY TASK ===\n";
    if ($category === 'futbol') {
        if ($gender === 'group') {
            $finalPrompt .= "Take EXACTLY {$numPeopleText} people from IMAGE 1, the person from IMAGE 2 (Toño Martín del Campo), and the person from IMAGE 3 (Kikín Fonseca). Put them interacting organically together as a team of commentators in a broadcast cabin for a soccer match.\n"
                . "CRITICAL RULE: You MUST generate EXACTLY " . ($numPeople + 2) . " main characters in the foreground. DO NOT GENERATE ANY EXTRA MAIN CHARACTERS.\n"
                . "CRITICAL RULE: The person from IMAGE 2 (Toño Martín del Campo) and the person from IMAGE 3 (Kikín Fonseca) MUST BOTH ALWAYS BE PRESENT and clearly visible in the center of the action. If either Toño or Kikín is missing, the generation is a complete failure.\n"
                . "CRITICAL RULE: IMAGE 1 contains multiple different people. You must include ALL of them as separate individuals. Do not merge or fuse them. Maintain character consistency for everyone (User group, Toño, and Kikín).\n";
        } else {
            $finalPrompt .= "Take the person from IMAGE 1, the person from IMAGE 2 (Toño Martín del Campo), and the person from IMAGE 3 (Kikín Fonseca). Put them interacting organically together as a team of commentators in a broadcast cabin for a soccer match.\n"
                . "CRITICAL RULE: You MUST generate EXACTLY THREE (3) distinct, separate people. DO NOT merge, fuse, or combine characters. Each person must have their own separate body.\n"
                . "CRITICAL RULE: The person from IMAGE 2 (Toño Martín del Campo) and the person from IMAGE 3 (Kikín Fonseca) MUST BOTH ALWAYS BE PRESENT and clearly visible. If either Toño or Kikín is missing, the generation is a complete failure.\n"
                . "CRITICAL RULE: Maintain ABSOLUTE EXTREME 1:1 PHOTOREALISTIC character consistency for all three people. Your ONLY job is to copy and paste the EXACT faces from the reference images onto the bodies. Do NOT beautify, alter, or synthesize the faces. The identity must match 100%.\n";
        }
    } else {
        if ($gender === 'group') {
            $finalPrompt .= "Take EXACTLY {$numPeopleText} people from IMAGE 1 and the person from IMAGE 2 (Toño). Put them interacting organically together for a cohesive, seamless photograph.\n"
                . "CRITICAL RULE: You MUST generate EXACTLY " . ($numPeople + 1) . " main characters in the foreground. DO NOT GENERATE ANY EXTRA MAIN CHARACTERS.\n"
                . "CRITICAL RULE: The person from IMAGE 2 (Toño Martín del Campo) MUST ALWAYS BE PRESENT and clearly visible. If Toño is missing, the generation is a complete failure.\n"
                . "CRITICAL RULE: IMAGE 1 contains multiple different people. You must include ALL of them as separate individuals. Do not merge or fuse them. Maintain character consistency for everyone.\n";
        } else {
            $finalPrompt .= "Take the person from IMAGE 1 and the person from IMAGE 2 (Toño). Put them interacting organically together for a cohesive, seamless photograph.\n"
                . "CRITICAL RULE: The person from IMAGE 2 (Toño Martín del Campo) MUST ALWAYS BE PRESENT and clearly visible. If Toño is missing, the generation is a complete failure.\n"
                . "CRITICAL RULE: Maintain ABSOLUTE EXTREME 1:1 PHOTOREALISTIC character consistency for both people. Your ONLY job is to copy and paste the EXACT faces from the reference images onto the bodies. Do NOT beautify, alter, or synthesize the faces. The identity must match 100%.\n";
        }
    }
    $finalPrompt .= "Integrate their bodies, lighting, and shadows perfectly so it looks like an unedited raw photo from a standard digital camera. No collage effect.\n\n"
        . "=== CHARACTER SPECIFIC RULES ===\n";
    if ($category === 'futbol') {
        $finalPrompt .= "- Toño Martín del Campo (from IMAGE 2): Replicate his facial features and hair exactly. His hair MUST be solid black. He must NEVER have white, gray, or brown hair. HE MUST NEVER HAVE TATTOOS. He has a mustache. You MUST replicate his signature mustache exactly as shown in the reference image. DO NOT transfer tattoos from IMAGE 1 to Toño.\n"
            . "- Kikín Fonseca (from IMAGE 3): Replicate his facial features and hair exactly. He has a very light stubble or is clean-shaven. He must NEVER have a thick, bushy, or frondose beard.\n\n";
    } else {
        $finalPrompt .= "- Toño Martín del Campo (from IMAGE 2): Replicate his facial features and hair exactly. His hair is solid black. HE MUST NEVER HAVE TATTOOS. He has a mustache. You MUST replicate his signature mustache exactly as shown in the reference image. DO NOT transfer tattoos from IMAGE 1 to Toño.\n\n";
    }
    
    $finalPrompt .= "=== GROUP DYNAMICS ===\n";
    if ($gender === 'group') {
        $finalPrompt .=
            "7. GROUP ANTI-FUSION: Each person is a COMPLETELY SEPARATE individual. Do NOT blend, merge, or average facial features between people. Each face is UNIQUE.\n"
            . "8. NO CLONES: Do NOT make people look similar or related unless they actually are. Each person must be clearly distinguishable.\n"
            . "9. SPATIAL SEPARATION: Each person has their own clearly defined space. Faces must NOT overlap or blend into each other.\n\n";
    } else {
        $finalPrompt .= "\n";
    }

    $finalPrompt .=
        "=== PERSON DETAILS (from IMAGE 1 vision analysis) ===\n";

    if ($gender === 'group' && !empty($characterCardsBlock)) {
        $finalPrompt .=
            "CRITICAL: Each CHARACTER CARD below describes a DIFFERENT, DISTINCT person. Apply each card ONLY to that specific person. Do NOT mix features between cards.\n\n"
            . $characterCardsBlock;
    } else {
        // Restore textual description to anchor features organically
        $finalPrompt .= $personDescription . "\n\n";
    }

    $finalPrompt .=
        "=== OUTFIT ===\n"
        . "{$outfitInstruction} {$outfitDesc}.\n";

    if ($category !== 'futbol') {
        $finalPrompt .= "CRITICAL OUTFIT RULE FOR TOÑO: Toño Martín del Campo MUST wear formal executive attire. Specifically, a dark blue suit jacket (saco azul oscuro) and a light blue shirt (camisa azul claro), or just a light blue shirt without the jacket. ABSOLUTELY NO GUAYABERAS. Do NOT generate guayaberas or casual white shirts for Toño.\n\n";
    } else {
        $finalPrompt .= "\n";
    }

    $finalPrompt .= "=== POSING & INTERACTION ===\n";
    
    if ($category === 'futbol') {
        $finalPrompt .= "- All characters (people from IMAGE 1, Toño from IMAGE 2, Kikín from IMAGE 3) are in a commentator cabin, celebrating, gesturing dynamically and narrating the match.\n"
            . "- They are wearing green jerseys or commentator blazers/suits, holding microphones, looking excited and happy.\n"
            . "- They are arranged organically standing together.\n"
            . "- MIRADA: They are looking away from the camera, looking towards the pitch/match, cheering and celebrating. None of the characters are looking at the camera.\n"
            . "- NO LOGOS: There must be ABSOLUTELY NO LOGOS anywhere in the image. No Nike, Adidas, TV stations, sports brands, or sponsors. All clothing and backgrounds must be completely blank of any logos or text.\n";
    } else {
        if ($gender === 'group') {
            $finalPrompt .= "- The person from IMAGE 2 (Toño) is standing together with the group of people from IMAGE 1 in a warm, friendly, natural pose.\n"
                . "- They are all arranged organically, side-by-side or slightly staggered.\n"
                . "- All characters are looking directly at the camera and smiling warmly and confidently.\n";
        } else {
            $finalPrompt .= "- The person from IMAGE 2 (Toño) and the person from IMAGE 1 are standing close together in a warm, friendly, natural pose.\n"
                . "- Toño (IMAGE 2) has his arm around the shoulder of the person from IMAGE 1 in a natural, organic campaign gesture.\n"
                . "- Both characters are looking directly at the camera and smiling warmly and confidently.\n";
        }
    }
    
    $finalPrompt .= "- INTEGRATION: Apply unified global lighting, matching shadows, and consistent color grading. This must look like a real, seamless, organic photograph, NOT a collage.\n\n"

        . $sceneBlock
        . $logoBlock

        . "=== ART QUALITY ===\n"
        . "- Style: {$customBasePrompt}\n"
        . "- Avoid: {$customNegativePrompt}\n"
        . "- 8K resolution, cinematic lighting, ultra-sharp focus, premium campaign photography.\n\n"

        . "=== COMPOSITION ===\n"
        . "- Characters occupy the center and top of the canvas — no head cropping.\n"
        . "- 100% canvas fill — no white borders.\n"
        . "- No synthetic text overlays.";

    // Eliminamos el bloque anterior de faceRefPromptBlock para integrarlo directamente en el prompt general.
    $faceRefPromptBlock = '';

    $parts = [
        ['text' => "You are an expert photo editor. Your task is to generate an image from the provided reference photos."]
    ];

    if ($gender === 'group') {
        $parts[] = ['text' => "[IMAGE 1 - Group of People]:"];
    } else {
        $parts[] = ['text' => "[IMAGE 1 - First Person]:"];
    }
    
    $parts[] = ['inline_data' => ['mime_type' => 'image/jpeg', 'data' => $userPhotoB64]];

    if (!empty($faceCrops)) {
        foreach ($faceCrops as $idx => $cropItem) {
            $desc = $cropItem['desc'];
            $data = $cropItem['data'];
            $pId = $cropItem['pId'] ?? 1;
            
            if ($gender === 'group') {
                $parts[] = ['text' => "[IMAGE 1 FACE DETAIL - PERSON {$pId} {$desc}]: This is the exact face of CHARACTER {$pId} from the group. CLONE THIS FACE WITH 100% ACCURACY for CHARACTER {$pId}. Do not beautify or alter any facial features. Keep their exact age, skin texture, and geometry. Do not apply this face to anyone else."];
            } else {
                $parts[] = ['text' => "[IMAGE 1 FACE DETAIL - {$desc}]: This is the face of the FIRST person (User). CLONE THIS FACE WITH 100% ACCURACY. Do not beautify, smooth, or alter ANY facial features. Keep their exact age, skin texture, nose shape, and eye shape. THIS IS THE ABSOLUTE HIGHEST PRIORITY."];
            }
            
            $parts[] = ['inline_data' => ['mime_type' => 'image/jpeg', 'data' => $data]];
        }
    }

    if ($candidatePhotoBase64) {
        $parts[] = ['text' => "[IMAGE 2 - Second Person (Toño Martín del Campo)]:\nThis is the reference photo of Toño Martín del Campo. You MUST extract his face from this image and CLONE IT EXACTLY onto his character in the final generation. Do not beautify or synthesize his face. The identity must be 100% identical to this image. If his face doesn't match perfectly, the generation is a complete failure."];
        $parts[] = ['inline_data' => ['mime_type' => 'image/jpeg', 'data' => $candidatePhotoBase64]];
    }

    if ($category === 'futbol' && $kikinPhotoBase64) {
        $parts[] = ['text' => "[IMAGE 3 - Third Person (Kikín Fonseca)]:\nThis is the reference photo of Kikín Fonseca. You MUST extract his face from this image and CLONE IT EXACTLY onto his character in the final generation. Do not beautify or synthesize his face. The identity must be 100% identical to this image. If his face doesn't match perfectly, the generation is a complete failure."];
        $parts[] = ['inline_data' => ['mime_type' => 'image/png', 'data' => $kikinPhotoBase64]];
    }

    // Agregar referencias de fondos si es la activación principal
    if ($category !== 'futbol' && !empty($bgParts)) {
        $parts = array_merge($parts, $bgParts);
    }

    $parts[] = ['text' => $faceRefPromptBlock . $finalPrompt];

    $genUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key={$KEY}";

    // Ajustar aspect ratio según si es grupal o individual
    $aspectRatio = ($gender === 'group') ? '16:9' : '3:4';

    $genPayload = [
        'contents' => [['parts' => $parts]],
        'generationConfig' => [
            'responseModalities' => ['TEXT', 'IMAGE'],
            'imageConfig' => [
                'aspectRatio' => $aspectRatio,
            ]
        ],
    ];

    $gData = geminiPost($genUrl, $genPayload);

    // ── Helper: extraer imagen de la respuesta ──────────────────────
    function extractImageBytes(array $data): string {
        $imgBytes = '';
        if (isset($data['candidates'])) {
            foreach ($data['candidates'] as $candidate) {
                foreach ($candidate['content']['parts'] ?? [] as $part) {
                    if (isset($part['inlineData']['data']) && strlen($part['inlineData']['data']) > 100) {
                        return $part['inlineData']['data'];
                    }
                    if (isset($part['inline_data']['data']) && strlen($part['inline_data']['data']) > 100) {
                        return $part['inline_data']['data'];
                    }
                }
            }
        }
        // Búsqueda de respaldo en toda la estructura
        array_walk_recursive($data, function ($item, $key) use (&$imgBytes) {
            if (is_string($item) && strlen($item) > 1000
                && in_array($key, ['data', 'imageBytes', 'bytesBase64Encoded'], true)) {
                $imgBytes = $item;
            }
        });
        return $imgBytes;
    }

    $imgBytes     = extractImageBytes($gData);
    $finishReason = $gData['candidates'][0]['finishReason'] ?? 'UNKNOWN';

    // ── Retry automático si el modelo bloqueó por filtros ──────────
    if (!$imgBytes && in_array($finishReason, ['OTHER', 'SAFETY', 'UNKNOWN'], true)) {
        $settingsFile = __DIR__ . '/database/settings.json';
        $settings = file_exists($settingsFile) ? json_decode(file_get_contents($settingsFile), true) : [];
        $profileKey = ($category === 'futbol') ? 'futbol' : 'principal';
    $profile = $settings[$profileKey] ?? [];
    $branding = $profile['branding'] ?? $settings['branding'] ?? [];
        
        $frameKey = ($category === 'futbol') ? 'frameFutbol' : 'framePrincipal';
        $frameKey = ($category === 'futbol') ? 'frameFutbol' : 'framePrincipal';
    $relativeFramePath = !empty($branding[$frameKey]) ? $branding[$frameKey] : (!empty($branding['frame']) ? $branding['frame'] : null);

        if ($relativeFramePath) {
            // Eliminar ./ inicial si existe
            $relativeFramePath = ltrim($relativeFramePath, './');
            $framePath = __DIR__ . '/' . $relativeFramePath;
        }

        // Segundo intento: prompt más neutral sin imágenes de referencia adicionales
        $retryParts = [];
        // Mantener solo la imagen del usuario y el frame
        foreach ($parts as $p) {
            if (isset($p['inline_data']) || isset($p['inlineData'])) {
                $retryParts[] = $p; // imágenes de referencia se conservan
            }
        }
        // Prompt simplificado y más seguro
        $safePrompt = "Create a fun, festive photo-realistic composite image. " . $finalPrompt;
        $retryParts[] = ['text' => $safePrompt];

        $retryPayload = [
            'contents' => [['parts' => $retryParts]],
            'generationConfig' => [
                'responseModalities' => ['TEXT', 'IMAGE'],
                'imageConfig' => ['aspectRatio' => $aspectRatio],
            ],
        ];
        $gData2       = geminiPost($genUrl, $retryPayload);
        $imgBytes     = extractImageBytes($gData2);
        $finishReason = $gData2['candidates'][0]['finishReason'] ?? $finishReason;

        // Si aún falla, usar gemini-2.5-flash-image como modelo alternativo
        if (!$imgBytes) {
            $fallbackUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key={$KEY}";
            $gData3      = geminiPost($fallbackUrl, $retryPayload);
            $imgBytes    = extractImageBytes($gData3);
            $finishReason = $gData3['candidates'][0]['finishReason'] ?? $finishReason;
        }
    }

    if (!$imgBytes) {
        $debugMsg = '';
        if (array_key_exists('_curl_error', $gData)) {
            $debugMsg = 'cURL: ' . $gData['_curl_error'];
        } elseif (isset($gData['error'])) {
            $debugMsg = $gData['error']['message'] ?? json_encode($gData['error']);
        } else {
            $debugMsg = 'finishReason=' . $finishReason . '. El modelo no generó imagen.';
        }
        ob_end_clean();
        echo json_encode([
            'error'        => 'La generación de imagen falló. Inténtalo de nuevo.',
            'debug'        => $debugMsg,
            'finishReason' => $finishReason,
        ]);
        exit;
    }

    // ── ETAPA 4: COMPOSICIÓN DEL MARCO / PIE DE FOTO ───────
    $finalB64 = $imgBytes;
    
    // Leer settings.json para buscar el marco activo
    $settingsFile = __DIR__ . '/database/settings.json';
    $settings = file_exists($settingsFile) ? json_decode(file_get_contents($settingsFile), true) : [];
    $profileKey = ($category === 'futbol') ? 'futbol' : 'principal';
    $profile = $settings[$profileKey] ?? [];
    $branding = $profile['branding'] ?? $settings['branding'] ?? [];
    
    $frameKey = ($category === 'futbol') ? 'frameFutbol' : 'framePrincipal';
    $frameKey = ($category === 'futbol') ? 'frameFutbol' : 'framePrincipal';
    $relativeFramePath = !empty($branding[$frameKey]) ? ltrim($branding[$frameKey], './') : (!empty($branding['frame']) ? ltrim($branding['frame'], './') : null);
    $framePath = $relativeFramePath ? __DIR__ . '/' . $relativeFramePath : null;

    if ($framePath && file_exists($framePath) && function_exists('imagecreatefromstring')) {
        $baseImg = @imagecreatefromstring(base64_decode($imgBytes));
        $frameImg = @imagecreatefrompng($framePath);
        
        if ($baseImg && $frameImg) {
            $baseW = imagesx($baseImg);
            $baseH = imagesy($baseImg);
            
            // Redimensionar el marco (logo) para que sea el 35% del ancho y colocarlo centrado abajo
            $frameW = imagesx($frameImg);
            $frameH = imagesy($frameImg);
            
            $newFrameW = (int)($baseW * 0.35);
            $newFrameH = (int)(($frameH / $frameW) * $newFrameW);
            
            $dstX = (int)(($baseW - $newFrameW) / 2);
            $dstY = (int)($baseH - $newFrameH - ($baseH * 0.05));
            
            imagecopyresampled($baseImg, $frameImg, $dstX, $dstY, 0, 0, $newFrameW, $newFrameH, $frameW, $frameH);
            
            ob_start();
            imagejpeg($baseImg, null, 90);
            $finalB64 = base64_encode(ob_get_clean());
            
            imagedestroy($baseImg);
            imagedestroy($frameImg);
        }
    }
    // El usuario solicitó eliminar el marco de la feria.

    // ── ETAPA 5: GUARDAR EN DISCO + GENERAR QR URL ────────────────
    $outputDir  = __DIR__ . '/outputs';
    if (!is_dir($outputDir)) {
        @mkdir($outputDir, 0777, true);
    }
    @chmod($outputDir, 0777); // Forzar permisos para escritura PHP
    $savedFile  = saveImageForQR($finalB64, $outputDir);

    // URL pública de la imagen para el QR
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
    $baseUrl = $protocol . '://' . $_SERVER['HTTP_HOST'];
    $qrUrl = $savedFile
        ? $baseUrl . '/admin.php?action=download_image&id=' . urlencode($savedFile)
        : '';

    // Leads logic removed

    ob_end_clean();
    echo json_encode([
        'processedImage' => 'data:image/jpeg;base64,' . $finalB64,
        'qrUrl'          => $qrUrl,
        'status'         => 'success',
    ]);
    exit;
}

// ══════════════════════════════════════════════════════════════════
//  ACCIÓN: download_image  (servir imagen para descarga vía QR)
// ══════════════════════════════════════════════════════════════════
if ($action === 'download_image') {
    $id       = $_GET['id'] ?? ($input['id'] ?? '');
    $filename = basename($id); // Prevenir path traversal
    $filepath = __DIR__ . '/outputs/' . $filename;

    ob_end_clean();

    if ($filename && file_exists($filepath)) {
        // Redirigir a la página de descarga amigable si hay un navegador
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $isBrowser = (stripos($ua, 'Mozilla') !== false || stripos($ua, 'Chrome') !== false);

        if ($isBrowser) {
            // Servir una página HTML de aterrizaje con botón de descarga
            header('Content-Type: text/html; charset=utf-8');
            $imgDataUrl = 'data:image/jpeg;base64,' . base64_encode(file_get_contents($filepath));
            echo '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">';
            echo '<meta name="viewport" content="width=device-width,initial-scale=1">';
            echo '<title>Tu Foto con ToÃ±o</title>';
            echo '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap" rel="stylesheet">';
            echo '<style>
                *{margin:0;padding:0;box-sizing:border-box}
                body{font-family:Outfit,sans-serif;background:#000;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;overflow-x:hidden}
                .mesh-bg{position:fixed;inset:0;z-index:0;filter:blur(80px);opacity:0.6}
                .c1{position:absolute;top:10%;left:10%;width:400px;height:400px;background:#0A4F8F;border-radius:50%}
                .c2{position:absolute;bottom:10%;right:10%;width:400px;height:400px;background:#2563EB;border-radius:50%}
                .container{position:relative;z-index:10;width:100%;max-width:420px;text-align:center;background:rgba(255,255,255,0.05);backdrop-filter:blur(25px);border-radius:32px;padding:32px 24px;box-shadow:0 40px 100px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1)}
                .logo{height:50px;margin-bottom:30px;}
                .photo-frame{border-radius:24px;overflow:hidden;background:#000;margin-bottom:24px;border:1px solid rgba(255,255,255,0.2)}
                .photo-frame img{width:100%;height:auto;display:block}
                h1{font-size:24px;font-weight:900;text-transform:uppercase;margin-bottom:12px;letter-spacing:0.1em}
                p{color:rgba(255,255,255,0.5);font-size:14px;margin-bottom:24px;line-height:1.6;font-weight:600}
                .btn{display:block;width:100%;padding:20px;border-radius:20px;font-weight:900;font-size:16px;text-transform:uppercase;letter-spacing:1px;text-decoration:none;background:#fff;color:#000;transition:transform 0.2s}
                .btn:active{transform:scale(0.95)}
            </style>';
            echo '</head><body>
            <div class="mesh-bg"><div class="c1"></div><div class="c2"></div></div>
            <div class="container">';
            echo '<img src="logo-tono-martin-del-campo.png" alt="Toño Martín del Campo" class="logo">';
            echo '<div class="photo-frame"><img src="' . $imgDataUrl . '" alt="Tu Foto"></div>';
            echo '<h1>¡TU FOTO LISTA!</h1>';
            echo '<p>Guarda este recuerdo de tu encuentro con Toño Martín del Campo.</p>';
            echo '<a href="?action=download_image&id=' . urlencode($filename) . '&force=1" class="btn">DESCARGAR FOTO</a>';
            echo '</div></body></html>';
        } else {
            // Descarga directa para apps/HTTP clients sin browser
            header('Content-Type: image/jpeg');
            header('Content-Disposition: attachment; filename="MiFotoConTono.jpg"');
            header('Content-Length: ' . filesize($filepath));
            readfile($filepath);
        }
    } else {
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Imagen no encontrada']);
    }
    exit;
}

// Si se solicita descarga forzada (parámetro force=1)
if ($action === 'download_image' && isset($_GET['force'])) {
    $id       = $_GET['id'] ?? '';
    $filename = basename($id);
    $filepath = __DIR__ . '/outputs/' . $filename;
    ob_end_clean();
    if ($filename && file_exists($filepath)) {
        header('Content-Type: image/jpeg');
        header('Content-Disposition: attachment; filename="MiFotoConTono.jpg"');
        header('Content-Length: ' . filesize($filepath));
        readfile($filepath);
    }
    exit;
}

// ══════════════════════════════════════════════════════════════════
//  VISTA: Panel de Administración (Leads)
// ══════════════════════════════════════════════════════════════════
if ($action === 'logout') {
    session_destroy();
    header('Location: admin.php');
    exit;
}


if ($action === 'admin' || empty($action)) {
    header("Location: /?admin");
    exit;
}
