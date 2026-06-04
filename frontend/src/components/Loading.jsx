import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Star, Wand2 } from 'lucide-react'

const LOADING_STEPS = [
  "ANALIZANDO FOTOGRAFÍA...",
  "PROCESANDO ROSTRO CON IA...",
  "CREANDO ENCUENTRO CON TOÑO...",
  "ILUMINANDO ESCENARIO...",
  "¡CASI LISTO!..."
]

export default function Loading({ branding }) {
  const logoUrl = branding?.logos?.splash || branding?.logos?.main || branding?.logoUrl || "/logo-tono-martin-del-campo.png";
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex(prev => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev))
    }, 1200) // Cambia el texto cada 1.2 segundos
    return () => clearInterval(interval)
  }, [])

  return (
    <motion.div 
      className="kiosk-shell" 
      style={{ zIndex: 200, position: 'fixed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Mesh Background */}
      <div className="mesh-bg">
        <div className="mesh-circle c1" />
        <div className="mesh-circle c2" />
        <div className="mesh-circle c3" />
      </div>

      {/* FLASH EFFECT ON START */}
      <motion.div 
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.8 }}
        style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 300, pointerEvents: 'none' }}
      />

      <div className="loading-container" style={{ position: 'relative', zIndex: 10, width: '100%' }}>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <motion.img 
            src={branding?.logos?.splash || branding?.logos?.main || branding?.logoUrl || "/logo-tono-martin-del-campo.png"} 
            alt="Logo" 
            style={{ height: 'var(--logo-size-splash)', objectFit: 'contain', marginBottom: 40 }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          
          <h2 style={{ 
            fontSize:'clamp(24px, 5vw, 42px)', 
            fontWeight:900, 
            color:'var(--white)', 
            textTransform:'uppercase', 
            letterSpacing: '0.15em',
            lineHeight: 1,
            margin:0 
          }}>
            CREANDO <br/>
            <span style={{ color: 'var(--accent-blue)', opacity: 0.8 }}>TU FOTO</span>
          </h2>
        </motion.div>

        {/* Texto Dinámico */}
        <div style={{ height: 40, marginTop: 30, position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
          <AnimatePresence mode="wait">
            <motion.p
              key={stepIndex}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.5 }}
              style={{ 
                fontSize: 12, 
                fontWeight: 700, 
                color: 'var(--white)',
                opacity: 0.6,
                margin: 0, 
                textTransform: 'uppercase',
                letterSpacing: '.3em', 
                position: 'absolute'
              }}
            >
              {LOADING_STEPS[stepIndex]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Progress Bar */}
        <div className="loader-bar-wrap" style={{ margin: '50px auto 0' }}>
          <motion.div 
            className="loader-bar-fill"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 10, ease: 'easeInOut' }}
          />
        </div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ delay: 1 }}
          style={{ marginTop: 60, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}
        >
          <Wand2 size={18} />
          <p style={{ fontSize: 10, color:'var(--white)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.2em', margin: 0 }}>
            NEURAL ART ENGINE • HIGH PRECISION
          </p>
        </motion.div>
      </div>
    </motion.div>
  )
}
