import React from 'react';
import {
  Plus, Trash2, Edit2, Save, X, Search, ChevronDown, Info, Zap
} from 'lucide-react';
import { ProductionCapacity } from '../types';
import { SECTORS } from '../constants';

interface ProductionCapacityPageProps {
  capacities: ProductionCapacity[];
  onSave: (capacities: ProductionCapacity[]) => void;
}

const DEFAULT_HOURS = 24; // 3 turnos × 8h

const EMPTY_FORM: Omit<ProductionCapacity, 'id'> = {
  sectorId: SECTORS[0].id,
  label: '',
  articleCode: '',
  family: '',
  reference: '',
  colorCode: '',
  size: '',
  piecesPerHour: 0,
  hoursPerDay: DEFAULT_HOURS,
};

const generateLabel = (form: Omit<ProductionCapacity, 'id'>): string => {
  const parts: string[] = [];
  if (form.articleCode) parts.push(form.articleCode);
  if (form.reference) parts.push(form.reference);
  if (form.family) parts.push(form.family);
  if (form.colorCode) parts.push(form.colorCode);
  if (form.size) parts.push(form.size);
  if (parts.length === 0) {
    const sector = SECTORS.find(s => s.id === form.sectorId);
    return `Padrão ${sector?.name || ''}`;
  }
  return parts.join(' / ');
};

