import { useState, useEffect } from 'react'
import SplashScreen from './components/SplashScreen.jsx'
import Capture from './components/Capture.jsx'
import Loading from './components/Loading.jsx'
import Result from './components/Result.jsx'
import QRCodeScreen from './components/QRCodeScreen.jsx'
import LeadsAdmin from './components/LeadsAdmin.jsx'
import { AnimatePresence } from 'framer-motion'
function App() {
  const isFutbol = window.location.pathname.toLowerCase().includes('/futbol');

  const [step, setStep] = useState('splash') // splash, capture, loading, result, qrcode
  const [userData, setUserData] = useState(null)
  const [options, setOptions] = useState(() => {
    return isFutbol 
      ? { category: 'futbol', selection: 'cabina', gender: 'male' }
      : { category: 'campaña', selection: 'jardin', gender: 'male' };
  });
  const [photo, setPhoto] = useState(null)
  const [processedPhoto, setProcessedPhoto] = useState(null)
  const [qrUrl, setQrUrl] = useState('')
  const [branding, setBranding] = useState(() => {
    if (isFutbol) {
      return {
        logoUrl: "/logo-tono-martin-del-campo.png",
        mainTitle: "FOTO CON TOÑO Y KIKÍN",
        tagline: "CABINA DE TRANSMISIÓN MUNDO FÚTBOL",
        primaryColor: "#006b3f", // Verde fútbol/México
        accentColor: "#e31e24",  // Rojo Selección
        secondaryColor: "#ffffff",
        textColor: "#ffffff",
        mutedColor: "#e2e8f0",
        logos: {
          header: "/logo-tono-martin-del-campo.png",
          main: "/logo-tono-martin-del-campo.png",
          splash: "/logo-tono-martin-del-campo.png",
          result: "/logo-tono-martin-del-campo.png"
        }
      };
    }
    return {
      logoUrl: "/logo-tono-martin-del-campo.png",
      mainTitle: "FOTO CON TOÑO",
      tagline: "AGUASCALIENTES 2026",
      logos: {
        header: "/logo-tono-martin-del-campo.png",
        main: "/logo-tono-martin-del-campo.png",
        splash: "/logo-tono-martin-del-campo.png",
        result: "/logo-tono-martin-del-campo.png"
      }
    };
  });

  // Efecto para inyectar clase de cuerpo para fútbol
  useEffect(() => {
    if (isFutbol) {
      document.body.classList.add('theme-futbol');
    } else {
      document.body.classList.remove('theme-futbol');
    }
  }, [isFutbol]);

  // Cargar configuracion al inicio
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[DEBUG] Entorno de desarrollo local detectado.");
      return;
    }
    fetch('./api.php?action=get_settings')
      .then(r => r.json())
      .then(data => {
        if (data) {
          if (isFutbol) {
            // Si es fútbol, no sobreescribir colores de branding de fútbol pero sí logos cargados
            if (data.branding) {
              setBranding(prev => ({
                ...prev,
                logos: { ...prev.logos, ...data.branding.logos },
                logoUrl: data.branding.logoUrl || prev.logoUrl
              }));
            }
          } else {
            if (data.branding) setBranding(prev => ({ ...prev, ...data.branding }));
          }
        }
      })
      .catch(e => console.error("Error cargando settings", e));
  }, [isFutbol]);

  // Inyectar branding reactivamente
  useEffect(() => {
    if (!branding) return;
    const root = document.documentElement;
    const b = branding;
    
    // Colores
    if (b.primaryColor) root.style.setProperty('--primary-color', b.primaryColor);
    if (b.accentColor) root.style.setProperty('--accent-color', b.accentColor);
    if (b.secondaryColor) root.style.setProperty('--secondary-color', b.secondaryColor);
    if (b.textColor) root.style.setProperty('--text-color', b.textColor);
    if (b.mutedColor) root.style.setProperty('--muted-color', b.mutedColor);
    
    // Bordes
    if (b.cornerRadius) root.style.setProperty('--radius-card', b.cornerRadius);
    
    // Tipografía
    if (b.fontSizes) {
      if (b.fontSizes.title) root.style.setProperty('--font-size-title', b.fontSizes.title + 'px');
      if (b.fontSizes.subtitle) root.style.setProperty('--font-size-subtitle', b.fontSizes.subtitle + 'px');
      if (b.fontSizes.body) root.style.setProperty('--font-size-body', b.fontSizes.body + 'px');
    }
    
    // Logos
    if (b.logoSizes) {
      if (b.logoSizes.splash) root.style.setProperty('--logo-size-splash', b.logoSizes.splash + 'px');
      if (b.logoSizes.header) root.style.setProperty('--logo-size-header', b.logoSizes.header + 'px');
      if (b.logoSizes.result) root.style.setProperty('--logo-size-result', b.logoSizes.result + 'px');
    }

    // Fondo y Animación
    if (b.bgType) {
      document.body.className = `bg-type-${b.bgType}`;
      if (b.bgType === 'solid' && b.bgColor) root.style.setProperty('--bg-deep', b.bgColor);
      if (b.bgType === 'gradient' && b.bgGradient) root.style.setProperty('--bg-gradient', b.bgGradient);
      if (b.bgType === 'mesh') {
        if (b.meshColors) {
          if (b.meshColors.c1) root.style.setProperty('--mesh-c1', b.meshColors.c1);
          if (b.meshColors.c2) root.style.setProperty('--mesh-c2', b.meshColors.c2);
          if (b.meshColors.c3) root.style.setProperty('--mesh-c3', b.meshColors.c3);
        }
        if (b.animSpeed) {
          root.style.setProperty('--mesh-speed', b.animSpeed + 's');
        }
      }
    }

    // Favicon
    if (b.logos?.favicon) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = b.logos.favicon;
    }
  }, [branding]);

  // Modo admin
  if (window.location.search.includes('admin')) {
    return <LeadsAdmin />;
  }

  // Función para procesar la imagen con la API
  async function processImage(imageB64) {
    setStep('loading')
    try {
      const isDev = import.meta.env.DEV;
      const apiUrl = isDev ? '/api/process-photo' : './admin.php?action=process'; 
      // Limpiamos el base64 para que no parezca un archivo
      const cleanPhoto = imageB64.includes(',') ? imageB64.split(',')[1] : imageB64;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p: cleanPhoto, // Usamos 'p' en lugar de 'photo' para despistar
          o: options,
          u: userData
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setProcessedPhoto(data.processedImage);
      setQrUrl(data.qrUrl || '');
      setStep('result');
    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
      setStep('capture');
    }
  }

  return (
    <>
      <AnimatePresence mode="wait">
        {step === 'splash' && (
          <SplashScreen key="splash" branding={branding} onComplete={() => setStep('capture')} />
        )}

        {step === 'capture' && (
          <Capture 
            key="capture" 
            branding={branding}
            options={options} 
            setOptions={setOptions} 
            onCapture={async (photoData) => {
              const img = new Image();
              await new Promise(r => { img.onload = r; img.src = photoData; });
              // Group photos need higher resolution so Vision can analyze each face individually
              const MAX_SIZE = options.gender === 'group' ? 2048 : 1536;
              let w = img.width, h = img.height;
              if (w > h && w > MAX_SIZE) { h *= MAX_SIZE / w; w = MAX_SIZE; }
              else if (h > MAX_SIZE) { w *= MAX_SIZE / h; h = MAX_SIZE; }
              const c = document.createElement('canvas');
              c.width = Math.round(w); c.height = Math.round(h);
              c.getContext('2d').drawImage(img, 0, 0, Math.round(w), Math.round(h));
              // Higher quality JPEG for better facial feature detection
              const smallPhoto = c.toDataURL('image/jpeg', 0.92);
              setPhoto(smallPhoto);
              processImage(smallPhoto);
            }} 
          />
        )}

        {step === 'loading' && (
          <Loading key="loading" branding={branding} />
        )}

        {step === 'result' && (
          <Result 
            key="result"
            branding={branding}
            processedPhoto={processedPhoto}
            onNext={() => setStep('qrcode')}
            onRetry={() => setStep('capture')}
            onRetryPrompt={() => processImage(photo)}
          />
        )}

        {step === 'qrcode' && (
          <QRCodeScreen 
            key="qrcode"
            branding={branding}
            qrUrl={qrUrl}
            processedPhoto={processedPhoto}
            onReset={() => {
              setStep('splash');
              setUserData(null);
              setPhoto(null);
              setProcessedPhoto(null);
            }}
          />
        )}
      </AnimatePresence>

      <div className="developer-footer">
      </div>
    </>
  )
}

export default App
