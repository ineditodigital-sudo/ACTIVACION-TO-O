<?php
/**
 * DOWNLOAD TOÑO MARTÍN DEL CAMPO - SISTEMA DE DESCARGA DIRECTA (QR) PRO
 * Mejorado para compatibilidad total con iOS 17+ y Android
 */

$id = $_GET['id'] ?? '';
// En producción la carpeta es 'outputs'
$filename = basename($id);
$filepath = __DIR__ . '/outputs/' . $filename;
$webpath = './outputs/' . $filename;

// Si el usuario da clic en el botón de confirmación de descarga real
if (isset($_GET['confirm'])) {
    if ($id && file_exists($filepath)) {
        header('Content-Description: File Transfer');
        header('Content-Type: image/jpeg');
        header('Content-Disposition: attachment; filename="MiFotoConTono.jpg"');
        header('Expires: 0');
        header('Cache-Control: must-revalidate');
        header('Pragma: public');
        header('Content-Length: ' . filesize($filepath));
        readfile($filepath);
        exit;
    }
}

// Interfaz de aterrizaje para asegurar que el usuario inicie la descarga (Requiere interacción en iOS 17+)
?>
<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Tu Foto con ToÃ±o</title>
    <link rel="icon" type="image/webp" href="favicon.webp" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">

    <!-- Metatags Dinámicos para Compartir (Open Graph) -->
    <?php if ($id && file_exists($filepath)):
        $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
        $fullImgUrl = $protocol . "://" . $_SERVER['HTTP_HOST'] . str_replace('./', '/', $webpath);
        ?>
        <meta property="og:title" content="Mi Foto con ToÃ±o">
        <meta property="og:description" content="¡Mira mi foto personalizada del Encuentro con ToÃ±o!">
        <meta property="og:image" content="<?php echo $fullImgUrl; ?>">
        <meta property="og:type" content="website">
        <meta property="og:url"
            content="<?php echo $protocol . "://" . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI']; ?>">

        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:image" content="<?php echo $fullImgUrl; ?>">
    <?php endif; ?>

    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', sans-serif;
            background: #f8fafc;
            color: #0f172a;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            overflow-x: hidden;
        }

        .container {
            width: 100%;
            max-width: 500px;
            text-align: center;
            background: #ffffff;
            border-radius: 30px;
            padding: 30px 20px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.1);
            border: 1px solid #e2e8f0;
        }

        .logo {
            height: 40px;
            margin-bottom: 25px;
        }

        .photo-frame {
            position: relative;
            margin-bottom: 25px;
            border-radius: 20px;
            overflow: hidden;
            background: #000;
            line-height: 0;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            border: 2px solid #0A4F8F;
        }

        .photo-frame img {
            width: 100%;
            height: auto;
            display: block;
        }

        h1 {
            font-size: 22px;
            font-weight: 900;
            text-transform: uppercase;
            margin-bottom: 10px;
            color: #0f172a;
            letter-spacing: 0.5px;
        }

        p {
            color: #475569;
            margin-bottom: 30px;
            font-size: 14px;
            line-height: 1.5;
        }

        .btn-download {
            display: inline-block;
            background: #0A4F8F;
            color: white;
            text-decoration: none;
            padding: 18px 40px;
            border-radius: 16px;
            font-weight: 900;
            font-size: 16px;
            text-transform: uppercase;
            letter-spacing: 1px;
            width: 100%;
            transition: transform 0.2s, background 0.2s;
            box-shadow: 0 8px 25px rgba(10, 79, 143, 0.4);
            border: none;
            cursor: pointer;
        }

        .btn-download:active {
            transform: scale(0.98);
            background: #002f6c;
        }

        .btn-share {
            display: inline-block;
            background: transparent;
            color: #0A4F8F;
            padding: 16px 40px;
            border-radius: 16px;
            font-weight: 700;
            font-size: 15px;
            text-transform: uppercase;
            letter-spacing: 1px;
            width: 100%;
            transition: transform 0.2s, opacity 0.2s;
            border: 2px solid #0A4F8F;
            cursor: pointer;
        }

        .btn-share:active {
            transform: scale(0.98);
            opacity: 0.8;
        }

        .tip {
            margin-top: 20px;
            font-size: 12px;
            color: #6B7280;
            font-weight: 600;
        }

        .error-msg {
            color: #ff4444;
            padding: 40px;
        }
    </style>
</head>

<body>

    <?php if ($id && file_exists($filepath)): ?>
        <div class="container">
            <img src="logo-tono-martin-del-campo.png" alt="Toño Martín del Campo" class="logo">

            <div class="photo-frame">
                <img src="<?php echo $webpath; ?>" alt="Tu Foto">
            </div>

            <h1>¡LISTO PARA COMPARTIR!</h1>
            <p style="margin-bottom: 20px;">¡Comparte con tus amigos y colegas tu visita al Encuentro con Toño Martín del Campo!</p>

            <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
                <a href="?id=<?php echo urlencode($id); ?>&confirm=1" class="btn-download">
                    DESCARGAR FOTO
                </a>

                <button onclick="sharePhoto()" class="btn-share">
                    COMPARTIR FOTO
                </button>
            </div>

            <script>
                async function sharePhoto() {
                    const imgUrl = '<?php echo $webpath; ?>';
                    const title = 'Mi Foto con Toño Martín del Campo';
                    const text = '¡Mira mi foto personalizada en el Encuentro con Toño Martín del Campo!';

                    try {
                        // 1. Intentamos descargar la imagen para compartir el ARCHIVO real (Mejor para IG/WA)
                        const response = await fetch(imgUrl);
                        const blob = await response.blob();
                        const file = new File([blob], 'MiFotoConTono.jpg', { type: 'image/jpeg' });

                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                            await navigator.share({
                                files: [file],
                                title: title,
                                text: text
                            });
                        } else if (navigator.share) {
                            // Fallback a solo texto/url si no soporta archivos
                            await navigator.share({
                                title: title,
                                text: text,
                                url: window.location.href.split('&')[0]
                            });
                        } else {
                            throw new Error('Web Share no disponible');
                        }
                    } catch (err) {
                        console.log('Sharing failed, falling back to clipboard:', err);
                        // Fallback final: Copiar URL al portapapeles
                        const shareUrl = window.location.href.split('&')[0];
                        await navigator.clipboard.writeText(shareUrl);
                        alert('Enlace copiado al portapapeles. ¡Pégalo para compartir en tus redes!');
                    }
                }
            </script>

            <div class="tip">
                O mantén presionada la imagen para guardarla directamente.
            </div>
        </div>
    <?php else: ?>
        <div class="container">
            <img src="logo-tono-martin-del-campo.png" alt="Toño Martín del Campo" class="logo">
            <h1 class="error-msg">¡UPS! LA IMAGEN YA NO ESTÁ DISPONIBLE</h1>
            <p>Vuelve al kiosco para capturar tu momento mágico.</p>
            <a href="/" style="color: #0A4F8F; text-decoration: none; font-weight: 900;">INICIO</a>
        </div>
    <?php endif; ?>

</body>

</html>