const ProductionCapacityPage: React.FC<ProductionCapacityPageProps> = ({ capacities, onSave }) => {
  const [items, setItems] = React.useState<ProductionCapacity[]>(capacities);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState<Omit<ProductionCapacity, 'id'>>(EMPTY_FORM);
  const [filterSector, setFilterSector] = React.useState<string>('all');
  const [search, setSearch] = React.useState('');
  const [hasChanges, setHasChanges] = React.useState(false);

  React.useEffect(() => { setItems(capacities); }, [capacities]);

  const filtered = React.useMemo(() => {
    return items.filter(c => {
      if (filterSector !== 'all' && c.sectorId !== filterSector) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          c.label.toLowerCase().includes(s) ||
          c.articleCode.toLowerCase().includes(s) ||
          c.reference.toLowerCase().includes(s) ||
          c.family.toLowerCase().includes(s) ||
          c.colorCode.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [items, filterSector, search]);

  const handleAdd = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, sectorId: filterSector !== 'all' ? filterSector : SECTORS[0].id });
    setShowForm(true);
  };

  const handleEdit = (cap: ProductionCapacity) => {
    setEditingId(cap.id);
    setForm({ ...cap });
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Eliminar esta regra de capacidade?')) return;
    const updated = items.filter(c => c.id !== id);
    setItems(updated);
    setHasChanges(true);
  };

  const handleSaveForm = () => {
    if (!form.piecesPerHour || form.piecesPerHour <= 0) {
      alert('Peças/Hora deve ser maior que zero.');
      return;
    }
    const label = form.label.trim() || generateLabel(form);
    let updated: ProductionCapacity[];
    if (editingId) {
      updated = items.map(c => c.id === editingId ? { ...form, label, id: editingId } : c);
    } else {
      const newId = `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      updated = [...items, { ...form, label, id: newId }];
    }
    setItems(updated);
    setShowForm(false);
    setEditingId(null);
    setHasChanges(true);
  };

  const handleSaveAll = () => {
    onSave(items);
    setHasChanges(false);
  };

  const sectorOf = (id: string) => SECTORS.find(s => s.id === id);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Zap size={22} className="text-blue-500" />
              Capacidades de Produção
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Define a capacidade produtiva (peças/hora) por artigo e secção.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleSaveAll}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-emerald-900/20"
              >
                <Save size={16} />
                Guardar Alterações
              </button>
            )}
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition-colors"
            >
              <Plus size={16} />
              Nova Regra
            </button>
          </div>
        </div>

        {/* Info box */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex gap-3">
          <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-300">
            <strong>Como funciona:</strong> Cada regra define a capacidade de produção para um artigo específico numa secção.
            Quando múltiplas regras podem aplicar-se, a mais específica (mais campos preenchidos) tem prioridade.
            Uma regra sem filtros de artigo serve de <strong>padrão geral</strong> para a secção.
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar por artigo, referência, família..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="relative">
            <select
              value={filterSector}
              onChange={e => setFilterSector(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos os Sectores</option>
              {SECTORS.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h3 className="font-black text-slate-800 dark:text-white">
                  {editingId ? 'Editar Regra de Capacidade' : 'Nova Regra de Capacidade'}
                </h3>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400">
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
                {/* Sector */}
                <div>
                  <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">Secção *</label>
                  <select
                    value={form.sectorId}
                    onChange={e => setForm(f => ({ ...f, sectorId: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {SECTORS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Filtros de Artigo (opcional)</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Deixa em branco para aplicar como padrão geral da secção.</p>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'articleCode', label: 'Código de Artigo', placeholder: 'ex: ART-001' },
                      { key: 'family', label: 'Família', placeholder: 'ex: BANHO' },
                      { key: 'reference', label: 'Referência', placeholder: 'ex: REF-123' },
                      { key: 'colorCode', label: 'Código de Cor', placeholder: 'ex: 001' },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">{label}</label>
                        <input
                          type="text"
                          placeholder={placeholder}
                          value={(form as any)[key]}
                          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Tamanho</label>
                    <input
                      type="text"
                      placeholder="ex: M, L, 100x150"
                      value={form.size}
                      onChange={e => setForm(f => ({ ...f, size: e.target.value }))}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">Peças / Hora *</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="ex: 120"
                      value={form.piecesPerHour || ''}
                      onChange={e => setForm(f => ({ ...f, piecesPerHour: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">Horas / Dia</label>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      step="1"
                      value={form.hoursPerDay || DEFAULT_HOURS}
                      onChange={e => setForm(f => ({ ...f, hoursPerDay: parseInt(e.target.value) || DEFAULT_HOURS }))}
                      className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Padrão: 24h (3 turnos)</p>
                  </div>
                </div>

                {form.piecesPerHour > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300">
                    <strong>Capacidade diária:</strong> {(form.piecesPerHour * (form.hoursPerDay || DEFAULT_HOURS)).toLocaleString('pt-PT')} peças/dia
                  </div>
                )}

                <div>
                  <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">Etiqueta (opcional)</label>
                  <input
                    type="text"
                    placeholder={generateLabel(form) || 'Nome descritivo desta regra'}
                    value={form.label}
                    onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveForm}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition-colors"
                >
                  <Save size={15} />
                  {editingId ? 'Atualizar' : 'Adicionar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                <Zap size={24} />
              </div>
              <p className="font-bold text-slate-600 dark:text-slate-400 mb-1">Nenhuma regra de capacidade</p>
              <p className="text-sm text-slate-400 dark:text-slate-500">Clica em "Nova Regra" para começar a definir capacidades.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Secção</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Etiqueta</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Filtros</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Pcs/Hora</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Cap. Diária</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">H/Dia</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map(cap => {
                    const sector = sectorOf(cap.sectorId);
                    const SectorIcon = sector?.icon;
                    const filters = [
                      cap.articleCode && `Art: ${cap.articleCode}`,
                      cap.family && `Fam: ${cap.family}`,
                      cap.reference && `Ref: ${cap.reference}`,
                      cap.colorCode && `Cor: ${cap.colorCode}`,
                      cap.size && `Tam: ${cap.size}`,
                    ].filter(Boolean);
                    const dailyCap = cap.piecesPerHour * cap.hoursPerDay;

                    return (
                      <tr key={cap.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {SectorIcon && <SectorIcon size={14} className="text-blue-500 shrink-0" />}
                            <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap">{sector?.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-800 dark:text-white">{cap.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          {filters.length === 0 ? (
                            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full font-bold">Padrão Geral</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {filters.map((f, i) => (
                                <span key={i} className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">{f}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-black text-slate-800 dark:text-white">{cap.piecesPerHour.toLocaleString('pt-PT')}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{dailyCap.toLocaleString('pt-PT')}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400 text-xs font-medium">{cap.hoursPerDay}h</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            <button
                              onClick={() => handleEdit(cap)}
                              className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400 transition-colors"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(cap.id)}
                              className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-900/20 rounded-lg text-rose-500 dark:text-rose-400 transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 text-center">
          {items.length} regra{items.length !== 1 ? 's' : ''} de capacidade definida{items.length !== 1 ? 's' : ''}.
          {hasChanges && ' • Tens alterações não guardadas.'}
        </p>
      </div>
    </div>
  );
};

export default ProductionCapacityPage;
