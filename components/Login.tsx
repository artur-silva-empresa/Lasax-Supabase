
import React from 'react';
import { User } from '../types';
import { Lock, User as UserIcon, ArrowRight, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { loadUsersFromDB, initializeDefaultUsers, hashPassword } from '../services/dataService';
import { supabase } from '../src/services/supabase';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState('');
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  
  const passwordInputRef = React.useRef<HTMLInputElement>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsAuthenticating(true);

    try {
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
            // e não no Supabase Auth (pois não temos Service Role Key para alterar passwords de outros).
            if (existingDbUser) {
                const inputHash = await hashPassword(password);
                if (existingDbUser.passwordHash === inputHash || existingDbUser.password === password) {
                    // Password correta na base de dados, fazer login mesmo sem Supabase Auth
                    onLogin(existingDbUser);
                    return;
                }
            }
            
            setError('Credenciais inválidas. Tente novamente.');
            return;
        }

        if (existingDbUser) {
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
          {error && (
            <div className="bg-rose-50 border border-rose-100 text-rose-600 p-3 rounded-xl flex items-center gap-2 text-sm font-bold animate-in fade-in">
                <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-slate-400 tracking-wider ml-1">Utilizador</label>
            <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={handleUsernameKeyDown}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-slate-800 font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="Nome de utilizador"
                    autoFocus
                />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-slate-400 tracking-wider ml-1">Palavra-passe</label>
            <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    ref={passwordInputRef}
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-12 text-slate-800 font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="••••••••"
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
          </div>

          <button 
            type="submit"
            disabled={isAuthenticating}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAuthenticating ? (
                <>A verificar... <Loader2 size={18} className="animate-spin" /></>
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
