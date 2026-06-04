import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Lock, LogOut, Eye, FileSpreadsheet, Trash2, Settings, Users, ToggleLeft, ToggleRight, Menu, X, Palette, Type, Layout, Image as ImageIcon } from 'lucide-react';

export default function LeadsAdmin() {
  const [auth, setAuth] = useState(false);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewImg, setPreviewImg] = useState(null);
  
  const [activeTab, setActiveTab] = useState('branding');
  const [activeCampaign, setActiveCampaign] = useState('principal');
  const [fullSettings, setFullSettings] = useState({ principal: {}, Futbol: {} });
  const [skipForm, setSkipForm] = useState(false);
  const [basePrompt, setBasePrompt] = useState('Photorealistic editorial photography, political campaign portrait, perfect facial likeness');
  const [negativePrompt, setNegativePrompt] = useState('cartoon, illustration, 3D render, low quality, deformed, ugly, distorted faces, unrealistic');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [error, setError] = useState('');
  const [references, setReferences] = useState([]);
  const [iaLogos, setIaLogos] = useState([]);
  const [assetLoading, setAssetLoading] = useState(false);
  const [logoIaLoading, setLogoIaLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const handleCampaignSwitch = (campaign) => {
    const updatedSettings = { ...fullSettings, [activeCampaign]: { branding, skip_leads_form: skipForm, basePrompt, negativePrompt } };
    setFullSettings(updatedSettings);
    setActiveCampaign(campaign);
    const newProfile = updatedSettings[campaign] || {};
    setBranding(newProfile.branding || { logos: {}, colors: {}, fonts: {}, logoSizes: {}, meshColors: {}, fontSizes: { title: 32, subtitle: 18, body: 14 } });
    setSkipForm(newProfile.skip_leads_form || false);
    setBasePrompt(newProfile.basePrompt || "");
    setNegativePrompt(newProfile.negativePrompt || "");
  };


  // Branding State
  const [branding, setBranding] = useState({
    primaryColor: '#0A4F8F',
    accentColor: '#002f6c',
    secondaryColor: '#1e293b',
    textColor: '#ffffff',
    mutedColor: 'rgba(255, 255, 255, 0.4)',
    
    bgType: 'mesh', // 'mesh', 'gradient', 'solid'
    bgColor: '#020617',
    bgGradient: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)',
    meshColors: { c1: '#0A4F8F', c2: '#002f6c', c3: '#ffffff' },
    
    mainTitle: 'FOTO CON TOÑO',
    tagline: 'TÓMATE LA FOTO CON TOÑO',
    cornerRadius: '24px',
    
    fontSizes: {
      title: '48',
      subtitle: '18',
      body: '14'
    },
    
    logoSizes: {
      splash: '120',
      header: '40',
      result: '60'
    },
    
    logos: {
      main: '/logo-tono-martin-del-campo.png',
      splash: '',
      header: '',
      result: '',
      favicon: '',
      qrIcon: ''
    },
    animSpeed: 20
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  // Cargar assets al autenticarse
  useEffect(() => {
    if (auth && user && pass) {
      fetchAssets();
    }
  }, [auth]);

  async function fetchLeads() {
    if (!user || !pass) return;
    setLoading(true);
    try {
      const res = await fetch(`./api.php?action=get_leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, pass })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setLeads([...data].reverse());
        setAuth(true); // Persistir auth si fue exitoso
        fetchSettings();
        fetchAssets();
      } else if (res.status === 401) {
        alert('Credenciales incorrectas');
        setAuth(false);
      }
    } catch (err) {
      console.error(err);
      setError("Credenciales incorrectas o error de conexión");
    }
    setLoading(false);
  }

  async function fetchSettings() {
    try {
      const res = await fetch(`./api.php?action=get_settings`);
      if (res.ok) {
        const data = await res.json();
        setSkipForm(data.skip_leads_form === true);
        if (data.basePrompt) setBasePrompt(data.basePrompt);
        if (data.negativePrompt) setNegativePrompt(data.negativePrompt);
        if (data.branding) setBranding({ ...branding, ...data.branding });
      }
      fetchAssets();
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchAssets() {
    try {
      const t = Date.now();
      const [resRef, resLogos] = await Promise.all([
        fetch(`./api.php?action=get_assets&cat=references&user=${user}&pass=${pass}&t=${t}`),
        fetch(`./api.php?action=get_assets&cat=logos_ia&user=${user}&pass=${pass}&t=${t}`)
      ]);
      if (resRef.ok) {
        const data = await resRef.json();
        setReferences(data.map(a => ({ ...a, url: `${a.url}?v=${t}` })));
      }
      if (resLogos.ok) {
        const data = await resLogos.json();
        setIaLogos(data.map(a => ({ ...a, url: `${a.url}?v=${t}` })));
      }
    } catch (e) { console.error(e); }
  }

  const resizeImage = (file, maxDim = 800, quality = 0.65, format = 'image/jpeg') => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          // Limitar ambas dimensiones
          if (width > maxDim || height > maxDim) {
            if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
            else { width = Math.round(width * maxDim / height); height = maxDim; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (format === 'image/jpeg') { ctx.fillStyle = '#FFF'; ctx.fillRect(0,0,width,height); }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL(format, quality));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  async function uploadAsset(e, cat = 'references') {
    const file = e.target.files[0];
    if (!file) return;
    if (cat === 'references') setAssetLoading(true);
    else setLogoIaLoading(true);

    try {
      const format = (cat === 'logos_ia') ? 'image/png' : 'image/jpeg';
      const resizedB64 = await resizeImage(file, 800, 0.65, format);
      // Verificar tamaño estimado
      const sizeKB = Math.round(resizedB64.length * 0.75 / 1024);
      console.log(`Upload ${cat}: ${sizeKB}KB`);
      const res = await fetch(`./api.php?action=upload_asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, pass, image: resizedB64, name: file.name, cat })
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { data = { error: 'Respuesta inválida: ' + text.substring(0, 200) }; }
      if (data.error) alert('Error del servidor: ' + data.error);
      else { await fetchAssets(); }
    } catch (e) { 
      console.error(e);
      alert('Error al subir: ' + e.message);
    }
    setAssetLoading(false);
    setLogoIaLoading(false);
  }

  async function uploadBrandingAsset(e, field) {
    const file = e.target.files[0];
    if (!file) return;
    setSettingsLoading(true);
    try {
      // Logos y favicon SIEMPRE en PNG para transparencia
      const resizedB64 = await resizeImage(file, 800, 0.9, 'image/png');
      const res = await fetch(`./api.php?action=upload_asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, pass, image: resizedB64, name: `brand_${field}_${Date.now()}.png`, cat: 'branding' })
      });
      const data = await res.json();
      if (data.status === 'uploaded') {
        const newUrl = `./branding/${data.name}`;
        if (field === 'framePrincipal' || field === 'frameFutbol') {
          setBranding({ ...branding, [field]: newUrl });
        } else if (field === 'main') {
          setBranding({ ...branding, logos: { ...branding.logos, main: newUrl } });
        } else {
          setBranding({ ...branding, logos: { ...branding.logos, [field]: newUrl } });
        }
      } else {
        alert("Error: " + (data.error || "Fallo en la subida"));
      }
    } catch (e) { 
      console.error(e);
      alert("Error al subir logo"); 
    }
    setSettingsLoading(false);
  }

  async function deleteAsset(name, cat = 'references') {
    if (!confirm('¿Eliminar este elemento?')) return;
    try {
      await fetch(`./api.php?action=delete_asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, pass, name, cat })
      });
      fetchAssets();
    } catch (e) { alert("Error al eliminar"); }
  }

  async function saveSettings(newSkip = skipForm, newBase = basePrompt, newNeg = negativePrompt, newBranding = branding) {
    setSettingsLoading(true);
    setSkipForm(newSkip);
    setBasePrompt(newBase);
    setNegativePrompt(newNeg);
    setBranding(newBranding);
    try {
      await fetch(`./api.php?action=save_settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user, pass, 
          skip_leads_form: newSkip,
          basePrompt: newBase,
          negativePrompt: newNeg,
          branding: newBranding
        })
      });
    } catch (err) {
      console.error(err);
      alert("Error guardando ajustes");
    }
    setSettingsLoading(false);
  }

  async function deleteLead(imageUrl) {
    if (!confirm('¿Seguro que quieres eliminar este registro?')) return;
    try {
      const res = await fetch(`./api.php?action=delete_lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, pass, image_url: imageUrl })
      });
      if (res.ok) fetchLeads();
    } catch (e) {
      alert("Error al eliminar");
    }
  }

  function login(e) {
    e.preventDefault();
    fetchLeads();
  }

  function downloadCSV() {
    if (leads.length === 0) return;

    const headers = ["Fecha", "Nombre", "Telefono", "Email", "Categoria", "Seleccion", "Referencia Imagen"];
    const rows = leads.map(l => [
      l.timestamp || l.date ? new Date(l.timestamp || l.date).toLocaleString() : 'N/A',
      l.name,
      l.phone,
      l.email,
      l.category || '',
      l.selection || '',
      l.imageFile || l.image_url || 'N/A'
    ]);

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // BOM para Excel
    csvContent += headers.join(",") + "\n";
    rows.forEach(r => {
      csvContent += r.map(field => `"${String(field || '').replace(/"/g, '""')}"`).join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `leads_tono_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  if (!auth) {
    return (
      <div className="kiosk-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="mesh-bg">
          <div className="mesh-circle c1" />
          <div className="mesh-circle c2" />
          <div className="mesh-circle c3" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card"
          style={{ width: '100%', maxWidth: 400, textAlign: 'center', padding: 40, position: 'relative', zIndex: 10 }}
        >
          <img src={branding?.logos?.main || "/logo-tono-martin-del-campo.png"} alt="Logo" style={{ height: 40, marginBottom: 40, objectFit: 'contain' }} />
          
          <h2 style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.2em', color: '#1e293b', marginBottom: 30, textTransform: 'uppercase' }}>
            ADMIN PANEL
          </h2>

          <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
            <div className="input-group" style={{ textAlign: 'left' }}>
              <label>USUARIO</label>
              <input
                autoFocus
                value={user}
                onChange={e => setUser(e.target.value)}
                className="admin-textarea"
                style={{ height: 56 }}
                placeholder="Admin"
                autoComplete="username"
              />
            </div>
            <div className="input-group" style={{ textAlign: 'left' }}>
              <label>CONTRASEÑA</label>
              <input
                type="password"
                value={pass}
                onChange={e => setPass(e.target.value)}
                className="admin-textarea"
                style={{ height: 56 }}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            
            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="error-badge"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              className="btn-main"
              style={{ marginTop: 10, height: 64 }}
            >
              ACCEDER
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="kiosk-shell" style={{ overflowY: 'auto' }}>
      {/* Mesh Background */}
      <div className="mesh-bg">
        <div className="mesh-circle c1" />
        <div className="mesh-circle c2" />
        <div className="mesh-circle c3" />
      </div>

      <header className="admin-header">
        <div style={{ background: "#1e293b", padding: "4px 8px", borderRadius: "8px" }}><img src={branding?.logos?.main || branding?.logoUrl || "/logo-tono-martin-del-campo.png"} alt="Logo" style={{ height: 28, objectFit: "contain" }} /></div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <div className="admin-nav" style={{ display: "flex", gap: 20 }}>
            <div className="campaign-toggle" style={{ display: "flex", background: "rgba(0,0,0,0.5)", borderRadius: 12, padding: 4 }}>
              <button 
                onClick={() => handleCampaignSwitch("principal")}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: activeCampaign === "principal" ? "#0A4F8F" : "transparent", color: activeCampaign === "principal" ? "white" : "rgba(255,255,255,0.6)", cursor: "pointer", fontWeight: "bold" }}>
                Principal
              </button>
              <button 
                onClick={() => handleCampaignSwitch("Futbol")}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: activeCampaign === "Futbol" ? "#10b981" : "transparent", color: activeCampaign === "Futbol" ? "white" : "rgba(255,255,255,0.6)", cursor: "pointer", fontWeight: "bold" }}>
                Futbol
              </button>
            </div>
            <div className="desktop-nav">
              <button className={`admin-nav-btn ${activeTab === "branding" ? "active" : ""}`} onClick={() => setActiveTab("branding")}>MARCA</button>
              <button className={`admin-nav-btn ${activeTab === "prompts" ? "active" : ""}`} onClick={() => setActiveTab("prompts")}>PROMPTS</button>
            </div>
          </div>

          <button className="logout-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'white', borderColor: 'rgba(255,255,255,0.1)' }} onClick={async () => {
            const res = await fetch(`./api.php?action=debug_assets&user=${user}&pass=${encodeURIComponent(pass)}`);
            const text = await res.text();
            alert('DIAGNÓSTICO:\n' + text.substring(0, 800));
          }}>
            <Settings size={18} />
            <span>DIAG</span>
          </button>

          <button className="logout-btn" onClick={() => window.location.reload()}>
            <LogOut size={18} />
            <span>SALIR</span>
          </button>

          <button className="menu-toggle-btn" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="drawer-overlay"
              onClick={() => setMenuOpen(false)}
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="drawer-sidebar"
            >
              <div className="sidebar-blur-bg" />
              
              <div className="sidebar-header">
                <div className="logo-wrapper">
                  <img src={branding.logos?.main || branding.logoUrl || "/logo-tono-martin-del-campo.png"} alt="Logo" />
                </div>
                <button className="close-sidebar-btn" onClick={() => setMenuOpen(false)}>
                  <X size={20} />
                </button>
              </div>

              <nav className="sidebar-nav">


                <div className="nav-group">
                  <p className="nav-label">SISTEMA</p>
                  <button className={`nav-item ${activeTab === 'branding' ? 'active' : ''}`} onClick={() => { setActiveTab('branding'); setMenuOpen(false); }}>
                    <div className="nav-icon"><Palette size={18} /></div>
                    <span>Identidad de Marca</span>
                  </button>
                  <button className={`nav-item ${activeTab === 'prompts' ? 'active' : ''}`} onClick={() => { setActiveTab('prompts'); setMenuOpen(false); }}>
                    <div className="nav-icon"><Type size={18} /></div>
                    <span>Prompt Studio</span>
                  </button>
                </div>
              </nav>

              <div className="sidebar-footer">
                <div className="user-profile">
                  <div className="user-avatar">
                    <Lock size={14} />
                  </div>
                  <div className="user-info">
                    <p className="user-name">Administrador</p>
                    <p className="user-role">Súper Usuario</p>
                  </div>
                </div>
                <button className="sidebar-logout-btn" onClick={() => window.location.reload()}>
                  <LogOut size={18} />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="admin-body">
        <AnimatePresence mode="wait">


        {activeTab === 'branding' && (
          <motion.div 
            key="branding"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="admin-section"
          >
            <h2 className="section-title">GESTIÓN DE MARCA</h2>
            
            <div className="branding-tabs-container">
              <div className="branding-grid">
                {/* COLUMNA IZQUIERDA: IDENTIDAD Y COLORES */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <h3 className="card-label">IDENTIDAD Y TEXTOS</h3>
                    <div className="input-group">
                      <label>TÍTULO PRINCIPAL</label>
                      <input value={branding.mainTitle} onChange={(e) => setBranding({ ...branding, mainTitle: e.target.value })} className="admin-textarea" />
                    </div>
                    <div className="input-group">
                      <label>TAGLINE / SLOGAN</label>
                      <input value={branding.tagline} onChange={(e) => setBranding({ ...branding, tagline: e.target.value })} className="admin-textarea" />
                    </div>
                    <div className="input-group">
                      <label>REDONDEO DE BORDES (Radius)</label>
                      <select value={branding.cornerRadius} onChange={(e) => setBranding({ ...branding, cornerRadius: e.target.value })} className="admin-textarea">
                        <option value="0px">Cuadrado (0px)</option>
                        <option value="12px">Suave (12px)</option>
                        <option value="24px">Moderno (24px)</option>
                        <option value="32px">Premium (32px)</option>
                        <option value="50px">Cápsula (50px)</option>
                      </select>
                    </div>
                  </div>

                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <h3 className="card-label">PALETA DE COLORES</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                      <ColorInput label="PRIMARIO" value={branding.primaryColor} onChange={(v) => setBranding({...branding, primaryColor: v})} />
                      <ColorInput label="ACENTO" value={branding.accentColor} onChange={(v) => setBranding({...branding, accentColor: v})} />
                      <ColorInput label="SECUNDARIO" value={branding.secondaryColor} onChange={(v) => setBranding({...branding, secondaryColor: v})} />
                      <ColorInput label="TEXTO" value={branding.textColor} onChange={(v) => setBranding({...branding, textColor: v})} />
                    </div>
                    <ColorInput label="MUTED (Transparencia)" value={branding.mutedColor} onChange={(v) => setBranding({...branding, mutedColor: v})} />
                  </div>

                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <h3 className="card-label">FONDO (BACKGROUND)</h3>
                    <div className="input-group">
                      <label>TIPO DE FONDO</label>
                      <select value={branding.bgType} onChange={(e) => setBranding({ ...branding, bgType: e.target.value })} className="admin-textarea">
                        <option value="mesh">Mesh Animado (Original)</option>
                        <option value="gradient">Degradado Estático</option>
                        <option value="solid">Color Sólido</option>
                      </select>
                    </div>
                    {branding.bgType === 'solid' && (
                      <ColorInput label="COLOR DE FONDO" value={branding.bgColor} onChange={(v) => setBranding({...branding, bgColor: v})} />
                    )}
                    {branding.bgType === 'gradient' && (
                      <div className="input-group">
                        <label>CSS GRADIENT</label>
                        <input value={branding.bgGradient} onChange={(e) => setBranding({ ...branding, bgGradient: e.target.value })} className="admin-textarea" placeholder="linear-gradient(...)" />
                      </div>
                    )}
                    {branding.bgType === 'mesh' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                        <label className="card-label">COLORES MESH (ANIMADO)</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                          <ColorInput label="CÍRCULO 1" value={branding.meshColors?.c1 || '#ff003c'} onChange={(v) => setBranding({...branding, meshColors: {...branding.meshColors, c1: v}})} />
                          <ColorInput label="CÍRCULO 2" value={branding.meshColors?.c2 || '#004cff'} onChange={(v) => setBranding({...branding, meshColors: {...branding.meshColors, c2: v}})} />
                          <ColorInput label="COLOR MESH 3" value={branding.meshColors?.c3 || '#ffffff'} onChange={(c) => setBranding({...branding, meshColors: {...branding.meshColors, c3: c}})} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="glass-card">
                    <p className="card-label">ANIMACIÓN DE FONDO</p>
                    <div className="input-group" style={{ marginTop: 15 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                        <label style={{ fontSize: 10 }}>VELOCIDAD (S)</label>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>{branding.animSpeed || 20}s</span>
                      </div>
                      <input 
                        type="range" 
                        min="5" 
                        max="60" 
                        step="1"
                        value={branding.animSpeed || 20} 
                        onChange={(e) => setBranding({...branding, animSpeed: parseInt(e.target.value)})} 
                        style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary-color)' }}
                      />
                      <p className="card-desc" style={{ marginTop: 10 }}>Menor tiempo = más rápido. Recomendado: 15s - 30s.</p>
                    </div>
                  </div>
                </div>

                {/* COLUMNA DERECHA: TIPOGRAFÍA Y LOGOS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <h3 className="card-label">TIPOGRAFÍA (TAMAÑOS PX)</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      <div className="input-group">
                        <label>TÍTULO</label>
                        <input type="number" value={branding.fontSizes.title} onChange={(e) => setBranding({ ...branding, fontSizes: {...branding.fontSizes, title: e.target.value} })} className="admin-textarea" />
                      </div>
                      <div className="input-group">
                        <label>SUBTIT.</label>
                        <input type="number" value={branding.fontSizes.subtitle} onChange={(e) => setBranding({ ...branding, fontSizes: {...branding.fontSizes, subtitle: e.target.value} })} className="admin-textarea" />
                      </div>
                      <div className="input-group">
                        <label>BODY</label>
                        <input type="number" value={branding.fontSizes.body} onChange={(e) => setBranding({ ...branding, fontSizes: {...branding.fontSizes, body: e.target.value} })} className="admin-textarea" />
                      </div>
                    </div>
                  </div>

                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <h3 className="card-label">LOGOTIPOS POR SECCIÓN</h3>
                    
                    <LogoUpload 
                      label="LOGO PRINCIPAL" 
                      url={branding.logos.main} 
                      onUpload={(e) => uploadBrandingAsset(e, 'main')} 
                      size={branding.logoSizes.header}
                      onSizeChange={(v) => setBranding({...branding, logoSizes: {...branding.logoSizes, header: v}})}
                    />
                    
                    <LogoUpload 
                      label="LOGO SPLASH (Carga)" 
                      url={branding.logos.splash || branding.logos.main} 
                      onUpload={(e) => uploadBrandingAsset(e, 'splash')} 
                      size={branding.logoSizes.splash}
                      onSizeChange={(v) => setBranding({...branding, logoSizes: {...branding.logoSizes, splash: v}})}
                    />

                    <LogoUpload 
                      label="LOGO RESULTADO" 
                      url={branding.logos.result || branding.logos.main} 
                      onUpload={(e) => uploadBrandingAsset(e, 'result')} 
                      size={branding.logoSizes.result}
                      onSizeChange={(v) => setBranding({...branding, logoSizes: {...branding.logoSizes, result: v}})}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <LogoUpload 
                        label="FAVICON" 
                        url={branding.logos.favicon} 
                        onUpload={(e) => uploadBrandingAsset(e, 'favicon')} 
                        size={32}
                        onSizeChange={() => {}}
                      />
                      <LogoUpload 
                        label="QR CENTER ICON" 
                        url={branding.logos?.qrIcon} 
                        onUpload={(e) => uploadBrandingAsset(e, 'qrIcon')} 
                        size={40}
                        onSizeChange={() => {}}
                      />
                    </div>
                  </div>

                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <h3 className="card-label">⚙️ MARCOS / PIE DE FOTO</h3>
                    <p style={{ fontSize: 11, color: '#64748b', marginBottom: -10 }}>Se sobrepondrán automáticamente a la imagen generada.</p>
                    
                    <LogoUpload 
                      label="MARCO (ACTIVACIÓN PRINCIPAL)" 
                      url={branding.framePrincipal} 
                      onUpload={(e) => uploadBrandingAsset(e, 'framePrincipal')} 
                      size={0}
                      onSizeChange={() => {}}
                    />
                    <LogoUpload 
                      label="MARCO (ACTIVACIÓN Futbol)" 
                      url={branding.frameFutbol} 
                      onUpload={(e) => uploadBrandingAsset(e, 'frameFutbol')} 
                      size={0}
                      onSizeChange={() => {}}
                    />
                  </div>

                  <button 
                    onClick={() => saveSettings(skipForm, basePrompt, negativePrompt, branding)}
                    className="btn-main"
                    style={{ height: 70 }}
                    disabled={settingsLoading}
                  >
                    <Layout size={20} />
                    {settingsLoading ? 'GUARDANDO...' : 'GUARDAR TODO EL DISEÑO'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}


        {activeTab === 'prompts' && (
          <motion.div 
            key="prompts"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="admin-section"
          >
            <h2 className="section-title">PROMPT STUDIO</h2>
            
            <div className="prompts-grid">
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
                <div className="input-group">
                  <label>BASE PROMPT</label>
                  <textarea 
                    value={basePrompt}
                    onChange={(e) => setBasePrompt(e.target.value)}
                    rows={6}
                    className="admin-textarea"
                    placeholder="Describe el estilo, iluminación y calidad..."
                  />
                </div>
                <div className="input-group">
                  <label>NEGATIVE PROMPT</label>
                  <textarea 
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    rows={3}
                    className="admin-textarea"
                    placeholder="Lo que NO quieres que aparezca..."
                  />
                </div>
                <button 
                  onClick={() => saveSettings(skipForm, basePrompt, negativePrompt)}
                  className="btn-main"
                  disabled={settingsLoading}
                >
                  {settingsLoading ? 'GUARDANDO...' : 'ACTUALIZAR PROMPT'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* REFERENCIAS DE ESTILO */}
                <div className="glass-card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 className="card-label" style={{ margin: 0 }}>REFERENCIAS DE ESTILO</h3>
                    <button onClick={fetchAssets} className="btn-icon" title="Refrescar">
                      <Palette size={14} />
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 10, marginBottom: 20 }}>
                    {references.length === 0 && !assetLoading && (
                      <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 11 }}>
                        No hay referencias aún.
                      </div>
                    )}
                    {references.map((a, i) => (
                      <div key={i} style={{ position: 'relative', aspectRatio: '1/1', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
                        <img src={a.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button 
                          onClick={() => deleteAsset(a.name, 'references')}
                          style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 6, color: 'white', padding: 4, cursor: 'pointer' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    {assetLoading && <div style={{ aspectRatio: '1/1', background: 'var(--glass)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>...</div>}
                  </div>
                  <label className="admin-action-btn" style={{ cursor: 'pointer', justifyContent: 'center' }}>
                    <ImageIcon size={16} /> SUBIR ESTILO
                    <input type="file" hidden onChange={(e) => uploadAsset(e, 'references')} accept="image/*" />
                  </label>
                  <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 12, textAlign: 'center', lineHeight: 1.4 }}>
                    Guías visuales para la IA (poses, fondos, vestuario).
                  </p>
                </div>

                {/* LOGOS PARA LA IA */}
                <div className="glass-card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 className="card-label" style={{ margin: 0 }}>LOGOS PARA EL DISEÑO</h3>
                    <button onClick={fetchAssets} className="btn-icon" title="Refrescar">
                      <Palette size={14} />
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 10, marginBottom: 20 }}>
                    {iaLogos.length === 0 && !logoIaLoading && (
                      <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 11 }}>
                        No hay logos aún.
                      </div>
                    )}
                    {iaLogos.map((a, i) => (
                      <div key={i} style={{ position: 'relative', aspectRatio: '1/1', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.05)' }}>
                        <img src={a.url} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 5 }} />
                        <button 
                          onClick={() => deleteAsset(a.name, 'logos_ia')}
                          style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 6, color: 'white', padding: 4, cursor: 'pointer' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    {logoIaLoading && <div style={{ aspectRatio: '1/1', background: 'var(--glass)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>...</div>}
                  </div>
                  <label className="admin-action-btn" style={{ cursor: 'pointer', justifyContent: 'center' }}>
                    <ImageIcon size={16} /> SUBIR LOGO
                    <input type="file" hidden onChange={(e) => uploadAsset(e, 'logos_ia')} accept="image/*" />
                  </label>
                  <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 12, textAlign: 'center', lineHeight: 1.4 }}>
                    Logos que la IA debe integrar en el resultado final.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </main>

      {/* Modal Preview */}
      <AnimatePresence>
        {previewImg && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="lightbox-overlay" onClick={() => setPreviewImg(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="lightbox-content" onClick={e => e.stopPropagation()}>
              <img src={previewImg} style={{ width: '100%', borderRadius: 20 }} />
              <button className="btn-main" style={{ marginTop: 20 }} onClick={() => setPreviewImg(null)}>CERRAR</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .admin-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 24px; background: var(--glass-heavy); backdrop-filter: var(--blur);
          border-bottom: 1px solid var(--glass-border); z-index: 20; position: sticky; top: 0;
        }
        .admin-nav { display: flex; gap: 8px; }
        .admin-nav-btn {
          padding: 8px 16px; border-radius: var(--radius-pill); border: 1px solid transparent;
          background: transparent; color: var(--muted); font-weight: 700; font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; transition: all 0.3s;
        }
        .admin-nav-btn.active { background: var(--glass); color: #1e293b; border-color: var(--glass-border); }
        .admin-body { padding: 40px 24px; z-index: 10; position: relative; }
        .section-title { font-size: 24px; font-weight: 900; letter-spacing: 0.1em; margin-bottom: 30px; }
        .admin-table-container { display: flex; flexDirection: column; gap: 12px; }
        .admin-row {
          background: var(--glass); border: 1px solid var(--glass-border); border-radius: 20px;
          padding: 20px; display: flex; justify-content: space-between; align-items: center;
        }
        .row-date { font-size: 10px; font-weight: 700; color: var(--muted); margin-bottom: 4px; }
        .row-name { font-size: 16px; font-weight: 800; text-transform: uppercase; margin-bottom: 4px; }
        .row-contact { font-size: 12px; color: var(--muted); }
        .row-actions { display: flex; gap: 8px; }
        .admin-icon-btn {
          width: 44px; height: 44px; border-radius: 12px; border: 1px solid var(--glass-border);
          background: var(--glass-heavy); color: #1e293b; display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        }
        .admin-icon-btn.del { color: var(--accent-red); }
        .admin-action-btn {
          padding: 10px 20px; border-radius: var(--radius-pill); background: var(--white); color: var(--bg-deep);
          font-weight: 800; font-size: 11px; text-transform: uppercase; border: none; cursor: pointer;
          display: flex; align-items: center; gap: 8px;
        }
        .admin-textarea {
          width: 100%;
          display: block;
          background: var(--glass-heavy);
          border: 1px solid var(--glass-border);
          border-radius: 16px;
          padding: 12px 16px;
          color: #1e293b;
          font-family: var(--font-main);
          font-size: 15px;
          outline: none;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          backdrop-filter: var(--blur);
        }

        .admin-textarea:focus {
          border-color: var(--white);
          background: rgba(255, 255, 255, 0.12);
          box-shadow: 0 0 20px rgba(255,255,255,0.05);
        }

        /* Fix for Chrome Autofill background */
        input:-webkit-autofill,
        input:-webkit-autofill:hover, 
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px #111 inset !important;
          -webkit-text-fill-color: white !important;
          transition: background-color 5000s ease-in-out 0s;
        }

        .glass-card {
          background: var(--glass-heavy);
          backdrop-filter: var(--blur);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-card);
          box-shadow: 0 10px 30px rgba(0,0,0,0.05);
          padding: 30px;
        }
        .card-label { font-size: 11px; font-weight: 800; color: #1e293b; letter-spacing: 0.1em; margin-bottom: 4px; }
        .card-desc { font-size: 13px; color: var(--muted); }
        .input-group label { color: #1e293b !important; font-weight: 700; }
        .toggle-btn {
          width: 50px; height: 28px; border-radius: 99px; background: var(--glass-heavy);
          border: 1px solid var(--glass-border); position: relative; cursor: pointer; transition: all 0.3s;
        }
        .toggle-btn.active { background: var(--accent-blue); border-color: var(--white); }
        .toggle-thumb {
          width: 20px; height: 20px; border-radius: 50%; background: var(--white);
          position: absolute; top: 3px; left: 3px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .toggle-btn.active .toggle-thumb { left: calc(100% - 23px); }

        .lightbox-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.9);
          backdrop-filter: blur(10px); z-index: 1000; display: flex;
          align-items: center; justify-content: center; padding: 24px;
        }
        .lightbox-content {
          width: 100%; max-width: 500px; position: relative;
        }

        .prompts-grid, .branding-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 30px;
          align-items: start;
        }

        .menu-toggle-btn {
          background: var(--glass);
          border: 1px solid var(--glass-border);
          color: #1e293b;
          width: 44px; height: 44px;
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        }

        .logout-btn {
          display: flex; align-items: center; gap: 10px;
          background: rgba(227, 30, 36, 0.1);
          border: 1px solid rgba(227, 30, 36, 0.2);
          color: #ff4d4d;
          padding: 10px 20px;
          border-radius: 12px;
          font-weight: 800;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.3s;
        }
        .logout-btn:hover { background: #E31E24; color: white; }

        .drawer-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7);
          backdrop-filter: blur(12px); z-index: 100;
        }
        .drawer-sidebar {
          position: fixed; top: 0; right: 0; bottom: 0; width: 320px;
          background: rgba(10, 10, 10, 0.8);
          border-left: 1px solid rgba(255,255,255,0.08);
          z-index: 101; display: flex; flex-direction: column;
          box-shadow: -40px 0 100px rgba(0,0,0,0.8);
          overflow: hidden;
        }
        .sidebar-blur-bg {
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 100%);
          pointer-events: none;
        }
        .sidebar-header {
          padding: 40px 24px;
          display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .logo-wrapper { background: rgba(255,255,255,0.03); padding: 12px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); }
        .logo-wrapper img { height: 24px; display: block; }
        .close-sidebar-btn {
          width: 40px; height: 40px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);
          background: transparent; color: white; display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.2s;
        }
        .close-sidebar-btn:hover { background: rgba(255,255,255,0.1); transform: scale(1.05); }

        .sidebar-nav { padding: 30px 16px; flex: 1; display: flex; flex-direction: column; gap: 32px; }
        .nav-group { display: flex; flex-direction: column; gap: 8px; }
        .nav-label { font-size: 10px; font-weight: 800; color: rgba(255,255,255,0.5); letter-spacing: 0.2em; padding-left: 12px; margin-bottom: 4px; }
        .nav-item {
          width: 100%; display: flex; align-items: center; gap: 14px;
          padding: 14px 12px; border-radius: 16px; border: 1px solid transparent;
          background: transparent; color: rgba(255,255,255,0.8); font-weight: 600; font-size: 14px;
          cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          text-align: left;
        }
        .nav-icon {
          width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.03);
          display: flex; align-items: center; justify-content: center; transition: all 0.3s;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .nav-item:hover { background: rgba(255,255,255,0.05); color: white; }
        .nav-item:hover .nav-icon { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); transform: translateX(-2px); }
        .nav-item.active { background: rgba(255,255,255,0.08); color: white; border-color: rgba(255,255,255,0.1); }
        .nav-item.active .nav-icon { background: white; color: #0f172a; border-color: white; }

        .sidebar-footer {
          padding: 24px; border-top: 1px solid rgba(255,255,255,0.05);
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(0,0,0,0.2);
        }
        .user-profile { display: flex; align-items: center; gap: 12px; }
        .user-avatar {
          width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #333, #111);
          border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center;
        }
        .user-info .user-name { font-size: 13px; font-weight: 700; color: white; margin: 0; }
        .user-info .user-role { font-size: 11px; color: rgba(255,255,255,0.6); margin: 0; }
        .sidebar-logout-btn {
          width: 40px; height: 40px; border-radius: 12px; background: rgba(227, 30, 36, 0.1);
          color: #ff4d4d; border: 1px solid rgba(227, 30, 36, 0.2);
          display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;
        }
        .sidebar-logout-btn:hover { background: #E31E24; color: white; transform: rotate(10deg); }

        /* --- MOBILE REFINEMENTS --- */
        @media (max-width: 900px) {
          .desktop-nav, .logout-btn span { display: none; }
          .prompts-grid, .branding-grid {
            grid-template-columns: 1fr;
          }
          .admin-header {
            padding: 12px 16px;
          }
          .admin-body {
            padding: 24px 12px;
          }
          .section-title {
            font-size: 20px;
            margin-bottom: 24px;
          }
          .admin-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
            padding: 16px;
          }
          .row-actions {
            width: 100%;
            justify-content: flex-end;
            border-top: 1px solid var(--glass-border);
            padding-top: 12px;
          }
          .glass-card {
            padding: 20px;
          }
        }

        @media (max-width: 600px) {
          .admin-body { padding: 15px 10px; }
          .glass-card { padding: 15px; border-radius: 20px; }
          .branding-grid { gap: 15px; }
          .input-group label { font-size: 10px; }
          .admin-textarea { font-size: 14px; padding: 10px; }
          .branding-logo-item { flex-direction: column; align-items: flex-start; }
          .logo-preview-box { width: 100%; height: 100px; }
        }

        @media (max-height: 700px) {
          .admin-body { padding-top: 20px; }
          .section-title { margin-bottom: 15px; }
        }
        
        .branding-logo-item {
          display: flex; gap: 15px; align-items: center; 
          padding: 15px; background: rgba(0,0,0,0.2); border-radius: 16px;
          border: 1px solid var(--glass-border);
        }
        .logo-preview-box {
          width: 60px; height: 60px; border-radius: 10px; background: rgba(255,255,255,0.03);
          display: flex; align-items: center; justify-content: center; padding: 5px;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .btn-icon {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          color: white; border-radius: 8px; width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.2s;
        }
        .btn-icon:hover { background: rgba(255,255,255,0.1); transform: translateY(-1px); }
      `}} />
    </div>
  );
}

