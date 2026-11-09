import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  AlertCircle, 
  Check, 
  CheckSquare, 
  Square, 
  Calendar, 
  Tag, 
  AlertTriangle, 
  FileText, 
  Layers, 
  RotateCcw, 
  Trash2, 
  ArrowRight, 
  Clock, 
  ChevronRight, 
  Info,
  Waves,
  Droplets,
  Scissors,
  Package,
  Truck
} from 'lucide-react';
import { Order, Sector } from '../types';
import { formatDate } from '../utils/formatters';
import { SECTORS, STOP_REASONS_HIERARCHY } from '../constants';

export interface OrderChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  docNr: string;
  items: Order[];
  clientName?: string;
  sectorName?: string;
  sectorId?: string;
  
  // Initial / current values
  currentReason?: string;
  newReason?: string;
  
  currentDate?: Date | null;
  newDate?: Date | null;

  initialObservation?: string;

  stopReasonsHierarchy?: { category: string; reasons: string[] }[];

  onConfirm: (result: {
    observation: string;
    targetOrderIds: string[];
    applyToAll: boolean;
    predictedDate?: Date | null;
    isDateModified?: boolean;
    classification?: string;
    isClassificationModified?: boolean;
    clearAll?: boolean;
  }) => void;
}

const toISODateString = (dateInput: Date | string | null | undefined): string => {
  if (!dateInput) return '';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
};

