
import React from 'react';
import { FolderInput, FolderOutput, Save, FolderOpen, AlertCircle, CheckCircle, Moon, Sun, Trash2, Users, ShieldCheck, UserPlus, Key, Eye, EyeOff, User as UserIcon, Settings as SettingsIcon, Package, Clock, Layers, ChevronRight, X, AlertTriangle, Keyboard, Plus, RotateCcw, Database, Activity, RefreshCw } from 'lucide-react';
import { saveDirectoryHandle, getDirectoryHandle, verifyPermission, hashPassword } from '../services/dataService';
import { User, PermissionLevel, UserPermissions, Order } from '../types';
import { SECTORS } from '../constants';
import StopReasons from './StopReasons';
import ExportableColumns from './ExportableColumns';
import { 
  getKeepAliveConfig, 
  saveKeepAliveConfig, 
  getKeepAliveLogs, 
  clearKeepAliveLogs, 
  runKeepAlivePing, 
  getLastPingTime,
  KeepAliveConfig,
  KeepAliveLog 
} from '../src/services/supabaseKeepAlive';

interface SettingsProps {
  currentTheme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onResetData?: () => void;
  users?: User[];
  onSaveUser?: (user: User) => Promise<void>;
  onDeleteUser?: (userId: string) => Promise<void>;
  stopReasonsHierarchy?: any[];
  onUpdateStopReasonsHierarchy?: (newHierarchy: any[]) => void;
  orders?: Order[];
  activeTab?: 'general' | 'users' | 'stop-reasons' | 'export-columns';
  onTabChange?: (tab: 'general' | 'users' | 'stop-reasons' | 'export-columns') => void;
  shortcuts?: Record<string, string>;
  onUpdateShortcuts?: (shortcuts: Record<string, string>) => void;
}

