import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wand2 } from 'lucide-react'

const CATEGORIES = [
  { id: 'campaña', label: 'ESCENARIOS' },
]

const OPTIONS_BY_CATEGORY = {
  campaña: [
    { id: 'jardin',    label: 'JARDÍN SAN MARCOS' },
    { id: 'auditorio',  label: 'AUDITORIO' },
    { id: 'oficina',    label: 'OFICINA' },
    { id: 'rally',      label: 'MITIN DE CAMPAÑA' },
  ],
}

export default function Capture({ onCapture, options, setOptions, branding }) {
  const isFutbol = options.category === 'futbol';
  const logoUrl = branding?.logos?.header || branding?.logos?.main || branding?.logoUrl || "/logo-tono-martin-del-campo.png";
  const tagline = branding?.tagline || (isFutbol ? "CABINA DE TRANSMISIÓN MUNDO FÚTBOL" : "TÓMATE LA FOTO CON TOÑO");
  
  const videoRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [countdown, setCountdown] = useState(null)

  useEffect(() => {
    let s
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 3840 }, height: { ideal: 2160 } }
    })
    .then(stream => {
      s = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setReady(true)
      }
    })
    .catch(err => console.error('Camera error:', err))

    return () => { s && s.getTracks().forEach(t => t.stop()) }
  }, [])

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      capturePhoto()
      setCountdown(null)
      return
    }
    const t = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  function handleStart() {
    if (countdown !== null) return
    setCountdown(3)
  }

  function capturePhoto() {
    const v = videoRef.current
    if (!v) return
    const c = document.createElement('canvas')
    c.width  = v.videoWidth
    c.height = v.videoHeight
    const ctx = c.getContext('2d')
    ctx.translate(c.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(v, 0, 0, c.width, c.height)
    onCapture(c.toDataURL('image/jpeg', 1.0))
  }

  return (
    <div className="kiosk-shell" style={{ overflow: 'hidden' }}>
      {/* FULL SCREEN CAMERA */}
      <div className="camera-fullscreen">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'cover',
            transform: 'scaleX(-1)' 
          }} 
        />
        {/* Visual Overlay / Border */}
        <div className="camera-overlay-vignette" />
      </div>

      {/* FLOATING UI: HEADER */}
      <div className="zone-header floating">
        <img src={logoUrl} alt="Logo" className="z-logo" />
        <div className="z-tagline">
          <h4>{tagline}</h4>
        </div>
      </div>

      {/* FLOATING UI: COUNTDOWN */}
      <AnimatePresence>
        {countdown !== null && countdown > 0 && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1.2, opacity: 1 }}
            exit={{ scale: 2, opacity: 0 }}
            key={countdown}
            className="countdown-floating"
          >
            {countdown}
          </motion.div>
        )}
      </AnimatePresence>

      {/* FLOATING UI: ACTION ZONE */}
      <div className="zone-action floating">
        <div className="options-container glass-blur">
          <div className="options-group">
            <p className="options-label">SELECCIONA EL TIPO DE FOTO</p>
            <div className="options-grid">
              <button 
                onClick={() => setOptions({ ...options, gender: 'female' })}
                className={`opt-btn ${options.gender === 'female' ? 'active' : ''}`}
              >
                MUJER
              </button>
              <button 
                onClick={() => setOptions({ ...options, gender: 'male' })}
                className={`opt-btn ${options.gender === 'male' ? 'active' : ''}`}
              >
                HOMBRE
              </button>
              <button 
                onClick={() => setOptions({ ...options, gender: 'group' })}
                className={`opt-btn ${options.gender === 'group' ? 'active' : ''}`}
              >
                FOTO GRUPAL
              </button>
            </div>
            {options.gender === 'group' && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  marginTop: '14px',
                  padding: '10px 14px',
                  background: 'rgba(227, 30, 36, 0.1)',
                  border: '1px solid rgba(227, 30, 36, 0.25)',
                  borderRadius: '12px',
                  fontSize: '12.5px',
                  color: '#ffb3b3',
                  textAlign: 'center',
                  backdropFilter: 'blur(8px)',
                  lineHeight: '1.4',
                  fontWeight: '500'
                }}
              >
                ⚠️ <strong>Recomendación Grupal:</strong> Para una recreación perfecta del rostro, la IA funciona mejor con personas claramente separadas en la foto. Las fotos individuales logran el máximo parecido posible.
              </motion.div>
            )}
          </div>
        </div>

        <button
          className="btn-main pulse-glow"
          onClick={handleStart}
          disabled={countdown !== null}
        >
          <Wand2 size={24} />
          {countdown !== null 
            ? 'POSA PARA LA CÁMARA...' 
            : (isFutbol ? 'CREAR FOTO EN LA CABINA' : 'CREAR FOTO CON TOÑO')}
        </button>
      </div>
    </div>
  )
}
