import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { RefreshCcw, Smartphone, Gift, Download } from 'lucide-react'

// ID único de sesión generado una vez por carga de la app
const SESSION_ID = Math.random().toString(36).substring(2, 10)

export default function QRCodeScreen({ processedPhoto, onReset, branding }) {
  const logoUrl = branding?.logoUrl || "/logo-tono-martin-del-campo.png";
  const [qrReady, setQrReady] = useState(false)
  const [qrUrl, setQrUrl] = useState('')

  useEffect(() => {
    if (!processedPhoto) return

    // 1. Guardar la imagen en sessionStorage con un ID único
    const photoKey = `tono_photo_${SESSION_ID}`
    try {
      sessionStorage.setItem(photoKey, processedPhoto)
      sessionStorage.setItem('tono_latest_key', photoKey)
    } catch (e) {
      console.warn('sessionStorage lleno, usando localStorage')
      try {
        localStorage.setItem(photoKey, processedPhoto)
        localStorage.setItem('tono_latest_key', photoKey)
      } catch (e2) {
        console.error('No se pudo guardar en storage')
      }
    }

    // 2. El QR apunta a la misma app con parámetro ?photo=SESSION_ID
    // Cuando el celular escanee, la app React detectará el parámetro y mostrará la foto
    // PERO: la imagen no estará en el sessionStorage del celular...
    // Entonces usaremos el servidor: admin.php ya sube la foto y devuelve el token

    // Intentar subir al servidor para QR real
    uploadToServer()
  }, [processedPhoto])

  async function uploadToServer() {
    const b64 = processedPhoto?.includes(',')
      ? processedPhoto.split(',')[1]
      : processedPhoto

    if (!b64) return

    try {
      const resp = await fetch('./admin.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ action: 'save_qr_token', img: b64 })
      })

      const text = await resp.text()
      console.log('[QR] Server response:', text.substring(0, 100))

      // Intentar parsear JSON
      let data
      try {
        // Buscar JSON en la respuesta (puede tener basura antes/después)
        const match = text.match(/\{[^{}]*\}/)
        data = match ? JSON.parse(match[0]) : null
      } catch { data = null }

      if (data?.token) {
        const url = `${window.location.origin}/admin.php?action=view_photo&token=${data.token}`
        setQrUrl(url)
        setQrReady(true)
        return
      }
    } catch (e) {
      console.warn('[QR] Server upload failed:', e)
    }

    // Fallback: crear una data URL de la imagen como QR (el celular abrirá la app)
    // Esto muestra la página de la app con ?photo=SESSION_ID
    const fallbackUrl = `${window.location.origin}${window.location.pathname}?viewphoto=${SESSION_ID}`
    setQrUrl(fallbackUrl)
    setQrReady(true)
  }

  function downloadDirect() {
    if (!processedPhoto) return
    const link = document.createElement('a')
    link.href = processedPhoto
    link.download = 'MiFotoConToño.jpg'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="full-overlay" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="mesh-bg">
        <div className="mesh-circle c1" />
        <div className="mesh-circle c2" />
        <div className="mesh-circle c3" />
      </div>

      <div style={{ textAlign: 'center', zIndex: 10, padding: '0 20px' }}>
        <img 
          src={branding?.logos?.header || branding?.logos?.main || branding?.logoUrl || "/logo-tono-martin-del-campo.png"} 
          alt="Logo" 
          className="z-logo" 
          style={{ height: 'var(--logo-size-header)', marginBottom: 20 }} 
        />
        <h1 className="big-title">TU RETRATO</h1>
        <p className="sub-title">ESCÁNEAME PARA GUARDAR TU FOTO</p>
      </div>

      <div className="qr-wrapper" style={{ zIndex: 10 }}>
        {!qrReady ? (
          <div style={{
            width: 220, height: 220,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'var(--glass)', gap: 16,
            border: '1px solid var(--glass-border)', borderRadius: '20px'
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-color)', textTransform: 'uppercase' }}>
              PREPARANDO QR...
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <QRCodeSVG
                value={qrUrl}
                size={280}
                bgColor="#FFFFFF"
                fgColor="#000000"
                level="H"
                includeMargin={true}
              />
              {branding?.logos?.qrIcon && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={branding.logos.qrIcon} alt="QR Logo" style={{ width: 40, height: 40, objectFit: 'contain' }} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      <div style={{ width: '100%', maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 12, zIndex: 10, padding: '0 24px' }}>
        <div className="step-card">
          <div className="step-num">1</div>
          <div className="step-text">
            <h4>Escanea el código</h4>
            <p>Usa la cámara de tu celular</p>
          </div>
        </div>
        <div className="step-card">
          <div className="step-num">
            <Gift size={20} />
          </div>
          <div className="step-text">
            <h4>Guarda tu Recuerdo</h4>
            <p>Descarga la imagen en tu dispositivo</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 420, marginTop: 40, zIndex: 10, padding: '0 24px' }}>
        <button className="btn-main" onClick={downloadDirect}>
          <Download size={24} />
          DESCARGAR AQUÍ
        </button>
        <button 
          className="opt-btn" 
          onClick={onReset}
          style={{ padding: 18, fontSize: 13 }}
        >
          <RefreshCcw size={18} style={{ marginRight: 10 }} />
          FINALIZAR
        </button>
      </div>
    </div>
  )
}
