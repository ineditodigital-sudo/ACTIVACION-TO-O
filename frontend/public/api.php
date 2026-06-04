<?php
/**
 * API TOÑO - NANO 1.0 (DEBUG MODE)
 */
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

// Reportar errores como JSON para no romper el frontend
error_reporting(0);
set_error_handler(function ($errno, $errstr) {
    echo json_encode(["error" => "PHP Error ($errno): $errstr"]);
    exit;
});

if (file_exists(__DIR__ . '/auth_config.php')) {
    require_once __DIR__ . '/auth_config.php';
}

$KEY = $GLOBALS['GEMINI_API_KEY'] ?? "";

$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);

if (isset($input['p'])) {
    $b64 = $input['p'];

    // 1. VISION
    $vUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$KEY";
    $vPayload = [
        "contents" => [
            [
                "parts" => [
                    ["text" => "Describe the person briefly for a cartoon."],
                    ["inline_data" => ["mime_type" => "image/jpeg", "data" => $b64]]
                ]
            ]
        ]
    ];

    $ch = curl_init($vUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($vPayload));
    $vRes = curl_exec($ch);
    $vData = json_decode($vRes, true);
    curl_close($ch);

    $desc = $vData['candidates'][0]['content']['parts'][0]['text'] ?? "A person";

    if (isset($vData['error'])) {
        echo json_encode(["error" => "Vision Error: " . ($vData['error']['message'] ?? 'Unknown')]);
        exit;
    }

    // 2. IMAGEN 3
    $iUrl = "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generateImages?key=$KEY";
    $prompt = "Vibrant 2D Vectorial Cartoon: {$desc} in a professional and elegant setting. Bold clean outlines.";

    $iPayload = [
        "instances" => [["prompt" => $prompt]],
        "parameters" => ["sampleCount" => 1]
    ];

    $ch = curl_init($iUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($iPayload));
    $iRes = curl_exec($ch);
    $iData = json_decode($iRes, true);
    curl_close($ch);

    $bytes = $iData['generatedImages'][0]['image']['imageBytes'] ?? null;

    if ($bytes) {
        echo json_encode(["processedImage" => "data:image/jpeg;base64," . $bytes, "status" => "success"]);
    } else {
        $msg = $iData['error']['message'] ?? "Error de IA o respuesta vacia";
        echo json_encode(["error" => "IA Error: $msg", "raw" => $iData]);
    }
} elseif (isset($_GET['action'])) {
    $action = $_GET['action'];

    // Funciones que no requieren auth
    if ($action === 'get_settings') {
        $settingsFile = __DIR__ . '/database/settings.json';
        if (file_exists($settingsFile)) {
            echo file_get_contents($settingsFile);
        } else {
            echo json_encode(["skip_leads_form" => false]);
        }
        exit;
    }

    // get_assets es público (las imágenes están en carpetas públicas de todas formas)
    if ($action === 'get_assets') {
        $cat = $_GET['cat'] ?? 'references';
        $allowed = ['references', 'logos_ia', 'branding'];
        if (!in_array($cat, $allowed)) $cat = 'references';

        $assetDir = __DIR__ . '/' . $cat;
        if (!is_dir($assetDir)) mkdir($assetDir, 0755, true);

        $assets = [];
        $files = scandir($assetDir);
        if ($files !== false) {
            foreach ($files as $f) {
                if ($f === '.' || $f === '..') continue;
                $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
                if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) {
                    $assets[] = ['name' => $f, 'url' => './' . $cat . '/' . $f];
                }
            }
        }
        echo json_encode($assets);
        exit;
    }

    // Auth verification para admin
    $user = $input['user'] ?? $_GET['user'] ?? '';
    $pass = $input['pass'] ?? $_GET['pass'] ?? '';
    if ($user !== ($GLOBALS['ADMIN_USER'] ?? 'admin') || $pass !== ($GLOBALS['ADMIN_PASS'] ?? 'TONO%2026')) {
        http_response_code(401);
        echo json_encode(["error" => "Unauthorized"]);
        exit;
    }

    if ($action === 'get_leads') {
        $leadsFile = __DIR__ . '/database/leads.json';
        if (file_exists($leadsFile)) {
            $content = file_get_contents($leadsFile);
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                echo json_encode($decoded);
            } else {
                $lines = explode(PHP_EOL, $content);
                $leads = [];
                foreach ($lines as $line) {
                    $item = json_decode($line, true);
                    if (is_array($item)) {
                        if (isset($item[0])) $leads = array_merge($leads, $item);
                        else $leads[] = $item;
                    }
                }
                echo json_encode($leads);
            }
        } else {
            echo json_encode([]);
        }
        exit;
    }

    if ($action === 'save_settings') {
        $folder = __DIR__ . '/database';
        if (!is_dir($folder)) mkdir($folder, 0755, true);
        file_put_contents($folder . '/settings.json', json_encode($input));
        echo json_encode(["status" => "saved"]);
        exit;
    }

    if ($action === 'debug_assets') {
        $cats = ['references', 'logos_ia', 'branding'];
        $report = [];
        foreach ($cats as $cat) {
            $dir = __DIR__ . '/' . $cat;
            $report[$cat] = [
                'exists' => is_dir($dir),
                'writable' => is_writable($dir),
                'path' => $dir,
                'files' => is_dir($dir) ? scandir($dir) : []
            ];
        }
        $report['php_dir'] = __DIR__;
        echo json_encode($report, JSON_PRETTY_PRINT);
        exit;
    }

    if ($action === 'get_assets') {
        $cat = $_GET['cat'] ?? 'references';
        $allowed = ['references', 'logos_ia', 'branding'];
        if (!in_array($cat, $allowed)) $cat = 'references';

        $assetDir = __DIR__ . '/' . $cat;
        if (!is_dir($assetDir)) mkdir($assetDir, 0755, true);
        
        $assets = [];
        $files = scandir($assetDir);
        if ($files !== false) {
            foreach ($files as $f) {
                if ($f === '.' || $f === '..') continue;
                $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
                if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) {
                    $assets[] = [
                        'name' => $f,
                        'url' => './' . $cat . '/' . $f
                    ];
                }
            }
        }
        echo json_encode($assets);
        exit;
    }

    if ($action === 'upload_asset') {
        $cat = $input['cat'] ?? 'references';
        $allowed = ['references', 'logos_ia', 'branding'];
        if (!in_array($cat, $allowed)) $cat = 'references';

        $assetDir = __DIR__ . '/' . $cat;
        if (!is_dir($assetDir)) {
            if (!mkdir($assetDir, 0755, true)) {
                echo json_encode(["error" => "No se pudo crear el directorio: $cat"]);
                exit;
            }
        }
        
        $name = $input['name'] ?? 'asset_' . uniqid() . '.jpg';
        // Limpiar nombre para evitar saltos de directorio
        $name = basename($name);
        
        $b64 = $input['image'] ?? '';
        if ($b64) {
            $data = explode(',', $b64);
            $content = base64_decode(isset($data[1]) ? $data[1] : $data[0]);
            if (file_put_contents($assetDir . '/' . $name, $content)) {
                echo json_encode(["status" => "uploaded", "name" => $name]);
            } else {
                echo json_encode(["error" => "Error al escribir el archivo en $cat"]);
            }
        } else {
            echo json_encode(["error" => "No hay datos de imagen"]);
        }
        exit;
    }

    if ($action === 'delete_asset') {
        $cat = $input['cat'] ?? 'references';
        $name = basename($input['name'] ?? '');
        $file = __DIR__ . '/' . $cat . '/' . $name;
        if ($name && file_exists($file)) {
            unlink($file);
            echo json_encode(["status" => "deleted"]);
        } else {
            echo json_encode(["error" => "File not found"]);
        }
        exit;
    }

    if ($action === 'delete_lead') {
        $leadsFile = __DIR__ . '/database/leads.json';
        $targetId = $input['id'] ?? ($input['image_url'] ?? '');
        if (file_exists($leadsFile) && $targetId) {
            $content = file_get_contents($leadsFile);
            $decoded = json_decode($content, true) ?? [];
            $leads = array_filter($decoded, function($l) use ($targetId) {
                return ($l['id'] ?? '') !== $targetId && ($l['imageFile'] ?? $l['image_url'] ?? '') !== $targetId;
            });
            file_put_contents($leadsFile, json_encode(array_values($leads), JSON_PRETTY_PRINT));
            echo json_encode(["status" => "deleted"]);
        } else {
            echo json_encode(["error" => "Not found"]);
        }
        exit;
    }
} else {
    echo json_encode([
        "status" => "ready", 
        "key" => !empty($KEY),
        "dirs" => [
            "references" => is_writable(__DIR__ . '/references'),
            "logos_ia" => is_writable(__DIR__ . '/logos_ia'),
            "branding" => is_writable(__DIR__ . '/branding'),
            "database" => is_writable(__DIR__ . '/database')
        ]
    ]);
}
exit;
