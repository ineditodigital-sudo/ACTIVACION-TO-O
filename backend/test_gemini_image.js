<?php
require_once __DIR__ . '/auth_config.php';
$GEMINI_API_KEY = $GEMINI_API_KEY;
$modelName = "imagen-3.0-generate-001";
$url = "https://generativelanguage.googleapis.com/v1beta/models/{$modelName}:generateImages?key=" . $GEMINI_API_KEY;

$imagePrompt = "A cute red panda mascot waving hello, 2D cartoon style, high quality";
$iPayload = ["instances" => [["prompt" => $imagePrompt]], "parameters" => ["sampleCount" => 1, "aspectRatio" => "1:1", "outputMimeType" => "image/jpeg"]];

echo "Iniciando peticion a Nano Banana...\n";

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($iPayload));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
$res = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo "Status Code: $httpCode\n";
if ($httpCode == 200) {
    echo "Â¡Ã‰XITO! Recibida respuesta de Google.\n";
    $data = json_decode($res, true);
    if (isset($data['generatedImages'][0]['image']['imageBytes'])) {
        echo "Imagen detectada en ruta estÃ¡ndar.\n";
    } else {
        echo "Estructura de respuesta: " . substr($res, 0, 500) . "...\n";
    }
} else {
    echo "ERROR: " . $res . "\n";
}
?>