const Settings: React.FC<SettingsProps> = ({ 
  currentTheme, 
  onToggleTheme, 
  onResetData, 
  users = [], 
  onSaveUser, 
  onDeleteUser, 
  stopReasonsHierarchy = [], 
  onUpdateStopReasonsHierarchy, 
  orders = [], 
  activeTab = 'general', 
  onTabChange,
  shortcuts = {},
  onUpdateShortcuts
}) => {
  const [internalActiveTab, setInternalActiveTab] = React.useState<'general' | 'users' | 'stop-reasons' | 'export-columns'>(activeTab);
  const currentTab = onTabChange ? activeTab : internalActiveTab;

  const handleTabChange = (tab: 'general' | 'users' | 'stop-reasons' | 'export-columns') => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalActiveTab(tab);
    }
  };

  const [exportHandle, setExportHandle] = React.useState<any>(null);
  const [importHandle, setImportHandle] = React.useState<any>(null);
  const [statusMsg, setStatusMsg] = React.useState('');

  // Supabase Keep-Alive Cron Job States
  const [keepAliveConfig, setKeepAliveConfig] = React.useState<KeepAliveConfig>(() => getKeepAliveConfig());
  const [keepAliveLogs, setKeepAliveLogs] = React.useState<KeepAliveLog[]>(() => getKeepAliveLogs());
  const [keepAliveLastPing, setKeepAliveLastPing] = React.useState<string | null>(() => getLastPingTime());
  const [isPinging, setIsPinging] = React.useState(false);

  // User form state
  const [isUserFormOpen, setIsUserFormOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<User | null>(null);
  const [formData, setFormData] = React.useState({
    username: '',
    name: '',
    password: '',
    role: 'viewer' as 'admin' | 'viewer',
    permissions: {
        dashboard: 'none',
        orders: 'read',
        timeline: 'read',
        config: 'none',
        stopReasons: 'none',
        sectors: {}
    } as UserPermissions
  });
  const [showPassword, setShowPassword] = React.useState(false);

  // Keyboard Shortcuts States
  const [recordingViewId, setRecordingViewId] = React.useState<string | null>(null);
  const [isListening, setIsListening] = React.useState(false);
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [addFormViewId, setAddFormViewId] = React.useState('dashboard');
  const [addFormKey, setAddFormKey] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState('');

  const AVAILABLE_VIEWS = React.useMemo(() => [
    { id: 'dashboard', name: 'Dashboard', category: 'Principal' },
    { id: 'orders', name: 'Encomendas', category: 'Principal' },
    { id: 'timeline', name: 'Timeline', category: 'Principal' },
    { id: 'bottleneck', name: 'Análise de Gargalos', category: 'Controlo de Produção' },
    { id: 'production-capacity', name: 'Capacidades de Produção', category: 'Controlo de Produção' },
    { id: 'config', name: 'Configurações / Geral', category: 'Configurações' },
    { id: 'config-users', name: 'Configurações / Utilizadores', category: 'Configurações' },
    { id: 'config-stop-reasons', name: 'Configurações / Motivos de Paragem', category: 'Configurações' },
    { id: 'config-export-columns', name: 'Configurações / Tabelas Editáveis', category: 'Configurações' },
    ...SECTORS.map(s => ({
      id: `sector-${s.id}`,
      name: `${s.name} (Setor)`,
      category: 'Setores'
    }))
  ], []);

  React.useEffect(() => {
    if (!isListening) return;

    const handleKeyCapture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const key = e.key.toLowerCase();
      
      // Filter out modifier keys themselves
      if (['control', 'shift', 'alt', 'meta', 'escape', 'tab', 'enter'].includes(key)) {
        return;
      }

      if (recordingViewId) {
        // We are editing an existing or inline shortcut
        const conflictingViewId = Object.entries(shortcuts).find(([k, v]) => k === key && v !== recordingViewId)?.[1];
        
        if (conflictingViewId) {
          const conflictingView = AVAILABLE_VIEWS.find(v => v.id === conflictingViewId)?.name || conflictingViewId;
          if (!window.confirm(`A tecla "${key.toUpperCase()}" já está associada a "${conflictingView}". Deseja reassociar?`)) {
            setIsListening(false);
            setRecordingViewId(null);
            return;
          }
        }

        const updated = { ...shortcuts };
        // Delete any existing keys for this view
        Object.keys(updated).forEach(k => {
          if (updated[k] === recordingViewId) {
            delete updated[k];
          }
        });
        // Bind new key
        updated[key] = recordingViewId;
        if (onUpdateShortcuts) {
          onUpdateShortcuts(updated);
        }
        setRecordingViewId(null);
        setIsListening(false);
      } else if (showAddForm) {
        // We are capturing a key for the "Add New Shortcut" form
        setAddFormKey(key);
        setIsListening(false);
      }
    };

    window.addEventListener('keydown', handleKeyCapture, true);
    return () => window.removeEventListener('keydown', handleKeyCapture, true);
  }, [isListening, recordingViewId, showAddForm, shortcuts, onUpdateShortcuts, AVAILABLE_VIEWS]);

  const handleResetShortcuts = () => {
    if (window.confirm("Deseja repor todos os atalhos de teclado para os padrões do sistema?")) {
      const defaults = {
        'd': 'dashboard',
        'o': 'orders',
        't': 'timeline',
        'g': 'bottleneck',
        'c': 'production-capacity',
        's': 'config'
      };
      if (onUpdateShortcuts) {
        onUpdateShortcuts(defaults);
      }
    }
  };

  const handleAddShortcut = () => {
    if (!addFormViewId || !addFormKey) {
      setErrorMessage('Por favor, selecione uma vista e defina um atalho.');
      return;
    }

    const key = addFormKey.toLowerCase();
    
    // Check conflict
    const conflictingViewId = shortcuts[key];
    if (conflictingViewId) {
      const conflictingView = AVAILABLE_VIEWS.find(v => v.id === conflictingViewId)?.name || conflictingViewId;
      if (!window.confirm(`A tecla "${key.toUpperCase()}" já está associada a "${conflictingView}". Deseja substituir?`)) {
        return;
      }
    }

    const updated = { ...shortcuts };
    // Clear any existing key for this same target view
    Object.keys(updated).forEach(k => {
      if (updated[k] === addFormViewId) {
        delete updated[k];
      }
    });

    updated[key] = addFormViewId;
    if (onUpdateShortcuts) {
      onUpdateShortcuts(updated);
    }

    // Reset form
    setAddFormKey('');
    setShowAddForm(false);
    setErrorMessage('');
  };

  const handleDeleteShortcut = (keyToDelete: string) => {
    const updated = { ...shortcuts };
    delete updated[keyToDelete];
    if (onUpdateShortcuts) {
      onUpdateShortcuts(updated);
    }
  };

  // Supabase Keep-Alive Event Handlers
  const handleManualPing = async () => {
    setIsPinging(true);
    try {
      const result = await runKeepAlivePing(true);
      setKeepAliveLastPing(getLastPingTime());
      setKeepAliveLogs(getKeepAliveLogs());
      if (result.success) {
        setStatusMsg('Sucesso: O ping de teste foi enviado e a API da Supabase respondeu com sucesso!');
      } else {
        setStatusMsg(`Erro no ping: ${result.log.message}`);
      }
    } catch (e: any) {
      console.error(e);
      setStatusMsg(`Erro ao executar ping: ${e.message || e}`);
    } finally {
      setIsPinging(false);
      setTimeout(() => setStatusMsg(''), 6000);
    }
  };

  const handleUpdateKeepAliveConfig = (updates: Partial<KeepAliveConfig>) => {
    const updated = { ...keepAliveConfig, ...updates };
    setKeepAliveConfig(updated);
    saveKeepAliveConfig(updated);
    setStatusMsg('Configuração do Keep-Alive guardada com sucesso.');
    setTimeout(() => setStatusMsg(''), 3000);
  };

  const handleClearKeepAliveLogs = () => {
    if (window.confirm('Tem a certeza que deseja limpar o histórico de logs do Keep-Alive?')) {
      clearKeepAliveLogs();
      setKeepAliveLogs([]);
      setKeepAliveLastPing(null);
      setStatusMsg('Histórico de logs limpo com sucesso.');
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  React.useEffect(() => {
    loadHandles();
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isUserFormOpen) {
        setIsUserFormOpen(false);
        setEditingUser(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isUserFormOpen]);

  const loadHandles = async () => {
    try {
      const exp = await getDirectoryHandle('export');
      if (exp) setExportHandle(exp);
      
      const imp = await getDirectoryHandle('import');
      if (imp) setImportHandle(imp);
    } catch (e) {
      console.error("Erro ao carregar configurações", e);
    }
  };

  const pickFolder = async (type: 'import' | 'export') => {
    try {
      // @ts-ignore - File System Access API
      const handle = await window.showDirectoryPicker();
      if (handle) {
        await saveDirectoryHandle(type, handle);
        if (type === 'export') setExportHandle(handle);
        else setImportHandle(handle);
        setStatusMsg(`Pasta de ${type === 'export' ? 'Exportação' : 'Importação'} atualizada com sucesso.`);
        setTimeout(() => setStatusMsg(''), 3000);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setStatusMsg("Erro: O seu navegador pode não suportar esta funcionalidade.");
      }
    }
  };

  const tabLabels: Record<string, string> = {
    'general': 'Geral',
    'users': 'Utilizadores',
    'stop-reasons': 'Motivos de Paragem',
    'export-columns': 'Tabelas Editáveis',
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8 animate-in fade-in duration-500">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              Configurações
              <span className="text-slate-400 dark:text-slate-500 font-medium">/</span>
              <span className="text-slate-500 dark:text-slate-400 font-medium text-xl">{tabLabels[currentTab]}</span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Gestão do sistema, utilizadores e preferências.</p>
          </div>
        </div>

        {statusMsg && (
          <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-medium">
            <CheckCircle size={16} /> {statusMsg}
          </div>
        )}
        
        {/* ===== ABA GERAL ===== */}
        {currentTab === 'general' && (
        <>
        {/* Appearance Settings */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-xl">
                {currentTheme === 'dark' ? <Moon size={24} /> : <Sun size={24} />}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Aparência Visual</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {currentTheme === 'dark' ? 'Modo Escuro Ativo' : 'Modo Claro Ativo'} - Altere para reduzir o cansaço visual.
                </p>
              </div>
            </div>
            
            {onToggleTheme && (
                <button
                    onClick={onToggleTheme}
                    className={`relative w-16 h-8 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 ${
                        currentTheme === 'dark' ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                >
                    <span
                        className={`absolute top-1 left-1 bg-white rounded-full w-6 h-6 shadow-md transform transition-transform duration-300 flex items-center justify-center ${
                            currentTheme === 'dark' ? 'translate-x-8' : 'translate-x-0'
                        }`}
                    >
                         {currentTheme === 'dark' ? <Moon size={12} className="text-violet-600"/> : <Sun size={12} className="text-amber-500"/>}
                    </span>
                </button>
            )}
          </div>
        </div>

        {/* Export Folder */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
              <FolderOutput size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Pasta de Exportação (Backups)</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Defina onde os ficheiros de base de dados (.sqlite) serão guardados automaticamente ao clicar em "Exportar BD".
              </p>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => pickFolder('export')}
                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
                >
                  <FolderOpen size={16} /> Escolher Pasta
                </button>
                
                {exportHandle ? (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded border border-emerald-100 dark:border-emerald-800">
                    <CheckCircle size={12} /> Selecionada: {exportHandle.name}
                  </span>
                ) : (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded border border-amber-100 dark:border-amber-800">
                    <AlertCircle size={12} /> Não definida (Usará Downloads)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Import Folder */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <FolderInput size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Pasta de Importação</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Defina uma pasta padrão para facilitar a localização de ficheiros Excel e Bases de Dados durante a importação.
              </p>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => pickFolder('import')}
                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
                >
                  <FolderOpen size={16} /> Escolher Pasta
                </button>

                {importHandle ? (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded border border-emerald-100 dark:border-emerald-800">
                    <CheckCircle size={12} /> Selecionada: {importHandle.name}
                  </span>
                ) : (
                  <span className="text-xs font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded border border-slate-100 dark:border-slate-700">
                    Não definida
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Keyboard Shortcuts Section */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-xl">
                <Keyboard size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Atalhos de Teclado</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Navegue rapidamente entre as diferentes páginas pressionando uma única tecla.
                </p>
              </div>
            </div>
            
            <button
              onClick={handleResetShortcuts}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs font-semibold"
              title="Repor atalhos padrão"
            >
              <RotateCcw size={15} /> Repor Padrões
            </button>
          </div>

          {/* Shortcut list */}
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold text-xs uppercase tracking-wider">
                    <th className="py-2 px-3">Ecrã / Destino</th>
                    <th className="py-2 px-3">Categoria</th>
                    <th className="py-2 px-3 text-center">Atalho</th>
                    <th className="py-2 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {Object.entries(shortcuts).map(([key, viewId]) => {
                    const viewObj = AVAILABLE_VIEWS.find(v => v.id === viewId);
                    const viewName = viewObj ? viewObj.name : viewId;
                    const viewCat = viewObj ? viewObj.category : 'Outro';
                    const isRecordingThis = recordingViewId === viewId && isListening;

                    return (
                      <tr key={key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-200">
                          {viewName}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-400 dark:text-slate-500 font-medium">
                          {viewCat}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {isRecordingThis ? (
                            <span className="inline-flex items-center px-2 py-1 rounded bg-amber-500/10 text-amber-500 text-xs font-black animate-pulse border border-amber-500/20">
                              Aguardando tecla...
                            </span>
                          ) : (
                            <kbd className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm uppercase font-mono">
                              {key}
                            </kbd>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setRecordingViewId(viewId);
                                setIsListening(true);
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-bold transition-colors"
                            >
                              Alterar
                            </button>
                            <button
                              onClick={() => handleDeleteShortcut(key)}
                              className="text-xs text-rose-500 hover:text-rose-700 dark:text-rose-450 dark:hover:text-rose-400 font-bold transition-colors"
                            >
                              Remover
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {Object.keys(shortcuts).length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400 dark:text-slate-500 text-sm italic">
                        Nenhum atalho de teclado configurado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Add shortcut area */}
            {!showAddForm ? (
              <button
                onClick={() => {
                  setShowAddForm(true);
                  // Find a view that is not currently bound
                  const boundViews = Object.values(shortcuts);
                  const unbound = AVAILABLE_VIEWS.find(v => !boundViews.includes(v.id));
                  if (unbound) {
                    setAddFormViewId(unbound.id);
                  }
                  setAddFormKey('');
                  setErrorMessage('');
                }}
                className="w-full mt-2 py-2 px-3 border border-dashed border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
              >
                <Plus size={16} /> Adicionar Novo Atalho
              </button>
            ) : (
              <div className="mt-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Novo Atalho de Teclado</h4>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setErrorMessage('');
                    }}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase text-slate-400 tracking-wider ml-1">Ecrã / Destino</label>
                    <select
                      value={addFormViewId}
                      onChange={(e) => setAddFormViewId(e.target.value)}
                      className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                    >
                      {AVAILABLE_VIEWS.map(view => (
                        <option key={view.id} value={view.id}>
                          {view.name} ({view.category})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase text-slate-400 tracking-wider ml-1">Tecla de Atalho</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setRecordingViewId(null);
                          setIsListening(true);
                        }}
                        className={`flex-1 py-2 px-3 text-sm rounded-xl border font-bold transition-all ${
                          isListening && !recordingViewId
                            ? 'bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400 animate-pulse'
                            : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {isListening && !recordingViewId ? 'A escutar tecla...' : addFormKey ? `Tecla gravada: "${addFormKey.toUpperCase()}"` : 'Pressionar para gravar tecla'}
                      </button>
                      
                      {addFormKey && (
                        <kbd className="px-3 py-2 font-black text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm uppercase font-mono text-slate-800 dark:text-slate-100">
                          {addFormKey}
                        </kbd>
                      )}
                    </div>
                  </div>
                </div>

                {errorMessage && (
                  <p className="text-xs text-rose-500 font-semibold">{errorMessage}</p>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setErrorMessage('');
                    }}
                    className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-transparent rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAddShortcut}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-md shadow-blue-600/10 transition-all flex items-center gap-1.5"
                  >
                    <Save size={14} /> Guardar Atalho
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Supabase Keep-Alive (Cron Job) */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
                <Database size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Supabase Keep-Alive (Cron Job)</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Evite que a sua base de dados do Supabase (Free Tier) entre em suspensão. O sistema realiza pings automáticos de rotina.
                </p>
              </div>
            </div>

            {/* Toggle Enable/Disable */}
            <button
              onClick={() => handleUpdateKeepAliveConfig({ enabled: !keepAliveConfig.enabled })}
              className={`relative w-16 h-8 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                keepAliveConfig.enabled ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`absolute top-1 left-1 bg-white rounded-full w-6 h-6 shadow-md transform transition-transform duration-300 ${
                  keepAliveConfig.enabled ? 'translate-x-8' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-slate-400 tracking-wider ml-1">Intervalo de Ping</label>
              <select
                value={keepAliveConfig.intervalDays}
                onChange={(e) => handleUpdateKeepAliveConfig({ intervalDays: Number(e.target.value) })}
                disabled={!keepAliveConfig.enabled}
                className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 disabled:opacity-50"
              >
                <option value={7}>Semanal (7 em 7 dias)</option>
                <option value={10}>Cada 10 dias</option>
                <option value={14}>Quinzenal (14 em 14 dias - Padrão)</option>
                <option value={30}>Mensal (30 em 30 dias)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-slate-400 tracking-wider ml-1">
                URL de Edge Function (Opcional)
              </label>
              <input
                type="text"
                placeholder="https://your-project.supabase.co/functions/v1/keep-alive"
                value={keepAliveConfig.customUrl}
                onChange={(e) => handleUpdateKeepAliveConfig({ customUrl: e.target.value })}
                disabled={!keepAliveConfig.enabled}
                className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Quick status board */}
          <div className="bg-slate-50 dark:bg-slate-950/20 rounded-2xl p-4 border border-slate-100 dark:border-slate-800/60 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Estado do Cron</span>
              <div className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${keepAliveConfig.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  {keepAliveConfig.enabled ? 'Ativo & Agendado' : 'Desativado'}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Último Ping</span>
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                <Clock size={14} className="text-slate-400" />
                {keepAliveLastPing ? new Date(keepAliveLastPing).toLocaleString('pt-PT') : 'Nunca'}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Próximo Agendamento</span>
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {!keepAliveConfig.enabled ? (
                  'Suspenso'
                ) : !keepAliveLastPing ? (
                  'Imediato (No próximo arranque)'
                ) : (() => {
                    const nextDate = new Date(keepAliveLastPing);
                    nextDate.setDate(nextDate.getDate() + keepAliveConfig.intervalDays);
                    const diffDays = Math.max(0, Math.ceil((nextDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
                    return `${nextDate.toLocaleDateString('pt-PT')} (em ~${diffDays} dias)`;
                  })()
                }
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <button
              onClick={handleManualPing}
              disabled={isPinging || !keepAliveConfig.enabled}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider shadow-md shadow-blue-500/10 flex items-center gap-2 transition-all disabled:opacity-50 active:scale-95"
            >
              {isPinging ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  A enviar ping...
                </>
              ) : (
                <>
                  <Activity size={14} />
                  Testar Ligação (Ping Agora)
                </>
              )}
            </button>

            {keepAliveLogs.length > 0 && (
              <button
                onClick={handleClearKeepAliveLogs}
                className="text-slate-400 hover:text-rose-500 font-semibold text-xs flex items-center gap-1.5 transition-colors"
              >
                Limpar Histórico
              </button>
            )}
          </div>

          {/* Activity Logs */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider ml-1">Histórico de Pings</h4>
            {keepAliveLogs.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 dark:text-slate-500 text-xs font-medium">
                Nenhum log de ping disponível. Teste a ligação para iniciar o histórico.
              </div>
            ) : (
              <div className="border border-slate-100 dark:border-slate-850 rounded-2xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-850">
                {keepAliveLogs.map((log) => (
                  <div key={log.id} className="p-3 hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors flex items-start justify-between gap-4 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-200">
                        <span className={`w-2 h-2 rounded-full ${log.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span>{log.status === 'success' ? 'Ping com Sucesso' : 'Erro no Ping'}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                          {new Date(log.timestamp).toLocaleString('pt-PT')}
                        </span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                        {log.message}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded text-[10px] font-bold">
                        {log.durationMs}ms
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Data Reset Zone */}
        {onResetData && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl">
              <Trash2 size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Limpeza de Dados</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Remover todas as encomendas importadas e reiniciar a base de dados local.
              </p>
              
              <button 
                onClick={onResetData}
                className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
              >
                <Trash2 size={16} /> Reset Aplicação
              </button>
            </div>
          </div>
        </div>
        )}

        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
          <h4 className="font-bold text-slate-700 dark:text-slate-300 text-xs uppercase mb-2">Nota Técnica</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Esta funcionalidade utiliza a <strong>File System Access API</strong>. O navegador pode solicitar permissão de acesso "Ver e Editar" sempre que reiniciar a aplicação por motivos de segurança.
          </p>
        </div>
        </>
        )}

        {/* ===== ABA UTILIZADORES ===== */}
        {currentTab === 'users' && (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl">
                        <Users size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Gestão de Utilizadores</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Administre quem tem acesso e quais as permissões.</p>
                    </div>
                </div>
                <button
                    onClick={() => {
                        setEditingUser(null);
                        setFormData({
                            username: '',
                            name: '',
                            password: '',
                            role: 'viewer',
                            permissions: {
                                dashboard: 'none',
                                orders: 'read',
                                timeline: 'read',
                                config: 'none',
                                stopReasons: 'none',
                                sectors: {}
                            }
                        });
                        setIsUserFormOpen(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-600/20 flex items-center gap-2 transition-all active:scale-95"
                >
                    <UserPlus size={18} /> Adicionar
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {users.map(user => (
                    <div key={user.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between group hover:border-blue-200 dark:hover:border-blue-900 transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold border border-slate-200 dark:border-slate-700 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-hover:text-blue-600 transition-colors">
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    {user.name}
                                    <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase font-black ${user.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                                        {user.role}
                                    </span>
                                </h4>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                        <UserIcon size={12} /> {user.username}
                                    </span>
                                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                        <ShieldCheck size={12} /> {Object.values(user.permissions || {}).filter(p => p !== 'none').length + Object.values(user.permissions?.sectors || {}).filter(p => p !== 'none').length} permissões
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    setEditingUser(user);
                                    setFormData({
                                        username: user.username,
                                        name: user.name,
                                        password: user.password || '',
                                        role: user.role,
                                        permissions: user.permissions
                                    });
                                    setIsUserFormOpen(true);
                                }}
                                className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all"
                                title="Editar"
                            >
                                <ChevronRight size={20} />
                            </button>
                            <button
                                onClick={() => {
                                    if(window.confirm(`Tem a certeza que deseja remover o utilizador ${user.name}?`)) {
                                        if (onDeleteUser) onDeleteUser(user.id);
                                    }
                                }}
                                className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all"
                                title="Remover"
                            >
                                <Trash2 size={20} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
        )}

        {/* ===== ABA MOTIVOS DE PARAGEM ===== */}
        {currentTab === 'stop-reasons' && (
          <div className="-mx-4 md:-mx-8 -mt-8">
            <StopReasons
              hierarchy={stopReasonsHierarchy}
              onUpdateHierarchy={onUpdateStopReasonsHierarchy || (() => {})}
              embedded={true}
            />
          </div>
        )}

        {/* ===== ABA TABELAS EDITÁVEIS ===== */}
        {currentTab === 'export-columns' && (
          <ExportableColumns orders={orders} />
        )}

        <div className="text-right pt-4 pb-2 pr-2">
          <p className="text-[9px] font-medium text-slate-400 dark:text-slate-600">
            aplicação criada e desenvolvida por: Artur Silva
          </p>
        </div>
      </div>

      {/* User Form Modal */}
      {isUserFormOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
                            <UserPlus size={20} />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                            {editingUser ? 'Editar Utilizador' : 'Novo Utilizador'}
                        </h2>
                    </div>
                    <button onClick={() => setIsUserFormOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase text-slate-400 tracking-wider ml-1">Login</label>
                            <input
                                type="text"
                                value={formData.username}
                                onChange={e => setFormData({...formData, username: e.target.value})}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-slate-800 dark:text-slate-100 font-medium outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="ex: jdoe"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase text-slate-400 tracking-wider ml-1">Nome</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-slate-800 dark:text-slate-100 font-medium outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="ex: João Silva"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase text-slate-400 tracking-wider ml-1">Perfil / Role</label>
                            <select
                                value={formData.role}
                                onChange={e => setFormData({...formData, role: e.target.value as 'admin' | 'viewer'})}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-slate-800 dark:text-slate-100 font-medium outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="viewer">Viewer (Leitura/Operador)</option>
                                <option value="admin">Admin (Administrador)</option>
                            </select>
                        </div>
                        <div className="space-y-2 relative">
                            <label className="text-xs font-black uppercase text-slate-400 tracking-wider ml-1">
                                Palavra-passe
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={formData.password}
                                    onChange={e => setFormData({...formData, password: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-slate-800 dark:text-slate-100 font-medium outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2 mb-4">
                            <ShieldCheck size={18} className="text-blue-500" />
                            <h3 className="text-sm font-black uppercase text-slate-800 dark:text-slate-100 tracking-tight">Permissões de Acesso</h3>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Páginas Principais</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                                    {[
                                        { id: 'dashboard', label: 'Dashboard', icon: Package },
                                        { id: 'orders', label: 'Encomendas', icon: Package },
                                        { id: 'timeline', label: 'Timeline', icon: Clock },
                                        { id: 'config', label: 'Configurações', icon: SettingsIcon },
                                    ].map(page => (
                                        <div key={page.id} className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-2">
                                                <page.icon size={14} className="text-slate-400" />
                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{page.label}</span>
                                            </div>
                                            <div className="flex bg-white dark:bg-slate-900 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 shadow-sm">
                                                {(['none', 'read', 'write'] as PermissionLevel[]).map(level => (
                                                    <button
                                                        key={level}
                                                        onClick={() => setFormData({
                                                            ...formData,
                                                            permissions: {
                                                                ...formData.permissions,
                                                                [page.id]: level
                                                            }
                                                        })}
                                                        className={`px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all ${
                                                            formData.permissions[page.id as keyof Omit<UserPermissions, 'sectors'>] === level
                                                            ? (level === 'none' ? 'bg-rose-100 text-rose-600' : level === 'read' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600')
                                                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                                                        }`}
                                                    >
                                                        {level === 'none' ? 'Nenhum' : level === 'read' ? 'Ler' : 'Escrita'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Acesso por Sector</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                                    {SECTORS.map(sector => (
                                        <div key={sector.id} className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-2">
                                                <sector.icon size={14} className="text-slate-400" />
                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{sector.name}</span>
                                            </div>
                                            <div className="flex bg-white dark:bg-slate-900 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 shadow-sm">
                                                {(['none', 'read', 'write'] as PermissionLevel[]).map(level => (
                                                    <button
                                                        key={level}
                                                        onClick={() => setFormData({
                                                            ...formData,
                                                            permissions: {
                                                                ...formData.permissions,
                                                                sectors: {
                                                                    ...(formData.permissions?.sectors || {}),
                                                                    [sector.id]: level
                                                                }
                                                            }
                                                        })}
                                                        className={`px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all ${
                                                            (formData.permissions?.sectors?.[sector.id] || 'none') === level
                                                            ? (level === 'none' ? 'bg-rose-100 text-rose-600' : level === 'read' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600')
                                                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                                                        }`}
                                                    >
                                                        {level === 'none' ? 'Nenhum' : level === 'read' ? 'Ler' : 'Escrita'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                    <button
                        onClick={() => setIsUserFormOpen(false)}
                        className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={async () => {
                            if (!formData.username || !formData.name) {
                                alert("Por favor preencha o login e o nome.");
                                return;
                            }

                            const newUser: User = {
                                id: editingUser?.id || crypto.randomUUID(),
                                username: formData.username,
                                name: formData.name,
                                role: formData.role,
                                permissions: formData.permissions,
                                password: formData.password || editingUser?.password,
                                passwordHash: editingUser?.passwordHash // just keep old hash if unchanged
                            };

                            if (onSaveUser) await onSaveUser(newUser);
                            setIsUserFormOpen(false);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-600/20 transition-transform active:scale-95 flex items-center gap-2"
                    >
                        <Save size={18} /> Guardar Utilizador
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
