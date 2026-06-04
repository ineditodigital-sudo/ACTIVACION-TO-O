import { motion } from 'framer-motion'
import { Sparkles, Star } from 'lucide-react'

export default function SplashScreen({ onComplete, branding }) {
  const logoUrl = branding?.logos?.splash || branding?.logos?.main || branding?.logoUrl || "/logo-tono-martin-del-campo.png";
  const mainTitle = branding?.mainTitle || "FOTO CON TOÑO";
  const tagline = branding?.tagline || "AGUASCALIENTES 2026";

  return (
    <div className="kiosk-shell">
      {/* Mesh Background */}
      <div className="mesh-bg">
        <div className="mesh-circle c1" />
        <div className="mesh-circle c2" />
        <div className="mesh-circle c3" />
      </div>

      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 30,
        padding: '0 10%',
        textAlign: 'center',
      }}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{ marginBottom: 60 }}
        >
          <img
            src={logoUrl}
            alt="Logo"
            style={{ height: 'var(--logo-size-splash)', objectFit:'contain' }}
          />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 1 }}
          className="big-title"
          style={{ marginBottom: 10 }}
        >
          {mainTitle}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="sub-title"
          style={{ opacity: 0.6 }}
        >
          {tagline}
        </motion.p>
      </div>

      {/* Loading Bar */}
      <div style={{
        position: 'absolute',
        bottom: '10%',
        left: '10%',
        right: '10%',
        zIndex: 40
      }}>
        <div style={{ width:'100%', height:4, background:'rgba(255,255,255,0.1)', borderRadius:99, overflow:'hidden', marginBottom: 15 }}>
          <motion.div
            style={{ height:'100%', background:'var(--white)', borderRadius:99 }}
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 3, ease: 'easeInOut' }}
            onAnimationComplete={onComplete}
          />
        </div>
        <p style={{ fontSize:10, color:'var(--white)', opacity: 0.4, fontWeight:700, textTransform:'uppercase', letterSpacing:'.2em', textAlign: 'center' }}>
          INICIANDO...
        </p>
      </div>
    </div>
  )
}
