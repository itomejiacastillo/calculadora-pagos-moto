import { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'moto_pagos_presupuestos_v1';
const ACTIVE_ID_KEY = 'moto_pagos_active_id_v1';

// Porcentajes de comisión por conversión de intrafinanciamiento según el plazo
const COMMISSION_RATES = {
  12: 0.13, // 13% para 12 meses
  18: 0.18, // 18% para 18 meses
  24: 0.24, // 24% para 24 meses
};

const TERM_OPTIONS = [12, 18, 24];

function formatHNL(amount) {
  const num = Number(amount) || 0;
  return (
    'L ' +
    num.toLocaleString('es-HN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

// Comprime y recorta la imagen en cuadrado 1:1 para evitar exceder el límite de LocalStorage
function processImageToSquareDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const targetSize = 720;
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');

        // Recorte cuadrado centrado (1:1)
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetSize, targetSize);
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);

        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('No se pudo procesar la imagen'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function calculatePlan(price, downPayment, months) {
  const safePrice = Math.max(0, Number(price) || 0);
  const safeDownPayment = Math.max(0, Number(downPayment) || 0);
  const safeMonths = COMMISSION_RATES[months] ? Number(months) : 12;
  const rate = COMMISSION_RATES[safeMonths];

  const financedAmount = Math.max(0, safePrice - safeDownPayment);
  const monthlyPayment = safeMonths > 0 ? financedAmount / safeMonths : 0;
  const commission = financedAmount * rate;
  const firstPayment = commission + monthlyPayment;

  return {
    price: safePrice,
    downPayment: safeDownPayment,
    months: safeMonths,
    rate,
    financedAmount,
    monthlyPayment,
    commission,
    firstPayment,
  };
}

export default function App() {
  const [budgets, setBudgets] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Fallback empty array
    }
    return [];
  });

  const [activeBudgetId, setActiveBudgetId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_ID_KEY) || '';
    } catch {
      return '';
    }
  });

  // Si no hay presupuestos guardados, mostrar el formulario de creación
  const [isCreating, setIsCreating] = useState(() => budgets.length === 0);

  // Estado del formulario de creación de nuevo presupuesto
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newPhoto, setNewPhoto] = useState('');
  const [createError, setCreateError] = useState('');

  // Estado editable del presupuesto activo (se aplica al presionar "Actualizar")
  const [draftName, setDraftName] = useState('');
  const [draftPhoto, setDraftPhoto] = useState('');
  const [draftPrice, setDraftPrice] = useState('');
  const [draftPrima, setDraftPrima] = useState('');
  const [draftMonths, setDraftMonths] = useState(12);
  const [statusMessage, setStatusMessage] = useState('');

  // Estado para instalación PWA
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  const editFileInputRef = useRef(null);
  const createFileInputRef = useRef(null);

  // Sincronizar lista de presupuestos en localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(budgets));
    } catch {
      // Storage quota check
    }
  }, [budgets]);

  // Sincronizar presupuesto activo en localStorage
  useEffect(() => {
    try {
      if (activeBudgetId) {
        localStorage.setItem(ACTIVE_ID_KEY, activeBudgetId);
      } else {
        localStorage.removeItem(ACTIVE_ID_KEY);
      }
    } catch {
      // Ignore storage error
    }
  }, [activeBudgetId]);

  // Capturar evento beforeinstallprompt para PWA instalable
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const activeBudget =
    budgets.find((b) => b.id === activeBudgetId) || budgets[0] || null;

  // Cargar datos guardados en los campos borradores cuando cambia el presupuesto seleccionado
  useEffect(() => {
    if (activeBudget) {
      if (activeBudget.id !== activeBudgetId) {
        setActiveBudgetId(activeBudget.id);
      }
      setDraftName(activeBudget.name);
      setDraftPhoto(activeBudget.photo || '');
      setDraftPrice(String(activeBudget.price));
      setDraftPrima(String(activeBudget.downPayment ?? 0));
      setDraftMonths(Number(activeBudget.months) || 12);
      setStatusMessage('');
    }
  }, [activeBudget?.id]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  // Subida de foto en creación
  const handleCreatePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const squareDataUrl = await processImageToSquareDataUrl(file);
      setNewPhoto(squareDataUrl);
    } catch {
      setCreateError('No se pudo cargar la imagen seleccionada.');
    }
  };

  // Subida de foto en pantalla de formulario
  const handleDraftPhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const squareDataUrl = await processImageToSquareDataUrl(file);
      setDraftPhoto(squareDataUrl);
    } catch {
      // Ignore invalid image
    }
  };

  // Crear nuevo presupuesto
  const handleCreateBudget = (e) => {
    e.preventDefault();
    setCreateError('');

    const trimmedName = newName.trim();
    const numericPrice = parseFloat(newPrice);

    if (!trimmedName) {
      setCreateError('Por favor ingresa el nombre de la moto o presupuesto.');
      return;
    }

    if (Number.isNaN(numericPrice) || numericPrice <= 0) {
      setCreateError('Por favor ingresa un precio válido en Lempiras.');
      return;
    }

    const id = 'moto_' + Date.now();
    const created = {
      id,
      name: trimmedName,
      photo: newPhoto || '',
      price: numericPrice,
      downPayment: 0,
      months: 12,
      updatedAt: new Date().toISOString(),
    };

    const nextBudgets = [created, ...budgets];
    setBudgets(nextBudgets);
    setActiveBudgetId(id);
    setNewName('');
    setNewPrice('');
    setNewPhoto('');
    setIsCreating(false);
  };

  // Botón Actualizar: recalcula y guarda todos los cambios en LocalStorage
  const handleUpdateBudget = (e) => {
    if (e) e.preventDefault();
    if (!activeBudget) return;

    const cleanName = draftName.trim() || activeBudget.name;
    const cleanPrice = Math.max(0, parseFloat(draftPrice) || 0);
    const cleanPrima = Math.max(0, parseFloat(draftPrima) || 0);
    const cleanMonths = COMMISSION_RATES[draftMonths] ? Number(draftMonths) : 12;

    const updatedBudget = {
      ...activeBudget,
      name: cleanName,
      photo: draftPhoto,
      price: cleanPrice,
      downPayment: cleanPrima,
      months: cleanMonths,
      updatedAt: new Date().toISOString(),
    };

    const nextBudgets = budgets.map((item) =>
      item.id === activeBudget.id ? updatedBudget : item
    );

    setBudgets(nextBudgets);
    setDraftName(cleanName);
    setDraftPrice(String(cleanPrice));
    setDraftPrima(String(cleanPrima));
    setDraftMonths(cleanMonths);
    setStatusMessage('Campos y cálculos actualizados en LocalStorage.');

    setTimeout(() => {
      setStatusMessage('');
    }, 3000);
  };

  const handleDeleteCurrentBudget = () => {
    if (!activeBudget) return;
    const remaining = budgets.filter((b) => b.id !== activeBudget.id);
    setBudgets(remaining);
    if (remaining.length > 0) {
      setActiveBudgetId(remaining[0].id);
    } else {
      setActiveBudgetId('');
      setIsCreating(true);
    }
  };

  // Cálculos oficiales guardados en el presupuesto activo (se actualizan al pulsar "Actualizar")
  const savedCalc = activeBudget
    ? calculatePlan(
        activeBudget.price,
        activeBudget.downPayment,
        activeBudget.months
      )
    : calculatePlan(0, 0, 12);

  // Detectar si el usuario modificó algún campo y aún no ha pulsado "Actualizar"
  const hasUnappliedChanges =
    activeBudget &&
    (draftName.trim() !== activeBudget.name ||
      draftPhoto !== (activeBudget.photo || '') ||
      (parseFloat(draftPrice) || 0) !== Number(activeBudget.price) ||
      (parseFloat(draftPrima) || 0) !== Number(activeBudget.downPayment) ||
      Number(draftMonths) !== Number(activeBudget.months));

  return (
    <div className="app-shell">
      <header className="top-bar">
        <span className="top-bar-title">Calculadora de Pagos de Moto</span>
        <span className="top-bar-subtitle">
          Intrafinanciamiento en Lempiras (HNL)
        </span>
      </header>

      {deferredPrompt && (
        <div className="install-banner">
          <span className="install-banner-text">
            Instala esta calculadora en tu teléfono para usarla sin conexión.
          </span>
          <button
            type="button"
            id="install-pwa-btn"
            className="btn-block btn-primary btn-sm"
            onClick={handleInstallClick}
          >
            Instalar aplicación (PWA)
          </button>
        </div>
      )}

      <main className="main-content block-stack">
        {/* Bloque de selección de presupuesto o creación de uno nuevo */}
        {budgets.length > 0 && !isCreating && (
          <section className="selector-block block-stack">
            <div>
              <label htmlFor="budget-selector" className="block-label">
                Mis presupuestos guardados ({budgets.length})
              </label>
              <select
                id="budget-selector"
                className="block-select"
                value={activeBudget?.id || ''}
                onChange={(e) => setActiveBudgetId(e.target.value)}
              >
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {formatHNL(b.price)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              id="new-budget-trigger-btn"
              className="btn-block btn-secondary btn-sm"
              onClick={() => {
                setCreateError('');
                setIsCreating(true);
              }}
            >
              + Crear nuevo cálculo o presupuesto
            </button>
          </section>
        )}

        {/* Pantalla para crear un nuevo cálculo o presupuesto */}
        {isCreating ? (
          <form
            id="create-budget-form"
            className="card-surface block-stack"
            onSubmit={handleCreateBudget}
          >
            <div>
              <h1 className="budget-title-heading">
                Nuevo presupuesto de moto
              </h1>
              <span className="block-helper">
                Ingresa los datos iniciales. Todo se guardará en tu dispositivo.
              </span>
            </div>

            {createError && <div className="error-banner">{createError}</div>}

            <div>
              <label htmlFor="create-moto-name" className="block-label">
                Nombre de la moto o presupuesto *
              </label>
              <input
                id="create-moto-name"
                type="text"
                className="block-input"
                placeholder="Ej. Honda XR 190L / Yamaha FZ"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="create-moto-price" className="block-label">
                Precio de la moto (L) *
              </label>
              <input
                id="create-moto-price"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                className="block-input"
                placeholder="Ej. 68500"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                required
              />
            </div>

            <div>
              <span className="block-label">Foto de la moto (Opcional)</span>
              <div className="photo-block">
                <div className="photo-frame-1x1">
                  <img
                    src={newPhoto || './default-moto.svg'}
                    alt="Vista previa cuadrada 1:1 de la moto"
                  />
                </div>
                <div className="photo-action-wrapper block-stack">
                  <input
                    ref={createFileInputRef}
                    id="create-moto-photo"
                    type="file"
                    accept="image/*"
                    className="file-input-hidden"
                    onChange={handleCreatePhotoUpload}
                  />
                  <button
                    type="button"
                    id="select-create-photo-btn"
                    className="btn-block btn-secondary btn-sm"
                    onClick={() => createFileInputRef.current?.click()}
                  >
                    {newPhoto ? 'Cambiar foto seleccionada' : 'Seleccionar foto (1:1)'}
                  </button>
                  {newPhoto && (
                    <button
                      type="button"
                      id="remove-create-photo-btn"
                      className="btn-block btn-danger btn-sm"
                      onClick={() => setNewPhoto('')}
                    >
                      Quitar foto
                    </button>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              id="save-new-budget-btn"
              className="btn-block btn-primary"
            >
              Crear presupuesto
            </button>

            {budgets.length > 0 && (
              <button
                type="button"
                id="cancel-create-btn"
                className="btn-block btn-secondary"
                onClick={() => setIsCreating(false)}
              >
                Cancelar y volver
              </button>
            )}
          </form>
        ) : (
          /* Pantalla estilo formulario en bloques apilados uno sobre otro */
          activeBudget && (
            <form
              id="calculator-block-form"
              className="block-stack"
              onSubmit={handleUpdateBudget}
            >
              {/* 1. Título: nombre de la moto o presupuesto */}
              <div className="field-block block-stack">
                <div>
                  <span className="block-label">Título del presupuesto</span>
                  <h1 className="budget-title-heading">{activeBudget.name}</h1>
                </div>
                <div>
                  <label htmlFor="edit-budget-name" className="block-label">
                    Editar nombre de la moto
                  </label>
                  <input
                    id="edit-budget-name"
                    type="text"
                    className="block-input"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                  />
                </div>
              </div>

              {/* 2. Foto ocupando el ancho máximo disponible, aspect ratio 1:1 */}
              <div className="photo-block">
                <div className="photo-frame-1x1">
                  <img
                    src={draftPhoto || './default-moto.svg'}
                    alt={activeBudget.name}
                  />
                </div>
                <div className="photo-action-wrapper block-stack">
                  <input
                    ref={editFileInputRef}
                    id="edit-moto-photo"
                    type="file"
                    accept="image/*"
                    className="file-input-hidden"
                    onChange={handleDraftPhotoUpload}
                  />
                  <button
                    type="button"
                    id="change-photo-btn"
                    className="btn-block btn-secondary btn-sm"
                    onClick={() => editFileInputRef.current?.click()}
                  >
                    {draftPhoto ? 'Cambiar foto de la moto' : 'Subir foto de la moto (1:1)'}
                  </button>
                </div>
              </div>

              {/* 3. Precio */}
              <div className="field-block">
                <label htmlFor="input-precio" className="block-label">
                  Precio (Lempiras)
                </label>
                <input
                  id="input-precio"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="block-input"
                  value={draftPrice}
                  onChange={(e) => setDraftPrice(e.target.value)}
                />
                <span className="block-helper">
                  Precio actual aplicado: {formatHNL(savedCalc.price)}
                </span>
              </div>

              {/* 4. Prima */}
              <div className="field-block">
                <label htmlFor="input-prima" className="block-label">
                  Prima (Lempiras)
                </label>
                <input
                  id="input-prima"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="block-input"
                  placeholder="0.00"
                  value={draftPrima}
                  onChange={(e) => setDraftPrima(e.target.value)}
                />
                <span className="block-helper">
                  Prima actual aplicada: {formatHNL(savedCalc.downPayment)}
                </span>
              </div>

              {/* 5. Monto a financiar (Precio - Prima) */}
              <div className="field-block field-block-computed">
                <span className="block-label">
                  Monto a financiar (Precio − Prima)
                </span>
                <span id="output-monto-financiar" className="currency-value">
                  {formatHNL(savedCalc.financedAmount)}
                </span>
                <span className="block-helper">
                  {formatHNL(savedCalc.price)} − {formatHNL(savedCalc.downPayment)}
                </span>
              </div>

              {/* 6. Botones de meses (Selección única: 12, 18, 24 meses) */}
              <div className="field-block">
                <span className="block-label">
                  Plazo en meses (Selecciona 1 opción)
                </span>
                <div className="months-stack">
                  {TERM_OPTIONS.map((term) => {
                    const isSelected = Number(draftMonths) === term;
                    const ratePercent = Math.round(COMMISSION_RATES[term] * 100);
                    return (
                      <button
                        key={term}
                        type="button"
                        id={`btn-meses-${term}`}
                        className={`month-option-btn ${isSelected ? 'selected' : ''}`}
                        aria-pressed={isSelected}
                        onClick={() => setDraftMonths(term)}
                      >
                        <span>{term} meses</span>
                        <span className="month-option-subtext">
                          Comisión por conversión: {ratePercent}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 7. Cuota mensual (Monto a financiar / Plazo) */}
              <div className="field-block field-block-computed">
                <span className="block-label">
                  Cuota mensual ({savedCalc.months} meses)
                </span>
                <span id="output-cuota-mensual" className="currency-value">
                  {formatHNL(savedCalc.monthlyPayment)}
                </span>
                <span className="block-helper">
                  Monto a financiar ({formatHNL(savedCalc.financedAmount)}) ÷{' '}
                  {savedCalc.months} meses
                </span>
              </div>

              {/* 8. Comisión (Monto a financiar * porcentaje según plazo) */}
              <div className="field-block field-block-computed">
                <span className="block-label">
                  Comisión de intrafinanciamiento (
                  {Math.round(savedCalc.rate * 100)}%)
                </span>
                <span id="output-comision" className="currency-value">
                  {formatHNL(savedCalc.commission)}
                </span>
                <span className="block-helper">
                  {formatHNL(savedCalc.financedAmount)} ×{' '}
                  {Math.round(savedCalc.rate * 100)}% (Plazo de{' '}
                  {savedCalc.months} meses)
                </span>
              </div>

              {/* 9. Primera cuota (Comisión + Valor de una cuota) */}
              <div className="field-block field-block-featured">
                <span className="block-label">
                  Primera cuota (Comisión + 1 cuota mensual)
                </span>
                <span
                  id="output-primera-cuota"
                  className="currency-value-featured"
                >
                  {formatHNL(savedCalc.firstPayment)}
                </span>
                <span className="block-helper">
                  {formatHNL(savedCalc.commission)} (comisión) +{' '}
                  {formatHNL(savedCalc.monthlyPayment)} (cuota)
                </span>
              </div>

              {/* 10. Botón Actualizar */}
              <div className="field-block">
                {hasUnappliedChanges && (
                  <span className="pending-notice">
                    Tienes cambios realizados. Presiona &ldquo;Actualizar&rdquo;
                    para recalcular los campos y guardar.
                  </span>
                )}
                {statusMessage && (
                  <div className="status-banner" style={{ marginBottom: '10px' }}>
                    {statusMessage}
                  </div>
                )}
                <button
                  type="submit"
                  id="btn-actualizar"
                  className="btn-block btn-primary"
                >
                  Actualizar
                </button>
              </div>

              {/* Opción para eliminar el presupuesto actual */}
              <div className="field-block">
                <button
                  type="button"
                  id="btn-eliminar-presupuesto"
                  className="btn-block btn-danger btn-sm"
                  onClick={handleDeleteCurrentBudget}
                >
                  Eliminar este presupuesto
                </button>
              </div>
            </form>
          )
        )}
      </main>
    </div>
  );
}
