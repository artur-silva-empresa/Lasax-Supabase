import React, { useState } from 'react';
import { Smartphone, Download, CheckCircle2, Share2, PlusSquare, X, ArrowUpRight, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'menu-item' | 'card' | 'compact-button';
  className?: string;
  onInstalled?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'compact-button',
  className = '',
  onInstalled
}) => {
  const { isInstallable, isInstalled, isIOS, isMobile, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const handleInstallClick = async () => {
    if (isInstalled) {
      setFeedbackMsg('A aplicação já se encontra instalada no seu dispositivo!');
      setTimeout(() => setFeedbackMsg(''), 3500);
      return;
    }

    if (isIOS) {
      setShowGuideModal(true);
      return;
    }

    if (isInstallable) {
      const outcome = await install();
      if (outcome === 'accepted') {
        setFeedbackMsg('Instalação concluída com sucesso!');
        setTimeout(() => setFeedbackMsg(''), 4000);
        if (onInstalled) onInstalled();
      } else if (outcome === 'dismissed') {
        setFeedbackMsg('Instalação cancelada pelo utilizador.');
        setTimeout(() => setFeedbackMsg(''), 3000);
      }
    } else {
      // Se o navegador não disparou o prompt nativo (ou já foi dispensado), abre guia explicativo
      setShowGuideModal(true);
    }
  };

  // Render do Modal de Instruções (iOS ou Instrução Manual Android/Chrome)
  const renderGuideModal = () => {
    if (!showGuideModal) return null;

    return (
      <div 
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => setShowGuideModal(false)}
      >
        <div 
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-slate-800 dark:text-slate-100 animate-in zoom-in-95 duration-200"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => setShowGuideModal(false)}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-800">
              <Smartphone size={24} />
            </div>
            <div>
              <h3 className="font-black text-lg text-slate-900 dark:text-white">
                Instalar no Dispositivo Móvel
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Aceda como uma App nativa (PWA) no seu smartphone
              </p>
            </div>
          </div>

          {isIOS ? (
            <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Siga estes 3 passos simples no <strong>Safari do iPhone / iPad</strong>:
              </p>

              <div className="space-y-3 bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                    1
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100">Toque no botão de Partilha</span>
                    <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                      Ícone <Share2 size={12} className="inline text-blue-500" /> na barra de ferramentas inferior do Safari.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                    2
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100">Adicionar ao Ecrã Principal</span>
                    <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                      Deslize o menu para baixo e selecione <PlusSquare size={12} className="inline text-slate-600 dark:text-slate-300" /> "Ecrã Principal".
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                    3
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100">Confirmar com "Adicionar"</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Toque em "Adicionar" no canto superior direito para fixar a app no seu telemóvel.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Para instalar no <strong>Android / Google Chrome</strong>:
              </p>

              <div className="space-y-3 bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                    1
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100">Abra o menu do navegador</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Toque nos <strong>3 pontos</strong> no canto superior direito do Chrome.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                    2
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100">Selecione "Instalar aplicação"</span>
                    <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                      Ou <Download size={12} className="inline text-blue-500" /> "Adicionar ao ecrã principal".
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              onClick={() => setShowGuideModal(false)}
              className="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold px-4 py-2 rounded-xl text-xs transition-colors"
            >
              Compreendi
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 1. Variante Item de Menu (para o menu de Configurações no sidebar e drawer mobile)
  if (variant === 'menu-item') {
    return (
      <>
        <button
          onClick={handleInstallClick}
          className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all text-xs font-semibold group ${
            isInstalled
              ? 'text-emerald-400 bg-emerald-950/20 hover:bg-emerald-950/30 border border-emerald-900/30'
              : 'text-slate-300 hover:text-white hover:bg-slate-800 border border-transparent'
          } ${className}`}
          title="Instalar Prod. Lasa como PWA no telemóvel"
        >
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${isInstalled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-600/20 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors'}`}>
              {isInstalled ? <CheckCircle2 size={14} /> : <Smartphone size={14} />}
            </div>
            <div className="text-left">
              <span className="block font-bold">
                {isInstalled ? 'PWA Instalada ✓' : 'Instalar no Telemóvel'}
              </span>
              <span className="block text-[10px] text-slate-400 font-normal">
                {isInstalled ? 'Em execução nativa' : 'PWA com alertas push'}
              </span>
            </div>
          </div>

          {!isInstalled && (
            <Download size={14} className="text-slate-400 group-hover:text-blue-400 transition-colors" />
          )}
        </button>
        {renderGuideModal()}
      </>
    );
  }

  // 2. Variante Card Grande (para a página de Configurações / Geral)
  if (variant === 'card') {
    return (
      <>
        <div className={`bg-gradient-to-br from-blue-900/10 via-white to-slate-50 dark:from-blue-950/20 dark:via-slate-900 dark:to-slate-900 p-6 rounded-2xl border border-blue-200/60 dark:border-blue-900/40 shadow-sm relative overflow-hidden ${className}`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-600/20">
                <Smartphone size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Instalar Aplicação como PWA
                  </h3>
                  {isInstalled ? (
                    <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 size={11} /> Instalada
                    </span>
                  ) : (
                    <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                      PWA Móvel
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                  {isInstalled 
                    ? 'A aplicação está a correr no modo PWA Standalone com suporte total a notificações push em segundo plano.'
                    : 'Instale a plataforma diretamente no ecrã principal do seu smartphone (Android ou iPhone) para receber alertas de encomendas urgentes em tempo real mesmo com a aplicação fechada.'
                  }
                </p>
              </div>
            </div>

            <div className="w-full sm:w-auto shrink-0 flex flex-col gap-2">
              <button
                onClick={handleInstallClick}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 ${
                  isInstalled
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 active:scale-95'
                }`}
              >
                {isInstalled ? (
                  <>
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    Aplicação Instalada
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Instalar no Telemóvel
                  </>
                )}
              </button>
              
              {feedbackMsg && (
                <p className="text-[11px] text-center text-blue-600 dark:text-blue-400 font-semibold animate-in fade-in">
                  {feedbackMsg}
                </p>
              )}
            </div>
          </div>

          {/* Vantagens da PWA */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-slate-100 dark:border-slate-800/80 text-xs">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Sparkles size={14} className="text-amber-500 shrink-0" />
              <span>Acesso instantâneo sem barra de endereço</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
              <span>Alertas push mesmo com app em segundo plano</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <ArrowUpRight size={14} className="text-blue-500 shrink-0" />
              <span>Interface adaptada ao ecrã inteiro</span>
            </div>
          </div>
        </div>

        {renderGuideModal()}
      </>
    );
  }

  // 3. Variante Compact Button
  return (
    <>
      <button
        onClick={handleInstallClick}
        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
          isInstalled
            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        } ${className}`}
        title="Instalar PWA no Telemóvel"
      >
        {isInstalled ? <CheckCircle2 size={14} /> : <Download size={14} />}
        <span>{isInstalled ? 'PWA Instalada' : 'Instalar PWA'}</span>
      </button>

      {renderGuideModal()}
    </>
  );
};