// Components for Branding UI
function ColorInput({ label, value, onChange }) {
  return (
    <div className="input-group">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input 
          type="color" 
          value={value.startsWith('rgba') ? '#ffffff' : value} 
          onChange={(e) => onChange(e.target.value)} 
          style={{ width: 32, height: 32, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} 
        />
        <input 
          value={value} 
          onChange={(e) => onChange(e.target.value)} 
          className="admin-textarea" 
          style={{ flex: 1, padding: '4px 10px', height: 32, fontSize: 12 }} 
        />
      </div>
    </div>
  );
}

function LogoUpload({ label, url, onUpload, size, onSizeChange }) {
  return (
    <div className="branding-logo-item">
      <div className="logo-preview-box" style={{ background: "#1e293b", borderRadius: "12px", padding: "10px" }}>
        <img src={url} alt="Logo" style={{ maxHeight: '100%', maxWidth: '100%' }} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label className="card-label" style={{ fontSize: 9 }}>{label}</label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label className="admin-action-btn" style={{ padding: '6px 12px', fontSize: 10, flex: 1, cursor: 'pointer' }}>
            <ImageIcon size={12} /> SUBIR
            <input type="file" hidden onChange={onUpload} accept="image/*" />
          </label>
          <div className="input-group" style={{ width: 80 }}>
            <input 
              type="number" 
              value={size} 
              onChange={(e) => onSizeChange(e.target.value)} 
              className="admin-textarea" 
              style={{ height: 30, fontSize: 11, padding: '2px 8px' }} 
              placeholder="Size"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
