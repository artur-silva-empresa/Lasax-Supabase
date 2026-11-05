import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Check, CheckSquare, Square, Calendar, Tag, AlertTriangle, FileText, Layers } from 'lucide-react';
import { Order } from '../types';
import { formatDate } from '../utils/formatters';

export interface OrderChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  docNr: string;
  items: Order[];
  clientName?: string;
  sectorName?: string;
  
  // Pending changes
  currentReason?: string;
  newReason?: string;
  
  currentDate?: Date | null;
  newDate?: Date | null;

  initialObservation?: string;

  onConfirm: (result: {
    observation: string;
    targetOrderIds: string[];
    applyToAll: boolean;
  }) => void;
}

export const OrderChangeModal: React.FC<OrderChangeModalProps> = ({
  isOpen,
  onClose,
  docNr,
  items,
  clientName,
  sectorName = 'Geral',
  currentReason,
  newReason,
  currentDate,
  newDate,
  initialObservation = '',
  onConfirm
}) => {
  const [observation, setObservation] = useState(initialObservation);
  const [scope, setScope] = useState<'all' | 'custom'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // Initialize or reset state when opening modal
  useEffect(() => {
    if (isOpen) {
      setObservation(initialObservation || '');
      setScope('all');
      setSelectedIds(new Set(items.map(it => it.id)));
      setHasAttemptedSubmit(false);
    }
  }, [isOpen, initialObservation, items]);

  if (!isOpen) return null;

  const isObservationEmpty = !observation || observation.trim() === '';
  const isDateChanged = newDate !== undefined && (
    (!currentDate && !!newDate) ||
    (!!currentDate && !newDate) ||
    (!!currentDate && !!newDate && new Date(currentDate).getTime() !== new Date(newDate).getTime())
  );
  const isReasonChanged = newReason !== undefined && (newReason || '') !== (currentReason || '');
  const hasItemsSelected = scope === 'all' || selectedIds.size > 0;

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

  const handleSave = () => {
    setHasAttemptedSubmit(true);

    if (isObservationEmpty) {
      return;
    }

    if (scope === 'custom' && selectedIds.size === 0) {
      return;
    }

    const targetOrderIds = scope === 'all' 
      ? items.map(it => it.id) 
      : Array.from(selectedIds);

    onConfirm({
      observation: observation.trim(),
      targetOrderIds,
      applyToAll: scope === 'all'
    });
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 dark:text-white leading-tight">
                Validação de Alterações
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span className="font-bold text-blue-600 dark:text-blue-400">Doc. {docNr}</span>
                {clientName && (
                  <>
                    <span>•</span>
                    <span className="truncate max-w-[200px]">{clientName}</span>
                  </>
                )}
                {sectorName && (
                  <>
                    <span>•</span>
                    <span className="font-semibold">{sectorName}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 md:p-5 overflow-y-auto space-y-4 text-xs">
          
          {/* Card Resumo das Alterações */}
          <div className="bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-blue-800 dark:text-blue-300 font-black text-[11px] uppercase tracking-wide">
              <FileText size={14} />
              <span>Alterações Detetadas</span>
            </div>

            <div className="space-y-1.5 text-xs">
              {isReasonChanged && (
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
                      {newReason || 'Limpar classificação'}
                    </span>
                  </div>
                </div>
              )}

              {isDateChanged && (
                <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-blue-100 dark:border-blue-900/40">
                  <span className="font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Calendar size={13} className="text-blue-500" /> Data de Saída / Previsão:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="line-through text-slate-400 dark:text-slate-500 font-medium">
                      {currentDate ? formatDate(currentDate) : 'Sem data'}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900/40">
                      {newDate ? formatDate(newDate) : 'Sem data'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Campo de Observações OBRIGATÓRIO */}
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
                Registo obrigatório ao alterar Data de Saída ou Classificação
              </span>
            </div>

            <textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Descreva o motivo desta alteração (ex: atraso de matéria-prima, avaria de máquina, pedido de cliente)..."
              rows={3}
              autoFocus
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

          {/* Pergunta de Âmbito: Todos os itens vs Marcar itens */}
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
            onClick={handleSave}
            className="px-5 py-2 text-xs font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Check size={15} strokeWidth={2.5} />
            <span>Confirmar e Guardar</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderChangeModal;
