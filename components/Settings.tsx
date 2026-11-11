
import React from 'react';
import { FolderInput, FolderOutput, Save, FolderOpen, AlertCircle, CheckCircle, Moon, Sun, Trash2, Users, ShieldCheck, UserPlus, Key, Eye, EyeOff, User as UserIcon, Settings as SettingsIcon, Package, Clock, Layers, ChevronRight, X, AlertTriangle, Keyboard, Plus, Minus, RotateCcw, Database, Activity, RefreshCw, Bell, Calendar, Sliders, Volume2, Check, Send, Waves, Droplets, Scissors, Truck, ShieldAlert } from 'lucide-react';
import { saveDirectoryHandle, getDirectoryHandle, verifyPermission, hashPassword, getSectorAlertTolerances, saveSectorAlertTolerances, DEFAULT_SECTOR_ALERT_TOLERANCES } from '../services/dataService';
import { notificationService, NotificationPreferences, DEFAULT_NOTIFICATION_PREFERENCES } from '../services/notificationService';
import { User, PermissionLevel, UserPermissions, Order, SectorAlertTolerances } from '../types';
import { SECTORS } from '../constants';
import StopReasons from './StopReasons';
import ExportableColumns from './ExportableColumns';
import { PWAInstallButton } from './PWAInstallButton';
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
  currentUser?: User | null;
  currentTheme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onResetData?: () => void;
  users?: User[];
  onSaveUser?: (user: User) => Promise<void>;
  onDeleteUser?: (userId: string) => Promise<void>;
  stopReasonsHierarchy?: any[];
  onUpdateStopReasonsHierarchy?: (newHierarchy: any[]) => void;
  orders?: Order[];
  activeTab?: 'general' | 'notifications' | 'users' | 'stop-reasons' | 'export-columns';
  onTabChange?: (tab: 'general' | 'notifications' | 'users' | 'stop-reasons' | 'export-columns') => void;
  shortcuts?: Record<string, string>;
  onUpdateShortcuts?: (shortcuts: Record<string, string>) => void;
}