export const OrderChangeModal: React.FC<OrderChangeModalProps> = ({
  isOpen,
  onClose,
  docNr,
  items,
  clientName,
  sectorName = 'Geral',
  sectorId = 'planeamento',
  currentReason = '',
  newReason,
  currentDate,
  newDate,
  initialObservation = '',
  stopReasonsHierarchy = STOP_REASONS_HIERARCHY,
  onConfirm
}) => {
  // State for observation, scope and item selection
  const [observation, setObservation] = useState(initialObservation);
  const [scope, setScope] = useState<'all' | 'custom'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // Initial reference dates
  const initialBaseDate = newDate !== undefined ? newDate : (currentDate !== undefined ? currentDate : (items[0]?.requestedDate || null));
  const initialDateStr = useMemo(() => toISODateString(initialBaseDate), [initialBaseDate]);

  // Editable predicted date
  const [editableDateStr, setEditableDateStr] = useState<string>(initialDateStr);

  // Editable classification (reason)
  const initialReasonValue = newReason !== undefined ? newReason : (currentReason || '');
  const [editableReason, setEditableReason] = useState<string>(initialReasonValue);
  const [customReasonText, setCustomReasonText] = useState('');
  const [isEnteringCustomReason, setIsEnteringCustomReason] = useState(false);

  // State for Clear All tooltip confirmation
  const [showClearTooltip, setShowClearTooltip] = useState(false);
  const clearButtonRef = useRef<HTMLDivElement>(null);

  // State for Impact Confirmation Modal before applying
  const [showImpactConfirmModal, setShowImpactConfirmModal] = useState(false);

  // Initialize or reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setObservation(initialObservation || '');
      setScope('all');
      setSelectedIds(new Set(items.map(it => it.id)));
      setHasAttemptedSubmit(false);
      setEditableDateStr(initialDateStr);
      setEditableReason(initialReasonValue);
      setCustomReasonText('');
      setIsEnteringCustomReason(false);
      setShowClearTooltip(false);
      setShowImpactConfirmModal(false);
    }
  }, [isOpen, initialObservation, items, initialDateStr, initialReasonValue]);

  // Close clear tooltip if clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clearButtonRef.current && !clearButtonRef.current.contains(e.target as Node)) {
        setShowClearTooltip(false);
      }
    };
    if (showClearTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showClearTooltip]);

  if (!isOpen) return null;

  // Comparison & Change detection
  const isDateModifiedByUser = editableDateStr !== initialDateStr;
  const isReasonModifiedByUser = (editableReason || '') !== (currentReason || '');

  const isObservationEmpty = !observation || observation.trim() === '';
  const isAnyChangeMade = isDateModifiedByUser || isReasonModifiedByUser;

  // Calculation of date difference in days and impact on subsequent stages
  const originalDateObj = currentDate ? new Date(currentDate) : (items[0]?.requestedDate ? new Date(items[0].requestedDate) : (initialDateStr ? new Date(`${initialDateStr}T12:00:00`) : null));
  const newDateObj = editableDateStr ? new Date(`${editableDateStr}T12:00:00`) : null;

  const diffDays = useMemo(() => {
    if (!originalDateObj || !newDateObj || isNaN(originalDateObj.getTime()) || isNaN(newDateObj.getTime())) {
      return 0;
    }
    const diffTime = newDateObj.getTime() - originalDateObj.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  }, [originalDateObj, newDateObj]);

  // Subsequent stages in production flow
  const subsequentSectors = useMemo(() => {
    if (sectorId === 'planeamento' || !sectorId) {
      return SECTORS;
    }
    const currentIdx = SECTORS.findIndex(s => s.id === sectorId);
    if (currentIdx === -1) return SECTORS;
    return SECTORS.slice(currentIdx + 1);
  }, [sectorId]);

  // Check if this order already has any registered changes (for clearing)
  const hasRegisteredChanges = Boolean(
    (currentReason && currentReason.trim() !== '') ||
    (currentDate && !isNaN(new Date(currentDate).getTime())) ||
    (initialObservation && initialObservation.trim() !== '') ||
    items.some(it => 
      (it.sectorStopReasons && Object.keys(it.sectorStopReasons).length > 0) ||
      (it.sectorPredictedDates && Object.keys(it.sectorPredictedDates).length > 0) ||
      (it.sectorObservations && Object.keys(it.sectorObservations).length > 0)
    )
  );

  const handleSelectAll = () => {
    setSelectedIds(new Set(items.map(it => it.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const toggleItem = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const executeSave = () => {
    const targetOrderIds = scope === 'all' 
      ? items.map(it => it.id) 
      : Array.from(selectedIds);

    const parsedDate = editableDateStr ? new Date(`${editableDateStr}T12:00:00`) : null;

    onConfirm({
      observation: observation.trim(),
      targetOrderIds,
      applyToAll: scope === 'all',
      predictedDate: parsedDate,
      isDateModified: isDateModifiedByUser,
      classification: editableReason.trim(),
      isClassificationModified: isReasonModifiedByUser,
      clearAll: false
    });
  };

  const handleSaveClick = () => {
    setHasAttemptedSubmit(true);

    // Observação é estritamente obrigatória se classificação ou data foi alterada
    if (isObservationEmpty) {
      return;
    }

    if (scope === 'custom' && selectedIds.size === 0) {
      return;
    }

    // Se houver adiamento com impacto (diffDays > 0), abre o modal de confirmação do impacto
    if (diffDays > 0 && isDateModifiedByUser) {
      setShowImpactConfirmModal(true);
      return;
    }

    executeSave();
  };

  // Limpar todas as alterações registadas (após confirmação pelo tooltip)
  const handleConfirmClearAll = () => {
    setShowClearTooltip(false);
    const targetOrderIds = scope === 'all' 
      ? items.map(it => it.id) 
      : Array.from(selectedIds);

    onConfirm({
      observation: '',
      targetOrderIds,
      applyToAll: scope === 'all',
      predictedDate: null,
      isDateModified: true,
      classification: '',
      isClassificationModified: true,
      clearAll: true
    });
  };

  const handleClassificationSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setIsEnteringCustomReason(true);
      setEditableReason('');
    } else {
      setIsEnteringCustomReason(false);
      setEditableReason(val);
    }
  };

  const handleCustomReasonSubmit = () => {
    if (customReasonText.trim()) {
      setEditableReason(customReasonText.trim());
      setIsEnteringCustomReason(false);
      setCustomReasonText('');
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-800 dark:text-white leading-tight">
                  Validação de Alterações
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {sectorName}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span className="font-bold text-blue-600 dark:text-blue-400">Doc. {docNr}</span>
                {clientName && (
                  <>
                    <span>•</span>
                    <span className="truncate max-w-[240px] font-medium">{clientName}</span>
                  </>
                )}
                <span>•</span>
                <span className="text-slate-400">{items.length} {items.length === 1 ? 'linha' : 'linhas'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Botão para Limpar Todas as Alterações com Tooltip de Confirmação */}
            <div className="relative" ref={clearButtonRef}>
              <button
                type="button"
                onClick={() => setShowClearTooltip(!showClearTooltip)}
                className="px-2.5 py-1.5 rounded-xl text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-800 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                title="Limpar todas as alterações guardadas neste documento"
              >
                <Trash2 size={13} className="text-rose-500" />
                <span className="hidden sm:inline">Limpar Registos</span>
              </button>

              {/* Tooltip Popover de Confirmação */}
              {showClearTooltip && (
                <div className="absolute right-0 top-full mt-2 w-72 p-3.5 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-2xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-start gap-2.5 mb-2">
                    <div className="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 shrink-0">
                      <AlertCircle size={16} />
                    </div>
                    <div>
                      <h5 className="font-black text-slate-900 dark:text-white text-xs leading-tight">
                        Limpar todas as alterações?
                      </h5>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                        Esta ação irá remover a classificação, repor a data prevista original e apagar as observações deste documento.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowClearTooltip(false)}
                      className="px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmClearAll}
                      className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black rounded-lg shadow-sm transition-all"
                    >
                      Sim, Limpar Tudo
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 md:p-5 overflow-y-auto space-y-4 text-xs">
          
          {/* Card Resumo das Alterações Detetadas */}
          <div className="bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-blue-800 dark:text-blue-300 font-black text-[11px] uppercase tracking-wide">
              <FileText size={14} />
              <span>Alterações em Validação</span>
            </div>

            <div className="space-y-1.5 text-xs">
              {isReasonModifiedByUser && (
                <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-blue-100 dark:border-blue-900/40">
                  <span className="font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Tag size={13} className="text-blue-500" /> Classificação:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="line-through text-slate-400 dark:text-slate-500 font-medium">
                      {currentReason || 'Sem classificação'}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900/40">
                      {editableReason || 'Sem classificação (Limpar)'}
                    </span>
                  </div>
                </div>
              )}

              {isDateModifiedByUser && (
                <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-blue-100 dark:border-blue-900/40">
                  <span className="font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Calendar size={13} className="text-blue-500" /> Data Prevista:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="line-through text-slate-400 dark:text-slate-500 font-medium">
                      {originalDateObj ? formatDate(originalDateObj) : 'Sem data'}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900/40">
                      {newDateObj ? formatDate(newDateObj) : 'Sem data'}
                    </span>
                    {diffDays !== 0 && (
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                        diffDays > 0 ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400' : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {diffDays > 0 ? `+${diffDays}d atraso` : `${diffDays}d antecipação`}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {!isReasonModifiedByUser && !isDateModifiedByUser && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                  Altere a classificação e/ou a data prevista abaixo. O campo de observações será obrigatório.
                </p>
              )}
            </div>
          </div>

          {/* Grid de 2 Colunas: Edição de Classificação & Edição de Data Prevista */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            
            {/* 1. Campo de Edição da Classificação */}
            <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-black text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                    <Tag size={14} className="text-amber-500" />
                    <span>Classificação</span>
                  </label>

                  <div className="flex items-center gap-2">
                    {isReasonModifiedByUser && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditableReason(currentReason || '');
                          setIsEnteringCustomReason(false);
                        }}
                        className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-bold transition-colors cursor-pointer"
                        title="Repor classificação original"
                      >
                        <RotateCcw size={11} />
                        <span>Repor</span>
                      </button>
                    )}
                    {editableReason && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditableReason('');
                          setIsEnteringCustomReason(false);
                        }}
                        className="text-[10px] text-slate-400 hover:text-rose-500 font-bold transition-colors cursor-pointer"
                        title="Remover classificação"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                </div>

                {!isEnteringCustomReason ? (
                  <select
                    value={editableReason}
                    onChange={handleClassificationSelect}
                    className={`w-full p-2.5 bg-white dark:bg-slate-900 border rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 outline-none transition-all cursor-pointer ${
                      isReasonModifiedByUser 
                        ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20' 
                        : 'border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                    }`}
                  >
                    <option value="">(Sem classificação)</option>
                    {stopReasonsHierarchy.map((categoryGroup, cIdx) => (
                      <optgroup key={cIdx} label={categoryGroup.category}>
                        {categoryGroup.reasons.map((reason, rIdx) => (
                          <option key={rIdx} value={reason}>
                            {reason}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="__custom__">+ Outro motivo personalizado...</option>
                  </select>
                ) : (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={customReasonText}
                      onChange={(e) => setCustomReasonText(e.target.value)}
                      placeholder="Descreva o motivo de paragem..."
                      autoFocus
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-blue-500 rounded-xl text-xs font-medium outline-none"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsEnteringCustomReason(false)}
                        className="px-2 py-1 text-[10px] text-slate-400 font-bold"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleCustomReasonSubmit}
                        className="px-2.5 py-1 text-[10px] bg-blue-600 text-white font-bold rounded-lg shadow-sm"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-1">
                {editableReason ? (
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-900/50 block truncate">
                    {editableReason}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 italic block">
                    Nenhum motivo selecionado
                  </span>
                )}
              </div>
            </div>

            {/* 2. Campo de Edição da Data Prevista */}
            <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-black text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                    <Calendar size={14} className="text-blue-600 dark:text-blue-400" />
                    <span>Data Prevista</span>
                  </label>

                  <div className="flex items-center gap-2">
                    {isDateModifiedByUser && (
                      <button
                        type="button"
                        onClick={() => setEditableDateStr(initialDateStr)}
                        className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-bold transition-colors cursor-pointer"
                        title="Repor data inicial"
                      >
                        <RotateCcw size={11} />
                        <span>Repor</span>
                      </button>
                    )}
                    {editableDateStr && (
                      <button
                        type="button"
                        onClick={() => setEditableDateStr('')}
                        className="text-[10px] text-slate-400 hover:text-rose-500 font-bold transition-colors cursor-pointer"
                        title="Remover data prevista"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={editableDateStr}
                    onChange={(e) => setEditableDateStr(e.target.value)}
                    className={`w-full p-2.5 bg-white dark:bg-slate-900 border rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 outline-none transition-all cursor-pointer ${
                      isDateModifiedByUser
                        ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20'
                        : 'border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                    }`}
                  />
                </div>
              </div>

              <div className="pt-1 flex items-center justify-between text-[10px] text-slate-500">
                <span>Data base: <strong>{originalDateObj ? formatDate(originalDateObj) : '-'}</strong></span>
                {isDateModifiedByUser && (
                  <span className="font-black text-blue-600 dark:text-blue-400 uppercase">Alterada</span>
                )}
              </div>
            </div>

          </div>

          {/* 3. AVISO VISUAL DE IMPACTO NAS ETAPAS SUBSEQUENTES (Requirement 4) */}
          {diffDays !== 0 && isDateModifiedByUser && (
            <div className={`p-3.5 rounded-xl border animate-in fade-in duration-200 ${
              diffDays > 0 
                ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60' 
                : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60'
            }`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${
                    diffDays > 0 ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-600' : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600'
                  }`}>
                    <Clock size={16} />
                  </div>
                  <div>
                    <h5 className="font-black text-xs text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-1.5">
                      <span>Impacto no Fluxo Produtivo</span>
                      <span className={`px-2 py-0.2 rounded-full text-[10px] font-black ${
                        diffDays > 0 ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                      }`}>
                        {diffDays > 0 ? `+${diffDays} dias de atraso` : `${diffDays} dias de avanço`}
                      </span>
                    </h5>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                      {diffDays > 0 
                        ? `A alteração da data prevista provoca um adiamento de ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}, impactando as etapas seguintes:` 
                        : `A antecipação de ${Math.abs(diffDays)} dias agiliza as etapas subsequentes do processo produtivo:`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Lista visual das etapas subsequentes afetadas */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                {subsequentSectors.map((sec, idx) => {
                  const Icon = sec.icon || Layers;
                  return (
                    <div 
                      key={sec.id}
                      className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2 text-[10px]"
                    >
                      <div className={`p-1 rounded ${diffDays > 0 ? 'text-rose-500 bg-rose-50 dark:bg-rose-950/50' : 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/50'}`}>
                        <Icon size={12} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-slate-800 dark:text-slate-200 truncate">{sec.name}</p>
                        <p className={`font-bold ${diffDays > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {diffDays > 0 ? `+${diffDays}d impacto` : `${diffDays}d prazo`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {diffDays > 0 && (
                <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-2 flex items-center gap-1">
                  <AlertTriangle size={11} />
                  <span>Atenção: Será solicitada confirmação de impacto antes de gravar as alterações.</span>
                </p>
              )}
            </div>
          )}

          {/* 4. Campo de Observações OBRIGATÓRIO */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-black text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                <span>Observações</span>
                <span className="text-rose-500 font-bold">*</span>
                <span className="text-[10px] uppercase font-black px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
                  Obrigatório
                </span>
              </label>
              <span className="text-[10px] text-slate-400 italic">
                Registo obrigatório ao alterar Data ou Classificação
              </span>
            </div>

            <textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Descreva o motivo desta alteração (ex: atraso de matéria-prima, paragem de tecelagem, solicitação do cliente)..."
              rows={3}
              className={`w-full p-3 rounded-xl border text-xs outline-none transition-all resize-none dark:bg-slate-800 dark:text-white ${
                hasAttemptedSubmit && isObservationEmpty
                  ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/20 dark:bg-rose-950/20'
                  : 'border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white'
              }`}
            />

            {hasAttemptedSubmit && isObservationEmpty && (
              <p className="mt-1 text-rose-600 dark:text-rose-400 text-[11px] font-bold flex items-center gap-1 animate-in fade-in">
                <AlertCircle size={12} />
                <span>O preenchimento do campo de Observações é obrigatório para validar estas alterações.</span>
              </p>
            )}
          </div>

          {/* 5. Pergunta de Âmbito: Todos os itens vs Marcar itens */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <h4 className="font-black text-slate-800 dark:text-slate-200 text-xs">
              Deseja guardar estas alterações em todos os itens do documento ou marcar quais os itens a atualizar?
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Opção 1: Todos os itens */}
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                  scope === 'all'
                    ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-500/20 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs text-slate-800 dark:text-white flex items-center gap-1.5">
                    <Layers size={14} className={scope === 'all' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'} />
                    Todos os itens
                  </span>
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                    scope === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>
                    {items.length} {items.length === 1 ? 'item' : 'itens'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Guardar as alterações em todas as linhas e referências do documento.
                </p>
              </button>

              {/* Opção 2: Marcar quais itens */}
              <button
                type="button"
                onClick={() => setScope('custom')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                  scope === 'custom'
                    ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-500/20 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs text-slate-800 dark:text-white flex items-center gap-1.5">
                    <CheckSquare size={14} className={scope === 'custom' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'} />
                    Marcar itens
                  </span>
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                    scope === 'custom' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>
                    {selectedIds.size} de {items.length}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Escolher manualmente quais as linhas específicas que devem ser atualizadas.
                </p>
              </button>
            </div>

            {/* Lista com Checklist quando 'custom' está ativo */}
            {scope === 'custom' && (
              <div className="mt-2.5 p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Selecione os itens a atualizar ({selectedIds.size}/{items.length}):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline"
                    >
                      Selecionar todos
                    </button>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="text-[10px] text-slate-500 dark:text-slate-400 font-bold hover:underline"
                    >
                      Desmarcar todos
                    </button>
                  </div>
                </div>

                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {items.map((it, idx) => {
                    const isChecked = selectedIds.has(it.id);
                    return (
                      <div
                        key={it.id}
                        onClick={() => toggleItem(it.id)}
                        className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-white dark:bg-slate-900 border-blue-400 dark:border-blue-700 shadow-2xs'
                            : 'bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <div className={`p-0.5 rounded ${isChecked ? 'text-blue-600' : 'text-slate-400'}`}>
                            {isChecked ? <CheckSquare size={15} /> : <Square size={15} />}
                          </div>
                          <span className="text-[10px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 py-0.2 rounded shrink-0">
                            #{it.itemNr || idx + 1}
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                            {it.reference || 'Sem Ref.'}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400 truncate text-[11px]">
                            {it.colorDesc || ''}
                          </span>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">
                            {it.qtyRequested.toLocaleString('pt-PT')} UN
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {hasAttemptedSubmit && selectedIds.size === 0 && (
                  <p className="mt-2 text-rose-600 dark:text-rose-400 text-[11px] font-bold flex items-center gap-1">
                    <AlertCircle size={12} />
                    <span>Selecione pelo menos um item para aplicar a alteração.</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 md:p-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSaveClick}
            className="px-5 py-2 text-xs font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Check size={15} strokeWidth={2.5} />
            <span>Confirmar e Guardar</span>
          </button>
        </div>

        {/* 6. MODAL DE CONFIRMAÇÃO DO IMPACTO NO PROCESSO PRODUTIVO (Requirement 4) */}
        {showImpactConfirmModal && (
          <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-900 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 shrink-0">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                    Confirmar Impacto no Processo Produtivo?
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    A alteração da data prevista representa um adiamento de <strong>+{diffDays} dias</strong>.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                <p className="font-bold text-slate-700 dark:text-slate-300">
                  Etapas subsequentes que serão reprogramadas:
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {subsequentSectors.map(s => (
                    <span 
                      key={s.id} 
                      className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 text-[10px] font-bold"
                    >
                      {s.name} (+{diffDays}d)
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-1">
                  Aplicação: <strong>{scope === 'all' ? `Todos os itens (${items.length})` : `${selectedIds.size} itens selecionados`}</strong>
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImpactConfirmModal(false)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Voltar e Rever
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowImpactConfirmModal(false);
                    executeSave();
                  }}
                  className="px-4 py-2 text-xs font-black uppercase text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md shadow-rose-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Check size={14} strokeWidth={2.5} />
                  <span>Sim, Confirmar e Aplicar</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default OrderChangeModal;
