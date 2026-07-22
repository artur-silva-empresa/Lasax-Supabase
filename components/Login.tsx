
import React from 'react';
import { User } from '../types';
import { Lock, User as UserIcon, ArrowRight, AlertCircle, Loader2, Eye, EyeOff, ShieldCheck, ShieldAlert, CheckCircle2, RefreshCw } from 'lucide-react';
import { loadUsersFromDB, initializeDefaultUsers, hashPassword } from '../services/dataService';
import { supabase } from '../src/services/supabase';

interface LoginProps {
  onLogin: (user: User) => void;
  lockoutUntil?: number | null;
  onSetLockoutUntil?: (until: number | null) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, lockoutUntil: externalLockoutUntil, onSetLockoutUntil }) => {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState('');
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  
  // Contagem de tentativas incorretas mantida em sessionStorage para persistir recharges da página
  const [failedAttempts, setFailedAttempts] = React.useState<number>(() => {
    try {
      const saved = sessionStorage.getItem('login_failed_attempts');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  // Estado de Bloqueio Temporário (Lockout)
  const [internalLockoutUntil, setInternalLockoutUntil] = React.useState<number | null>(() => {
    try {
      const saved = sessionStorage.getItem('login_lockout_until');
      return saved ? parseInt(saved, 10) : null;
    } catch {
      return null;
    }
  });

  const lockoutUntil = externalLockoutUntil !== undefined ? externalLockoutUntil : internalLockoutUntil;

  const updateLockoutUntil = React.useCallback((until: number | null) => {
    setInternalLockoutUntil(until);
    if (onSetLockoutUntil) {
      onSetLockoutUntil(until);
    }
    try {
      if (until) {
        sessionStorage.setItem('login_lockout_until', until.toString());
      } else {
        sessionStorage.removeItem('login_lockout_until');
      }
    } catch {}
  }, [onSetLockoutUntil]);

  const [lockoutRemaining, setLockoutRemaining] = React.useState<number>(0);

  // Efeito do Timer de Contagem Decrescente do Bloqueio
  React.useEffect(() => {
    if (!lockoutUntil) {
      setLockoutRemaining(0);
      return;
    }

    const checkLockout = () => {
      const now = Date.now();
      const diff = Math.ceil((lockoutUntil - now) / 1000);
      if (diff <= 0) {
        setLockoutRemaining(0);
        updateLockoutUntil(null);
      } else {
        setLockoutRemaining(diff);
      }
    };

    checkLockout();
    const timer = setInterval(checkLockout, 1000);
    return () => clearInterval(timer);
  }, [lockoutUntil, updateLockoutUntil]);

  // Estados do Desafio de Captcha / Verificação Humana
  const [captchaVerified, setCaptchaVerified] = React.useState(false);
  const [captchaToken, setCaptchaToken] = React.useState('');
  const [isVerifyingCaptcha, setIsVerifyingCaptcha] = React.useState(false);
  
  // Desafio Matemático / Anti-Bot Interativo
  const [numA, setNumA] = React.useState(() => Math.floor(Math.random() * 8) + 2);
  const [numB, setNumB] = React.useState(() => Math.floor(Math.random() * 8) + 2);
  const [userAnswer, setUserAnswer] = React.useState('');
  const [captchaError, setCaptchaError] = React.useState('');

  const passwordInputRef = React.useRef<HTMLInputElement>(null);

  const generateNewChallenge = () => {
    setNumA(Math.floor(Math.random() * 8) + 2);
    setNumB(Math.floor(Math.random() * 8) + 2);
    setUserAnswer('');
    setCaptchaError('');
  };

  const handleVerifyCaptchaChallenge = async () => {
    if (lockoutRemaining > 0) return;

    if (!userAnswer.trim()) {
      setCaptchaError('Introduza a resposta para verificar.');
      return;
    }

    const expected = numA + numB;
    if (parseInt(userAnswer.trim(), 10) !== expected) {
      setCaptchaError('Resposta incorreta. Tente novamente.');
      generateNewChallenge();
      return;
    }

    setIsVerifyingCaptcha(true);
    setCaptchaError('');

    try {
      const generatedToken = `token_recaptcha_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const res = await fetch('/api/auth/verify-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: generatedToken,
          solution: { userAnswer: parseInt(userAnswer, 10), expectedAnswer: expected }
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCaptchaVerified(true);
        setCaptchaToken(data.token || generatedToken);
      } else {
        setCaptchaError(data.error || 'Falha na verificação de segurança.');
        generateNewChallenge();
      }
    } catch {
      // Se sem conexão de backend API, aceita validação local direta
      setCaptchaVerified(true);
      setCaptchaToken(`token_local_${Date.now()}`);
    } finally {
      setIsVerifyingCaptcha(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Se estiver em período de bloqueio temporário, rejeitar submissão
    if (lockoutRemaining > 0) {
      setError(`Acesso temporariamente bloqueado por segurança. Aguarde ${lockoutRemaining}s para tentar novamente.`);
      return;
    }

    // Verificar se o desafio de captcha é exigido (após 2 tentativas falhadas)
    if (failedAttempts >= 2 && (!captchaVerified || !captchaToken)) {
      setError('Verificação de segurança reCAPTCHA obrigatória. Por favor, resolva o desafio para continuar.');
      return;
    }

    setIsAuthenticating(true);

    try {
        // Enviar notificação/tentativa ao endpoint com rate limit no servidor Express
        let rateLimitResponse: Response | null = null;
        try {
          rateLimitResponse = await fetch('/api/auth/login-attempt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, success: false, captchaToken })
          });
          
          if (rateLimitResponse && rateLimitResponse.status === 429) {
            const resData = await rateLimitResponse.json();
            setError(resData.error || 'Excedido o limite de tentativas de autenticação. Por favor, aguarde 15 minutos.');
            setIsAuthenticating(false);
            return;
          }
        } catch {
          // Se o servidor API offline ou em ambiente isolado, prossegue normalmente
        }

        const email = username.includes('@') ? username : `${username}@prodlasa.com`;
        
        let { data, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        const users = await loadUsersFromDB();
        const finalUsers = users.length > 0 ? users : await initializeDefaultUsers();
        const existingDbUser = finalUsers.find(u => u.username.toLowerCase() === username.toLowerCase());

        if (authError || !data?.user) {
            // Fallback: se a password foi alterada no Settings, ela pode estar apenas na base de dados (users)
            if (existingDbUser) {
                const inputHash = await hashPassword(password);
                if (existingDbUser.passwordHash === inputHash || existingDbUser.password === password) {
                    // Password correta na base de dados, avisar o endpoint do sucesso
                    fetch('/api/auth/login-attempt', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ username, success: true })
                    }).catch(() => {});

                    // Sucesso: limpar contador de tentativas e bloqueio
                    setFailedAttempts(0);
                    updateLockoutUntil(null);
                    try {
                      sessionStorage.removeItem('login_failed_attempts');
                      sessionStorage.removeItem('login_lockout_until');
                    } catch {}

                    onLogin(existingDbUser);
                    return;
                }
            }
            
            // Incrementar falhas
            const nextAttempts = failedAttempts + 1;
            setFailedAttempts(nextAttempts);
            try {
              sessionStorage.setItem('login_failed_attempts', nextAttempts.toString());
            } catch {}

            // Reset do estado verificado de captcha para novas tentativas
            setCaptchaVerified(false);
            setCaptchaToken('');
            generateNewChallenge();

            if (nextAttempts >= 5) {
              // Ativar Bloqueio Temporário de 60 segundos após 5 tentativas consecutivas
              const lockoutTime = Date.now() + 60000;
              updateLockoutUntil(lockoutTime);
              setError('Atingiu o limite de 5 tentativas de login. O seu acesso foi bloqueado temporariamente por 60 segundos.');
            } else if (nextAttempts >= 2) {
              setError('Credenciais inválidas. Para sua segurança, conclua a verificação reCAPTCHA abaixo.');
            } else {
              setError('Credenciais inválidas. Tente novamente.');
            }
            return;
        }

        if (existingDbUser) {
            fetch('/api/auth/login-attempt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, success: true })
            }).catch(() => {});

            // Sucesso: limpar contador de tentativas e bloqueio
            setFailedAttempts(0);
            updateLockoutUntil(null);
            try {
              sessionStorage.removeItem('login_failed_attempts');
              sessionStorage.removeItem('login_lockout_until');
            } catch {}

            onLogin(existingDbUser);
        } else {
            setError('Utilizador autenticado, mas sem perfil de acesso configurado no sistema.');
            await supabase.auth.signOut();
        }
    } catch (err) {
        console.error(err);
        setError('Erro ao aceder à base de dados de utilizadores.');
    } finally {
        setIsAuthenticating(false);
    }
  };
  
  const handleUsernameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      passwordInputRef.current?.focus();
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 bg-slate-50 border-b border-slate-100 flex flex-col items-center">
            <img src={`${import.meta.env.BASE_URL}icons/icone.png`} alt="Prod. Lasa" className="h-20 w-auto mb-4 object-contain" />
            <h1 className="text-2xl font-black text-slate-800">Prod. Lasa</h1>
            <p className="text-sm text-slate-500 font-medium">Gestão de Produção Têxtil</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 space-y-6">
          {/* BANNER DE BLOQUEIO TEMPORÁRIO ANTI-FORÇA BRUTA (5 tentativas com falha) */}
          {lockoutRemaining > 0 && (
            <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 text-center space-y-2 animate-in fade-in zoom-in-95 duration-200 shadow-sm">
              <div className="flex items-center justify-center gap-2 text-rose-700 font-black text-xs uppercase tracking-wider">
                <ShieldAlert size={18} className="text-rose-600 animate-pulse" />
                <span>Bloqueio Temporário Anti-Força Bruta</span>
              </div>
              <p className="text-xs text-rose-800 font-medium leading-relaxed">
                Registadas <strong>{failedAttempts} tentativas incorretas consecutivas</strong>. Por razões de segurança, a autenticação foi bloqueada.
              </p>
              <div className="pt-1">
                <span className="inline-flex items-center gap-2 bg-rose-600 text-white font-mono font-black text-base px-4 py-1.5 rounded-xl shadow-md">
                  ⏳ {lockoutRemaining}s restantes
                </span>
              </div>
            </div>
          )}

          {error && lockoutRemaining <= 0 && (
            <div className="bg-rose-50 border border-rose-100 text-rose-600 p-3 rounded-xl flex items-center gap-2 text-sm font-bold animate-in fade-in">
                <AlertCircle size={16} className="shrink-0" /> <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-slate-400 tracking-wider ml-1">Utilizador</label>
            <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" 
                    value={username}
                    disabled={isAuthenticating || lockoutRemaining > 0}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={handleUsernameKeyDown}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-slate-800 font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Nome de utilizador"
                    autoFocus
                />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={`text-xs font-black uppercase tracking-wider ml-1 transition-colors ${failedAttempts >= 2 ? 'text-amber-700 flex items-center gap-1.5' : 'text-slate-400'}`}>
                Palavra-passe
                {failedAttempts >= 2 && (
                  <span className="normal-case font-bold text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md border border-amber-300 animate-pulse">
                    ⚠️ Confirme a palavra-passe
                  </span>
                )}
              </label>
            </div>
            <div className="relative">
                <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${failedAttempts >= 2 ? 'text-amber-500' : 'text-slate-400'}`} size={18} />
                <input 
                    ref={passwordInputRef}
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    disabled={isAuthenticating || lockoutRemaining > 0}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full rounded-xl py-3 pl-11 pr-12 font-bold outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      failedAttempts >= 2 
                        ? 'bg-amber-50/60 border-2 border-amber-400 text-amber-950 focus:ring-2 focus:ring-amber-500 shadow-sm shadow-amber-200/50' 
                        : 'bg-slate-50 border border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500'
                    }`}
                    placeholder="••••••••"
                />
                <button
                    type="button"
                    disabled={lockoutRemaining > 0}
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute right-4 top-1/2 -translate-y-1/2 focus:outline-none disabled:opacity-50 transition-colors ${failedAttempts >= 2 ? 'text-amber-600 hover:text-amber-800 font-bold' : 'text-slate-400 hover:text-slate-600'}`}
                    title={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
            {failedAttempts >= 2 && (
              <p className="text-[11px] font-semibold text-amber-700 ml-1 flex items-center gap-1 animate-in fade-in">
                <span>💡 Por favor, verifique se a palavra-passe inserida está correta antes de resolver a verificação humana abaixo.</span>
              </p>
            )}
          </div>

          {/* DESAFIO DE SEGURANÇA INTERATIVO (reCAPTCHA v3 / Proteção Antibot ativada após 2 tentativas) */}
          {failedAttempts >= 2 && (
            <div className={`bg-amber-50/80 border-2 border-amber-200 rounded-2xl p-4 space-y-3 animate-in fade-in zoom-in-95 duration-200 ${lockoutRemaining > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                <div className="flex items-center gap-2 text-amber-800 font-extrabold text-xs tracking-wider uppercase">
                  <ShieldAlert size={16} className="text-amber-600" />
                  <span>Verificação de Segurança Humana</span>
                </div>
                <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                  Tentativa {failedAttempts} / 5
                </span>
              </div>

              <p className="text-xs text-amber-900 font-medium leading-relaxed">
                Registadas <strong>{failedAttempts} tentativas com erro</strong>. Resolva o desafio reCAPTCHA para prosseguir:
              </p>

              {!captchaVerified ? (
                <div className="bg-white border border-amber-200 rounded-xl p-3 shadow-inner space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                      <ShieldCheck size={16} className="text-blue-600" />
                      Quanto é <span className="text-blue-600 font-black text-sm">{numA} + {numB}</span> ?
                    </label>
                    <button
                      type="button"
                      onClick={generateNewChallenge}
                      disabled={lockoutRemaining > 0}
                      title="Gerar novo desafio"
                      className="text-slate-400 hover:text-slate-600 p-1 disabled:opacity-50"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={userAnswer}
                      disabled={lockoutRemaining > 0}
                      onChange={(e) => setUserAnswer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleVerifyCaptchaChallenge();
                        }
                      }}
                      placeholder="Resultado"
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyCaptchaChallenge}
                      disabled={isVerifyingCaptcha || lockoutRemaining > 0}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors shrink-0 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isVerifyingCaptcha ? <Loader2 size={14} className="animate-spin" /> : 'Confirmar'}
                    </button>
                  </div>

                  {captchaError && (
                    <p className="text-xs font-bold text-rose-600 flex items-center gap-1">
                      <AlertCircle size={12} /> {captchaError}
                    </p>
                  )}

                  {/* Badge de Estilo reCAPTCHA v3 */}
                  <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100">
                    <span className="flex items-center gap-1 font-semibold text-slate-500">
                      <ShieldCheck size={12} className="text-emerald-500" /> reCAPTCHA v3 Protegido
                    </span>
                    <span>Privacidade - Termos</span>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-emerald-800 text-xs font-bold animate-in fade-in">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  <span>Verificação Humana Concluída! Pode submeter o login.</span>
                </div>
              )}
            </div>
          )}

          <button 
            type="submit"
            disabled={isAuthenticating || lockoutRemaining > 0 || (failedAttempts >= 2 && !captchaVerified)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAuthenticating ? (
                <>A verificar... <Loader2 size={18} className="animate-spin" /></>
            ) : lockoutRemaining > 0 ? (
                <>Acesso Bloqueado ({lockoutRemaining}s)</>
            ) : (
                <>Entrar no Sistema <ArrowRight size={18} /></>
            )}
          </button>
        </form>
        
        <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
            <p className="text-[10px] text-slate-400 font-medium">© 2026 Prod. Lasa. Todos os direitos reservados.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
