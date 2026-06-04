import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function FormScreen({ onComplete, branding }) {
  const logoUrl = branding?.logoUrl || "/logo-tono-martin-del-campo.png";
  const [formData, setFormData] = useState({ name: '', phone: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Función síncrona para el teclado (Crítica para mantener el Gesto de Usuario)
  function handleInputClick(e) {
    const el = e.target;
    // Forzar foco directo
    el.focus();
    // Se elimina el.select() para permitir que el usuario coloque el cursor en una posición específica
    // Truco: pequeño scroll manual por si el teclado tapa
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function submit(e) {
    if (e) e.preventDefault();
    
    // Validación de Nombre: mínimo 3 palabras
    const nameWords = formData.name.trim().split(/\s+/).filter(word => word.length > 0);
    if (nameWords.length < 3) {
      setError('Por favor, ingresa tu nombre completo (mínimo 3 palabras)');
      return;
    }

    // Validación de Teléfono: mínimo 10 dígitos
    if (formData.phone.length < 10) {
      setError('El teléfono debe tener 10 dígitos');
      return;
    }

    // Validación de Email: si existe, debe tener formato válido
    if (formData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        setError('Por favor, ingresa un correo electrónico válido');
        return;
      }
    }

    setError('');
    setLoading(true);

    try {
      const apiUrl = import.meta.env.DEV ? '/api/leads.json' : './admin.php?action=save_lead';
      if (!import.meta.env.DEV) {
      const response = await fetch('./admin.php?action=save_lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      }
      onComplete(formData);
    } catch(err) {
      setError('Error al enviar los datos. Inténtalo de nuevo.');
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="kiosk-shell"
    >
      {/* Mesh Background */}
      <div className="mesh-bg">
        <div className="mesh-circle c1" />
        <div className="mesh-circle c2" />
        <div className="mesh-circle c3" />
      </div>

      <div className="form-container">
        <img src={logoUrl} alt="Logo" className="z-logo form-logo-responsive" style={{ marginBottom: 40 }} />
        
        <form onSubmit={submit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="input-group">
            <label>Nombre Completo *</label>
            <input
              id="main-name-input"
              type="text"
              required
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="next"
              inputMode="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              onClick={handleInputClick}
              placeholder="Escribe tu nombre"
            />
          </div>

          <div className="input-group">
            <label>Teléfono Celular *</label>
            <input
              id="phone-input"
              type="tel"
              required
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="next"
              inputMode="numeric"
              pattern="[0-9]*"
              value={formData.phone}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '');
                setFormData({ ...formData, phone: val });
              }}
              maxLength={15}
              onClick={handleInputClick}
              placeholder="10 dígitos"
            />
          </div>

          <div className="input-group">
            <label>Correo Electrónico</label>
            <input
              id="email-input"
              type="email"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
              inputMode="email"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              onClick={handleInputClick}
              placeholder="tu@correo.com"
            />
          </div>
          
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="error-badge"
            >
              {error}
            </motion.div>
          )}

          <button type="submit" className="btn-main" style={{ marginTop: 20 }}>
            {loading ? 'PROCESANDO...' : 'SIGUIENTE PASO'}
          </button>
        </form>
      </div>
    </motion.div>
  );
}
