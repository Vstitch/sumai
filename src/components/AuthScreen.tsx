import React, { useState } from 'react';
import { auth } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { Sparkles, Mail, Lock, User, RefreshCw, AlertTriangle } from 'lucide-react';

interface AuthScreenProps {
  onAuthSuccess: (bypassUser?: any) => void;
}

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorText('Please enter both your email address and password.');
      return;
    }
    if (!isLogin && !displayName.trim()) {
      setErrorText('Please specify your name to create an account.');
      return;
    }
    setErrorText('');
    setIsLoading(true);

    try {
      if (isLogin) {
        // Sign in
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // Signup
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (cred.user) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
      }
      onAuthSuccess();
    } catch (err: any) {
      console.error("Auth error:", err);
      let msg = err.message || 'An error occurred during credentials validation.';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        msg = 'Invalid email or password combination.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'This email address is already registered.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters long.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'The email address is formatted incorrectly.';
      } else if (err.code === 'auth/operation-not-allowed') {
        msg = 'Email/Password login is not enabled in your Firebase project. Please enable it in Firebase Console -> Authentication -> Sign-in Method, or click "Enter as Local Guest" below to bypass immediately.';
      }
      setErrorText(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setErrorText('');
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      onAuthSuccess();
    } catch (err: any) {
      console.error("Google Auth error:", err);
      let msg = err.message || 'Cancelled or blocked Google sign in popup.';
      if (err.code === 'auth/unauthorized-domain' || (err.message && err.message.includes('unauthorized-domain'))) {
        msg = 'Google Calendar / Account Authentication is restricted on this domain (e.g. sumaii.netlify.app or local proxy) because the domain hasn\'t been authorized in your Firebase console under Authentication -> Settings -> Authorized Domains. To bypass, please use the Email & Password form above or click "Enter as Local Guest" below!';
      }
      setErrorText(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocalGuestAccess = () => {
    setErrorText('');
    const guestUser = {
      uid: 'rez_offline_guest',
      email: 'guest@rez.ai',
      displayName: 'Workspace Guest'
    };
    localStorage.setItem('rez_offline_user', JSON.stringify(guestUser));
    onAuthSuccess(guestUser);
  };

  return (
    <div className="min-h-screen bg-[#F8F7F4] flex flex-col items-center justify-center p-6 selection:bg-[#1A1A1A]/10">
      
      {/* Decorative Brand Card */}
      <div className="w-full max-w-md bg-white border border-[#E5E5E1] rounded-3xl p-8 shadow-sm relative overflow-hidden">
        
        {/* Subtle top indicator bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#1A1A1A]" />

        {/* Content */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 bg-[#1A1A1A] text-white rounded-2xl flex items-center justify-center mb-4 shadow-sm">
            <span className="font-serif text-xl font-bold tracking-tighter">R</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-[#1A1A1A] font-serif mb-1.5">REZ AI</h2>
          <p className="text-xs font-semibold text-[#71716A] uppercase tracking-widest max-w-[280px] leading-relaxed">
            Universal Meeting Intelligence Log & Minutes Engine
          </p>
        </div>

        {errorText && (
          <div className="mb-6 bg-red-50 border border-red-100 p-3.5 rounded-xl text-xs text-red-900 flex items-start gap-2.5 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-red-650 shrink-0 mt-0.5" />
            <span>{errorText}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* User Display Name (Only during registration) */}
          {!isLogin && (
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-[#71716A] tracking-wider block">Your Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 w-4 h-4 text-[#71716A]/60" />
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-[#F8F7F4] border border-[#E5E5E1] hover:border-[#1A1A1A]/30 focus:border-[#1A1A1A] focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#1A1A1A] transition focus:outline-none"
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          {/* Email Address */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-[#71716A] tracking-wider block">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 w-4 h-4 text-[#71716A]/60" />
              <input
                type="email"
                required
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#F8F7F4] border border-[#E5E5E1] hover:border-[#1A1A1A]/30 focus:border-[#1A1A1A] focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#1A1A1A] transition focus:outline-none"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-[#71716A] tracking-wider block">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 w-4 h-4 text-[#71716A]/60" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#F8F7F4] border border-[#E5E5E1] hover:border-[#1A1A1A]/30 focus:border-[#1A1A1A] focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#1A1A1A] transition focus:outline-none"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#1A1A1A] hover:bg-black text-white py-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{isLogin ? 'Sign In to Workspace' : 'Create Intelligence Account'}</span>
          </button>
        </form>

        <div className="relative my-6 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#E5E5E1]"></div>
          </div>
          <span className="relative bg-white px-3 text-[10px] uppercase font-bold tracking-wider text-[#71716A]">Or Continue With</span>
        </div>

        {/* Google Authentication popup wrapper */}
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={isLoading}
          className="w-full bg-white hover:bg-[#F8F7F4] text-[#1A1A1A] border border-[#E5E5E1] py-2.5 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M12 5.04c1.67 0 3.14.58 4.31 1.71l3.22-3.22C17.58 1.71 15.01 1 12 1 7.35 1 3.51 3.84 2.1 7.97l3.87 3a6.98 6.98 0 0 1 6.03-5.93z"
            />
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.82-.07-1.61-.21-2.38H12v4.51h6.43a5.52 5.52 0 0 1-2.4 3.63l3.72 2.89c2.18-2.01 3.74-4.97 3.74-8.65z"
            />
            <path
              fill="#FBBC05"
              d="M5.97 14.17A7.02 7.02 0 0 1 5.5 12c0-.76.13-1.49.36-2.17l-3.87-3c-.83 1.62-1.3 3.44-1.3 5.37s.47 3.75 1.3 5.37l3.98-3.2z"
            />
            <path
              fill="#34A853"
              d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.72-2.89a6.97 6.97 0 0 1-10.27-3.83l-3.98 3.2C3.51 20.16 7.35 23 12 23z"
            />
          </svg>
          <span>Identity Access (Google Auth)</span>
        </button>

        {/* Failsafe Local Guest Option */}
        <button
          type="button"
          onClick={handleLocalGuestAccess}
          className="w-full mt-3 bg-[#F8F7F4] hover:bg-[#E5E5E1] text-[#1A1A1A] border border-[#E5E5E1] py-2.5 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <User className="w-4 h-4 text-[#71716A]" />
          <span>Enter as Local Guest (No Cloud Setup)</span>
        </button>
        <p className="text-[10px] text-[#71716A] text-center mt-1.5 leading-normal">
          Failsafe offline mode. Ideal for localhost, Netlify setups, or restricted credentials.
        </p>

        <div className="mt-6 pt-4 border-t border-[#E5E5E1] text-center">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setErrorText('');
            }}
            className="text-xs text-[#71716A] hover:text-[#1A1A1A] font-semibold transition"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
          </button>
        </div>

      </div>

      {/* Humble footnote */}
      <span className="text-[10px] uppercase font-bold text-[#71716A]/50 tracking-widest mt-6">
        Secure Zero-Trust Session Encryption
      </span>
    </div>
  );
}
