import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CloudDownload, CheckCircle2, X, RefreshCcw, Eye } from 'lucide-react'

export default function Result({ processedPhoto, onNext, onRetry, onRetryPrompt, branding }) {
  const logoUrl = branding?.logos?.result || branding?.logos?.main || branding?.logoUrl || "/logo-tono-martin-del-campo.png";
  const tagline = branding?.tagline || "AGUASCALIENTES 2026";
  const [showLightbox, setShowLightbox] = useState(false)
  
  return (
    <div className="kiosk-shell">
      <div className="mesh-bg">
        <div className="mesh-circle c1" />
        <div className="mesh-circle c2" />
        <div className="mesh-circle c3" />
      </div>

      <div className="zone-header">
        <img src={logoUrl} alt="Logo" className="z-logo" style={{ height: 'var(--logo-size-result)' }} />
        <div className="z-tagline">
          <h4>RESULTADO</h4>
        </div>
      </div>

      <div className="zone-visual">
        <div 
          className="visual-frame" 
          onClick={() => setShowLightbox(true)}
        >
          {processedPhoto ? (
            <motion.img
              className="result-img"
              src={processedPhoto}
              alt="Resultado"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: .6 }}
            />
          ) : (
            <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)' }}>
              <p style={{ fontSize:14, fontWeight:700, color:'var(--white)', textTransform:'uppercase', letterSpacing: '0.1em' }}>REVELANDO...</p>
            </div>
          )}

          <div className="visual-badge">
            <p>{tagline}</p>
          </div>
          <div style={{ position: 'absolute', top: 15, right: 15, background: 'rgba(0,0,0,0.5)', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Eye size={20} />
          </div>
        </div>
      </div>

      <div className="zone-action">
        <button
          className="btn-main"
          onClick={onNext}
        >
          <CloudDownload size={24} />
          OBTENER MI FOTO
        </button>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <button 
            onClick={onRetryPrompt}
            className="opt-btn"
          >
            <RefreshCcw size={18} />
            REDISEÑAR
          </button>

          <button 
            onClick={onRetry}
            className="opt-btn"
          >
            <RefreshCcw size={18} />
            NUEVA FOTO
          </button>
        </div>

        <div className="step-card">
          <CheckCircle2 size={24} color="var(--accent-blue)" />
          <div className="step-text">
            <h4>ÉXITO</h4>
            <p>Fotografía de campaña creada con IA</p>
          </div>
        </div>
      </div>

      {/* ── LIGHTBOX OVERLAY ── */}
      <AnimatePresence>
        {showLightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lightbox-overlay"
            onClick={() => setShowLightbox(false)}
          >
            <motion.div 
              className="lightbox-content"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="lightbox-close" onClick={() => setShowLightbox(false)}>
                <X size={28} />
              </button>
              <img 
                src={processedPhoto} 
                alt="Full Result" 
                className="lightbox-img"
              />
              <div className="lightbox-hint">TOCA FUERA O EL BOTÓN PARA CERRAR</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