const Settings: React.FC<SettingsProps> = ({ 
  currentUser,
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
  const [internalActiveTab, setInternalActiveTab] = React.useState<'general' | 'notifications' | 'users' | 'stop-reasons' | 'export-columns'>(activeTab);
  const currentTab = onTabChange ? activeTab : internalActiveTab;

  const handleTabChange = (tab: 'general' | 'notifications' | 'users' | 'stop-reasons' | 'export-columns') => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalActiveTab(tab);
    }
  };

  const [exportHandle, setExportHandle] = React.useState<any>(null);
  const [importHandle, setImportHandle] = React.useState<any>(null);
  const [statusMsg, setStatusMsg] = React.useState('');
  const [notifPermission, setNotifPermission] = React.useState<NotificationPermission>(() => notificationService.getPermissionStatus());
  const [isPushSubscribed, setIsPushSubscribed] = React.useState<boolean>(false);
  const [isSubscribing, setIsSubscribing] = React.useState<boolean>(false);

  React.useEffect(() => {
    notificationService.getPushSubscription().then(sub => {
      setIsPushSubscribed(!!sub);
    });
  }, []);

  const handleRequestPushPermission = async () => {
    setIsSubscribing(true);
    try {
      const granted = await notificationService.subscribeToPushNotifications();
      setNotifPermission(notificationService.getPermissionStatus());
      const sub = await notificationService.getPushSubscription();
      setIsPushSubscribed(!!sub);
      if (granted) {
        setStatusMsg('Subscrição Push API ativa! O seu dispositivo receberá alertas de encomendas urgentes em segundo plano.');
        setTimeout(() => setStatusMsg(''), 5000);
      }
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleTogglePushSubscription = async () => {
    setIsSubscribing(true);
    try {
      if (isPushSubscribed) {
        await notificationService.unsubscribeFromPushNotifications();
        setIsPushSubscribed(false);
        setStatusMsg('Subscrição Push desativada neste dispositivo.');
      } else {
        const ok = await notificationService.subscribeToPushNotifications();
        const sub = await notificationService.getPushSubscription();
        setIsPushSubscribed(!!sub);
        if (ok) {
          setStatusMsg('Alertas Push para Gestores ativados com sucesso!');
        }
      }
      setTimeout(() => setStatusMsg(''), 4000);
    } finally {
      setIsSubscribing(false);
    }
  };

  // Preferências de Notificação Push (Notification Preferences)
  const [notifPreferences, setNotifPreferences] = React.useState<NotificationPreferences>(() => {
    if (currentUser?.notificationPreferences) {
      return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...currentUser.notificationPreferences };
    }
    return notificationService.getPreferences();
  });

  React.useEffect(() => {
    if (currentUser?.notificationPreferences) {
      setNotifPreferences(prev => ({
        ...prev,
        ...currentUser.notificationPreferences
      }));
    }
  }, [currentUser]);

  // Persistir preferências no localStorage e na base de dados do utilizador
  const persistPreferences = async (updated: NotificationPreferences) => {
    // 1. Guardar no localStorage e sincronizar subscrição com o servidor push
    notificationService.savePreferences(updated);

    // 2. Guardar na base de dados do utilizador se utilizador e onSaveUser estiverem disponíveis
    if (currentUser && onSaveUser) {
      try {
        await onSaveUser({
          ...currentUser,
          notificationPreferences: updated
        });
      } catch (err) {
        console.error('[Settings] Erro ao sincronizar preferências na base de dados do utilizador:', err);
      }
    }
  };

  const handleTogglePreference = (key: keyof NotificationPreferences) => {
    setNotifPreferences(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      persistPreferences(updated);
      const labels: Record<keyof NotificationPreferences, string> = {
        dateChanges: 'Alteração de Datas & Previsões',
        priorityChanges: 'Prioridade & Urgências',
        stoppageReasons: 'Motivos de Paragem & Classificação',
        statusChanges: 'Conclusão de Encomendas',
        urgentOnly: 'Apenas Encomendas Urgentes',
        soundEnabled: 'Sons de Alerta'
      };
      setStatusMsg(`Preferência "${labels[key]}" ${updated[key] ? 'ativada' : 'desativada'} (guardada no dispositivo e na base de dados).`);
      setTimeout(() => setStatusMsg(''), 3500);
      return updated;
    });
  };

  const handleResetPreferences = () => {
    setNotifPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
    persistPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
    setStatusMsg('Preferências repostas para os valores predefinidos (guardado no dispositivo e base de dados).');
    setTimeout(() => setStatusMsg(''), 3500);
  };

  const handleEnableAllPreferences = () => {
    const allEnabled: NotificationPreferences = {
      dateChanges: true,
      priorityChanges: true,
      stoppageReasons: true,
      statusChanges: true,
      urgentOnly: false,
      soundEnabled: true
    };
    setNotifPreferences(allEnabled);
    persistPreferences(allEnabled);
    setStatusMsg('Todos os alertas de notificação foram ativados e guardados na base de dados.');
    setTimeout(() => setStatusMsg(''), 3500);
  };

  const handleTestDateChangeNotification = async () => {
    setStatusMsg('A enviar alerta de teste de Alteração de Data...');
    await notificationService.notifyUrgentOrderChange({
      orderDocNr: '525-2026000373',
      clientName: 'Lasa Internacional',
      changeType: 'PREDICTION_CHANGED',
      description: 'Nova data prevista no Setor Tecelagem: 18/11/2026 (+5 dias de atraso).',
      priority: 1,
      changedBy: 'Planeamento'
    });
    setTimeout(() => {
      setStatusMsg('Alerta de Alteração de Data enviado! Verifique as notificações.');
      setTimeout(() => setStatusMsg(''), 4500);
    }, 500);
  };

  const handleTestStoppageNotification = async () => {
    setStatusMsg('A enviar alerta de teste de Motivo de Paragem...');
    await notificationService.notifyUrgentOrderChange({
      orderDocNr: '525-2026000373',
      clientName: 'Lasa Internacional',
      changeType: 'STOP_REASON',
      description: 'Paragem no Setor Tecelagem: "1 - aprovação de cor / estampado / urdissagem".',
      priority: 1,
      changedBy: 'Tecelagem'
    });
    setTimeout(() => {
      setStatusMsg('Alerta de Paragem enviado! Verifique as notificações.');
      setTimeout(() => setStatusMsg(''), 4500);
    }, 500);
  };

  const handleTestPriorityNotification = async () => {
    setStatusMsg('A enviar alerta de teste de Prioridade/Urgência...');
    await notificationService.notifyUrgentOrderChange({
      orderDocNr: '525-2026000373',
      clientName: 'Lasa Internacional',
      changeType: 'PRIORITY_CHANGED',
      description: 'Marcada como URGENTE — Prioridade Alta (Vermelho).',
      priority: 1,
      changedBy: 'Gestor de Produção'
    });
    setTimeout(() => {
      setStatusMsg('Alerta de Prioridade enviado! Verifique as notificações.');
      setTimeout(() => setStatusMsg(''), 4500);
    }, 500);
  };

  const handleTestUrgentPushNotification = async () => {
    setStatusMsg('A enviar alerta de teste de Encomenda Urgente...');
    await notificationService.notifyUrgentOrderChange({
      orderDocNr: '515-2026000292',
      clientName: 'CARRE BLANC (URGENTE)',
      changeType: 'PRIORITY_CHANGED',
      description: 'Prioridade alterada para ALTA. Nova data de entrega no Setor Tecelagem.',
      priority: 1,
      changedBy: 'Gestor de Produção'
    });
    setTimeout(() => {
      setStatusMsg('Alerta de Encomenda Urgente despachado! Verifique a barra de notificações do seu telemóvel/computador.');
      setTimeout(() => setStatusMsg(''), 5000);
    }, 600);
  };

  // Configurações de Tolerâncias de Alerta por Sector
  const [sectorTolerances, setSectorTolerances] = React.useState<SectorAlertTolerances>(() => getSectorAlertTolerances());

  const handleToleranceChange = (sectorKey: keyof SectorAlertTolerances, delta: number) => {
    setSectorTolerances(prev => {
      const currentVal = prev[sectorKey] ?? 0;
      const newVal = Math.max(0, Math.min(60, currentVal + delta));
      return { ...prev, [sectorKey]: newVal };
    });
  };

  const handleToleranceInput = (sectorKey: keyof SectorAlertTolerances, rawVal: string) => {
    const val = parseInt(rawVal, 10);
    const validVal = isNaN(val) ? 0 : Math.max(0, Math.min(60, val));
    setSectorTolerances(prev => ({
      ...prev,
      [sectorKey]: validVal
    }));
  };

  const handleSaveTolerances = () => {
    saveSectorAlertTolerances(sectorTolerances);
    setStatusMsg('Limites de tolerância de alerta por sector guardados com sucesso!');
    setTimeout(() => setStatusMsg(''), 4000);
  };

  const handleResetTolerances = () => {
    if (window.confirm('Deseja repor todos os limites de tolerância para 0 dias (alerta imediato)?')) {
      setSectorTolerances(DEFAULT_SECTOR_ALERT_TOLERANCES);
      saveSectorAlertTolerances(DEFAULT_SECTOR_ALERT_TOLERANCES);
      setStatusMsg('Limites de tolerância repostos para os valores padrão (0 dias).');
      setTimeout(() => setStatusMsg(''), 3500);
    }
  };

  const handleApplyPresetTolerances = (days: number) => {
    const updated: SectorAlertTolerances = {
      tecelagem: days,
      felpo_cru: days,
      tinturaria: days,
      confeccao: days,
      embalagem: days,
      expedicao: days,
      generalDelivery: days,
    };
    setSectorTolerances(updated);
    saveSectorAlertTolerances(updated);
    setStatusMsg(`Tolerância de ${days} ${days === 1 ? 'dia' : 'dias'} aplicada a todos os setores.`);
    setTimeout(() => setStatusMsg(''), 3500);
  };

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
    'notifications': 'Configurações de Alertas',
    'users': 'Utilizadores',
    'stop-reasons': 'Motivos de Paragem',
    'export-columns': 'Tabelas Editáveis',
  };

  const renderAlertToleranceSection = () => {
    const sectorsConfig = [
      { key: 'tecelagem' as keyof SectorAlertTolerances, name: 'Tecelagem', icon: Waves, color: 'blue', desc: 'Produção em tear e corte de amostras' },
      { key: 'felpo_cru' as keyof SectorAlertTolerances, name: 'Felpo Cru', icon: Layers, color: 'indigo', desc: 'Conclusão de tecido cru e armazém intermédio' },
      { key: 'tinturaria' as keyof SectorAlertTolerances, name: 'Tinturaria', icon: Droplets, color: 'purple', desc: 'Tingimento, lavagem e rama/acabamento térmico' },
      { key: 'confeccao' as keyof SectorAlertTolerances, name: 'Confecção', icon: Scissors, color: 'fuchsia', desc: 'Corte e costura de felpos e roupões' },
      { key: 'embalagem' as keyof SectorAlertTolerances, name: 'Embalagem / Acabamento', icon: Package, color: 'pink', desc: 'Dobragem, etiquetagem e ensacamento' },
      { key: 'expedicao' as keyof SectorAlertTolerances, name: 'Stock / Expedição', icon: Truck, color: 'teal', desc: 'Embalagem em caixa e entrega ao transporte' },
      { key: 'generalDelivery' as keyof SectorAlertTolerances, name: 'Prazo Geral de Entrega', icon: Calendar, color: 'amber', desc: 'Data limite de entrega da encomenda ao cliente' },
    ];

    const totalToleranceDays: number = (Object.values(sectorTolerances) as (number | undefined)[]).reduce<number>((acc, v) => acc + (v || 0), 0);

    return (
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-200/60 dark:border-blue-900/40">
              <ShieldAlert size={22} />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
                  Configurações de Alertas: Limites de Tolerância por Sector
                </h3>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {totalToleranceDays === 0 ? 'Tolerância Zero (Alerta Imediato)' : `Média ${(totalToleranceDays / 7).toFixed(1)} dias tol.`}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
                Defina quantos <strong>dias de tolerância</strong> são admitidos após a data prevista de cada sector antes de disparar alertas de atraso no sistema, Centro de Alertas e nos cartões de KPIs do Dashboard.
              </p>
            </div>
          </div>

          {/* Quick Presets & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveTolerances}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
            >
              <Save size={13} /> Guardar Tolerâncias
            </button>
            <button
              type="button"
              onClick={handleResetTolerances}
              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-200 dark:border-slate-700"
              title="Repor todos os setores para 0 dias"
            >
              <RotateCcw size={13} /> Repor
            </button>
          </div>
        </div>

        {/* Informative Guidance & Quick Presets Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/70 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Sliders size={14} className="text-blue-500 shrink-0" />
            <span className="text-[11px]">
              <strong>Predefinições Rápidas:</strong> Aplicar o mesmo limite a todos os setores de produção:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleApplyPresetTolerances(0)}
              className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              0 dias (Imediato)
            </button>
            <button
              type="button"
              onClick={() => handleApplyPresetTolerances(1)}
              className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              1 dia (Padrão)
            </button>
            <button
              type="button"
              onClick={() => handleApplyPresetTolerances(2)}
              className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              2 dias (Flexível)
            </button>
            <button
              type="button"
              onClick={() => handleApplyPresetTolerances(5)}
              className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              5 dias (1 Semana)
            </button>
          </div>
        </div>

        {/* Sectors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sectorsConfig.map(sec => {
            const Icon = sec.icon;
            const currentTol = (sectorTolerances as any)[sec.key] ?? 0;
            const isZero = currentTol === 0;

            return (
              <div
                key={sec.key}
                className={`p-3 rounded-xl border transition-all ${
                  isZero
                    ? 'bg-slate-50/70 dark:bg-slate-800/30 border-slate-200/80 dark:border-slate-800'
                    : 'bg-blue-50/30 dark:bg-blue-950/20 border-blue-200/80 dark:border-blue-900/50 shadow-2xs'
                }`}
              >
                {/* Sector header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs shrink-0">
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-black text-xs text-slate-800 dark:text-slate-100 truncate">
                        {sec.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                        {sec.desc}
                      </p>
                    </div>
                  </div>

                  {/* Tolerance Status Badge */}
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 border ${
                    isZero
                      ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                  }`}>
                    {isZero ? 'Imediato' : `+${currentTol}d`}
                  </span>
                </div>

                {/* Stepper Control */}
                <div className="mt-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Tolerância:
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToleranceChange(sec.key, -1)}
                      disabled={currentTol <= 0}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-2xs"
                      title="Diminuir 1 dia de tolerância"
                    >
                      <Minus size={11} />
                    </button>

                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="60"
                        value={currentTol}
                        onChange={e => handleToleranceInput(sec.key, e.target.value)}
                        className="w-12 text-center py-1 text-xs font-black bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToleranceChange(sec.key, 1)}
                      disabled={currentTol >= 60}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-2xs"
                      title="Aumentar 1 dia de tolerância"
                    >
                      <Plus size={11} />
                    </button>
                    <span className="text-[10px] text-slate-400 font-bold">dias</span>
                  </div>
                </div>

                {/* Explanation tag */}
                <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                  {isZero ? (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">⚠️ Dispara alerta no próprio dia do incumprimento.</span>
                  ) : (
                    <span className="text-blue-600 dark:text-blue-400 font-medium">🛡️ Dispara alerta após {currentTol} {currentTol === 1 ? 'dia' : 'dias'} de atraso.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderNotificationPreferencesSection = () => (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
      {/* Top Banner: Push API Status & Main Toggle */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-5 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
            <Bell size={24} />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                Notificações Push & Alertas em Tempo Real
              </h3>
              {isPushSubscribed ? (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 rounded-full font-black uppercase tracking-wider flex items-center gap-1 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle size={10} /> Push API Ativa
                </span>
              ) : notifPermission === 'granted' ? (
                <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                  Permissão Concedida
                </span>
              ) : (
                <span className="text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                  Não Subscrito
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xl">
              Utiliza a <strong>Push API</strong> e <strong>Service Workers</strong> para que os gestores recebam alertas no telemóvel sempre que eventos críticos ocorram na produção, mesmo com a aplicação em segundo plano ou fechada.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          {!isPushSubscribed ? (
            <button
              onClick={handleRequestPushPermission}
              disabled={isSubscribing}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Bell size={16} /> {isSubscribing ? 'A Ativar...' : 'Ativar Push API'}
            </button>
          ) : (
            <button
              onClick={handleTogglePushSubscription}
              disabled={isSubscribing}
              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700"
            >
              Desativar Alertas
            </button>
          )}

          <button
            onClick={handleTestUrgentPushNotification}
            className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95"
            title="Testar disparo de push urgente"
          >
            <AlertTriangle size={15} /> Testar Alerta Geral
          </button>
        </div>
      </div>

      {/* Secção de Preferências de Notificação (Notification Preferences) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl">
              <Sliders size={18} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Notification Preferences (Preferências de Notificação)
                </h4>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {[notifPreferences.dateChanges, notifPreferences.priorityChanges, notifPreferences.stoppageReasons, notifPreferences.statusChanges].filter(Boolean).length} de 4 alertas ativos
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ative ou desative os alertas push para cada tipo de evento fabril. As preferências são salvas no <strong>localStorage</strong> e persistidas na <strong>base de dados</strong> {currentUser ? `do utilizador (${currentUser.name || currentUser.username})` : 'do utilizador'}.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleEnableAllPreferences}
              className="px-2.5 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors border border-blue-200 dark:border-blue-800/60"
              title="Ativar todas as opções"
            >
              Ativar Todos
            </button>
            <button
              type="button"
              onClick={handleResetPreferences}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Repor valores predefinidos"
            >
              Repor
            </button>
          </div>
        </div>

        {/* Persistence Indicator Badge */}
        <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/40 px-3 py-2 rounded-xl border border-slate-200/70 dark:border-slate-800">
          <Check size={14} className="text-emerald-500 shrink-0" />
          <span>
            Sincronização ativa: <strong>localStorage</strong> local e <strong>Base de Dados</strong> {currentUser ? `(Utilizador: ${currentUser.name || currentUser.username})` : ''} atualizados automaticamente ao alternar qualquer preferência.
          </span>
        </div>

        {/* Grid dos Tipos de Eventos Principais */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          
          {/* 1. Alteração de Prioridade & Urgência */}
          <div className={`p-4 rounded-xl border transition-all ${
            notifPreferences.priorityChanges 
              ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 ring-1 ring-rose-500/10' 
              : 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-75'
          }`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400">
                  <AlertTriangle size={16} />
                </div>
                <div>
                  <h5 className="font-bold text-xs text-slate-800 dark:text-slate-100">
                    Prioridade & Urgência
                  </h5>
                  <span className={`text-[10px] font-black uppercase tracking-wider ${
                    notifPreferences.priorityChanges ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                  }`}>
                    {notifPreferences.priorityChanges ? 'Alertas Ativos' : 'Desativado'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={notifPreferences.priorityChanges}
                onClick={() => handleTogglePreference('priorityChanges')}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  notifPreferences.priorityChanges ? 'bg-rose-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
                title="Ativar/Desativar alertas push de prioridade"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    notifPreferences.priorityChanges ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
              Alertas em tempo real quando uma encomenda for definida como Alta Prioridade (urgente) ou tiver a sua urgência alterada.
            </p>

            <button
              type="button"
              onClick={handleTestPriorityNotification}
              disabled={!notifPreferences.priorityChanges}
              className="w-full py-1.5 px-2 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              title="Disparar notificação de teste de prioridade"
            >
              <Send size={11} /> Testar Alerta de Prioridade
            </button>
          </div>

          {/* 2. Alteração de Datas & Previsões */}
          <div className={`p-4 rounded-xl border transition-all ${
            notifPreferences.dateChanges 
              ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60 ring-1 ring-blue-500/10' 
              : 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-75'
          }`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400">
                  <Calendar size={16} />
                </div>
                <div>
                  <h5 className="font-bold text-xs text-slate-800 dark:text-slate-100">
                    Alteração de Datas
                  </h5>
                  <span className={`text-[10px] font-black uppercase tracking-wider ${
                    notifPreferences.dateChanges ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                  }`}>
                    {notifPreferences.dateChanges ? 'Alertas Ativos' : 'Desativado'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={notifPreferences.dateChanges}
                onClick={() => handleTogglePreference('dateChanges')}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  notifPreferences.dateChanges ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
                title="Ativar/Desativar alertas push de datas"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    notifPreferences.dateChanges ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
              Alertas quando a data prevista de entrega ou de qualquer setor fabril (Tecelagem, Tinturaria, Confecção) for reprogramada ou atrasada.
            </p>

            <button
              type="button"
              onClick={handleTestDateChangeNotification}
              disabled={!notifPreferences.dateChanges}
              className="w-full py-1.5 px-2 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              title="Disparar notificação de teste de alteração de data"
            >
              <Send size={11} /> Testar Alerta de Data
            </button>
          </div>

          {/* 3. Motivos de Paragem & Classificação */}
          <div className={`p-4 rounded-xl border transition-all ${
            notifPreferences.stoppageReasons 
              ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60 ring-1 ring-amber-500/10' 
              : 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-75'
          }`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400">
                  <AlertCircle size={16} />
                </div>
                <div>
                  <h5 className="font-bold text-xs text-slate-800 dark:text-slate-100">
                    Motivos de Paragem
                  </h5>
                  <span className={`text-[10px] font-black uppercase tracking-wider ${
                    notifPreferences.stoppageReasons ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                  }`}>
                    {notifPreferences.stoppageReasons ? 'Alertas Ativos' : 'Desativado'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={notifPreferences.stoppageReasons}
                onClick={() => handleTogglePreference('stoppageReasons')}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  notifPreferences.stoppageReasons ? 'bg-amber-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
                title="Ativar/Desativar alertas push de paragem"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    notifPreferences.stoppageReasons ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
              Alertas quando qualquer setor fabril registar ou alterar uma classificação ou motivo de paragem (avarias, falta de fio, aprovações).
            </p>

            <button
              type="button"
              onClick={handleTestStoppageNotification}
              disabled={!notifPreferences.stoppageReasons}
              className="w-full py-1.5 px-2 bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              title="Disparar notificação de teste de paragem"
            >
              <Send size={11} /> Testar Alerta de Paragem
            </button>
          </div>

        </div>

        {/* Opções Complementares: Conclusão, Filtro de Urgentes e Sons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          
          {/* Conclusão de Encomendas */}
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                  Conclusão de Encomenda
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  Alertar quando faturada e concluída
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifPreferences.statusChanges}
              onClick={() => handleTogglePreference('statusChanges')}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                notifPreferences.statusChanges ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  notifPreferences.statusChanges ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Filtro: Apenas Encomendas Urgentes */}
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 shrink-0">
                <Bell size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                  Apenas Urgentes
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  Filtrar apenas Prioridade Alta/Média
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifPreferences.urgentOnly}
              onClick={() => handleTogglePreference('urgentOnly')}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                notifPreferences.urgentOnly ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  notifPreferences.urgentOnly ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Sons & Vibração */}
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <div className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                <Volume2 size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                  Sons & Vibração
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  Alerta sonoro no dispositivo móvel
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifPreferences.soundEnabled}
              onClick={() => handleTogglePreference('soundEnabled')}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                notifPreferences.soundEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  notifPreferences.soundEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

        </div>
      </div>
    </div>
  );

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
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Gestão do sistema, utilizadores e preferências de alerta.</p>
          </div>
        </div>

        {/* Barra de Navegação entre Separadores de Configuração */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          {(['general', 'notifications', 'users', 'stop-reasons', 'export-columns'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabChange(tab)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                currentTab === tab
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25 ring-2 ring-blue-600/30'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              {tab === 'general' && <SettingsIcon size={14} />}
              {tab === 'notifications' && <Bell size={14} />}
              {tab === 'users' && <Users size={14} />}
              {tab === 'stop-reasons' && <AlertTriangle size={14} />}
              {tab === 'export-columns' && <Layers size={14} />}
              <span>{tabLabels[tab]}</span>
            </button>
          ))}
        </div>

        {statusMsg && (
          <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-medium">
            <CheckCircle size={16} /> {statusMsg}
          </div>
        )}
        
        {/* ===== ABA GERAL ===== */}
        {currentTab === 'general' && (
        <>
        {/* Aparência Visual */}
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
                    className={`relative shrink-0 w-16 h-8 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 ${
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

        {/* Instalar Aplicação como PWA no Telemóvel */}
        <PWAInstallButton variant="card" />

        {/* Secção de Configurações de Alertas & Tolerâncias por Sector */}
        {renderAlertToleranceSection()}

        {/* Secção de Preferências de Notificação (Notification Preferences) */}
        {renderNotificationPreferencesSection()}

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
              className={`relative shrink-0 w-16 h-8 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                keepAliveConfig.enabled ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`absolute top-1 left-1 bg-white rounded-full w-6 h-6 shadow-md transform transition-transform duration-300 flex items-center justify-center ${
                  keepAliveConfig.enabled ? 'translate-x-8' : 'translate-x-0'
                }`}
              >
                 {keepAliveConfig.enabled ? <Activity size={12} className="text-blue-600"/> : <Moon size={12} className="text-slate-400"/>}
              </span>
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

        {/* ===== ABA CONFIGURAÇÕES DE ALERTAS & NOTIFICAÇÕES (DEDICADA) ===== */}
        {currentTab === 'notifications' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {renderAlertToleranceSection()}
            {renderNotificationPreferencesSection()}
          </div>
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
