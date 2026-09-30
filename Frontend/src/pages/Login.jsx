import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, CheckCircle2, AtSign, Key, ShieldCheck } from 'lucide-react';
import { authApi, setSession, clearSession, getUser } from '../api/client';

// ─────────────────────────────────────────────────────────────────────────────
// Sales HEAD login. Same layout as the original Nexus CRM login, but the role is
// LOCKED to "Sales Head": the "Select Role" dropdown is removed and the role is
// shown as a fixed default. Amber accent. Auth/OTP/validation unchanged.
// ─────────────────────────────────────────────────────────────────────────────
const APP_ROLE = 'Sales Head';
const ACCENT = '#4F46E5';        // indigo-600
const ACCENT_DARK = '#4338CA';   // indigo-700
const ACCENT_SHADOW = 'rgba(79,70,229,0.25)';
const HERO_FROM = '#EFF6FF';
const HERO_TO = '#DBEAFE';
const HERO_BORDER = 'rgba(191,219,254,0.4)';

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [forgotStep, setForgotStep] = useState(0);
  const [forgotEmail, setForgotEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [blockedMsg, setBlockedMsg] = useState('');
  const [showForgotInfo, setShowForgotInfo] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('loggedout') === '1') { clearSession(); return; }
    const authed = localStorage.getItem('crm_authenticated') === 'true' && !!localStorage.getItem('crm_token');
    if (authed && getUser()?.role === APP_ROLE) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const flash = (msg, isError = false) => { setError(isError ? msg : ''); setNotice(isError ? '' : msg); };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError(''); setNotice('');
    if (!email || !password) { setError('Please fill in all fields'); return; }
    try {
      const data = await authApi.login(APP_ROLE, email, password);
      if (data.user?.role && data.user.role !== APP_ROLE) {
        clearSession();
        setBlockedMsg('This portal is for the Sales Head only. Please use your role’s application.');
        return;
      }
      setSession(data.token, data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (/deactivat/i.test(err.message || '')) {
        clearSession();
        setBlockedMsg(err.message || 'Your account has been deactivated.');
      } else {
        setError(err.message || 'Invalid email or password');
      }
    }
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError(''); setNotice('');
    if (!forgotEmail) { setError('Please enter your email ID'); return; }
    try {
      const data = await authApi.forgotPassword(forgotEmail);
      flash(data.devOtp ? `OTP Sent! Your verification code is ${data.devOtp}` : 'OTP sent to your email!');
      setForgotStep(2);
    } catch (err) { setError(err.message); }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError(''); setNotice('');
    if (!otpCode) { setError('Please enter the verification OTP'); return; }
    try {
      await authApi.verifyOtp(forgotEmail, otpCode);
      flash('OTP verified successfully!');
      setForgotStep(3);
    } catch (err) { setError(err.message); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError(''); setNotice('');
    if (!newPassword || !confirmPassword) { setError('Please fill in all password fields'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match!'); return; }
    try {
      await authApi.resetPassword(forgotEmail, otpCode, newPassword);
      flash('Password has been reset successfully!');
      setPassword(newPassword);
      setEmail(forgotEmail);
      setForgotStep(0);
      setForgotEmail(''); setOtpCode(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) { setError(err.message); }
  };

  const labelStyle = { display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem' };
  const inputStyle = {
    width: '100%', padding: '0.75rem 2.5rem 0.75rem 1rem', borderRadius: '0.5rem',
    border: '1px solid #CBD5E1', outline: 'none', fontSize: '0.875rem', color: '#0F172A', transition: 'border-color 0.2s',
  };
  const onFocus = (e) => (e.target.style.borderColor = ACCENT);
  const onBlur = (e) => (e.target.style.borderColor = '#CBD5E1');
  const btnStyle = {
    backgroundColor: ACCENT, color: '#FFFFFF', border: 'none', borderRadius: '0.5rem', padding: '0.875rem',
    fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', transition: 'background-color 0.2s',
    boxShadow: `0 4px 12px ${ACCENT_SHADOW}`, marginTop: '0.5rem',
  };
  const btnOver = (e) => (e.target.style.backgroundColor = ACCENT_DARK);
  const btnOut = (e) => (e.target.style.backgroundColor = ACCENT);
  const linkStyle = { color: ACCENT, textDecoration: 'none', fontWeight: 600 };

  const Feedback = () => (
    <>
      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', padding: '0.7rem 0.9rem', borderRadius: '0.5rem', fontSize: '0.82rem', marginBottom: '1rem' }}>{error}</div>}
      {notice && <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857', padding: '0.7rem 0.9rem', borderRadius: '0.5rem', fontSize: '0.82rem', marginBottom: '1rem' }}>{notice}</div>}
    </>
  );

  return (
    <div className="login-page-wrapper" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#F8FAFC', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @media (min-width: 1024px) {
          .login-page-wrapper { height: 100vh !important; min-height: 100vh !important; overflow: hidden !important; }
          .login-container { padding: 1rem 1.5rem !important; max-height: calc(100vh - 60px) !important; }
          .login-grid { gap: 2.5rem !important; }
          .left-hero-card { padding: 1.75rem 2.25rem !important; gap: 1.15rem !important; }
          .hero-title { font-size: 2rem !important; }
          .hero-image-container { aspect-ratio: 1.45 !important; max-height: 280px !important; }
          .right-login-card { padding: 2rem !important; }
          .right-login-card-header { margin-bottom: 1.25rem !important; }
        }
      `}</style>

      {blockedMsg && (
        <div onClick={() => setBlockedMsg('')} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: '420px', borderRadius: '16px', padding: '2rem', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <Lock size={26} color="#DC2626" />
            </div>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>Access Blocked</h3>
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.95rem', color: '#64748B', lineHeight: 1.5 }}>{blockedMsg}</p>
            <button onClick={() => setBlockedMsg('')} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: '10px', padding: '0.7rem 1.75rem', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer' }}>OK</button>
          </div>
        </div>
      )}

      {showForgotInfo && (
        <div onClick={() => setShowForgotInfo(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: '440px', borderRadius: '16px', padding: '2rem', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <Key size={26} color={ACCENT} />
            </div>
            <h3 style={{ margin: '0 0 0.6rem', fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>Password Change Request</h3>
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.95rem', color: '#64748B', lineHeight: 1.6 }}>For security purposes, password changes are managed by the Sales Head. Please contact your Sales Head to request a password change.</p>
            <button onClick={() => setShowForgotInfo(false)} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: '10px', padding: '0.7rem 2rem', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer' }}>OK</button>
          </div>
        </div>
      )}

      <div className="login-container" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
        <div className="login-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2.5rem', width: '100%', alignItems: 'center' }}>

          <div className="left-hero-card" style={{ background: `linear-gradient(135deg, ${HERO_FROM} 0%, ${HERO_TO} 100%)`, border: `1px solid ${HERO_BORDER}`, borderRadius: '1.5rem', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 4px 20px -2px rgba(191,219,254,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                  <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1E1B4B', letterSpacing: '-0.3px' }}>Nexus CRM</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h1 className="hero-title" style={{ fontSize: '2.25rem', fontWeight: 800, color: '#1E1B4B', lineHeight: 1.2, letterSpacing: '-1px', margin: 0 }}>Command Your<br />Sales Operations</h1>
              <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>Oversee approvals, teams, pipeline, and performance across your entire organization from one control center.</p>
            </div>

            <div className="hero-image-container" style={{ position: 'relative', borderRadius: '1rem', overflow: 'hidden', boxShadow: '0 10px 30px -5px rgba(30,27,75,0.15)', border: '1px solid rgba(255,255,255,0.8)', aspectRatio: '1.45', backgroundColor: '#1E1B4B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ position: 'absolute', color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem', fontWeight: 600 }}>Nexus CRM</span>
              <img src="/login_dashboard_preview.png" alt="Dashboard Preview" onError={(e) => { e.currentTarget.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'relative' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.25rem' }}>
              {['Approvals', 'Team Hierarchy', 'Sales Pipeline', 'Reports & Analytics', 'Audit Log'].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 600, color: '#1E1B4B' }}>
                  <CheckCircle2 size={16} color={ACCENT} fill={HERO_TO} /><span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
            <div className="right-login-card" style={{ width: '100%', maxWidth: '460px', backgroundColor: '#FFFFFF', borderRadius: '1.25rem', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02), 0 10px 15px -3px rgba(0,0,0,0.03)', border: '1px solid #E2E8F0' }}>

              {forgotStep === 0 && (
                <>
                  <div className="right-login-card-header" style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>Welcome Back 👋</h2>
                    <p style={{ fontSize: '0.875rem', color: '#64748B', margin: 0 }}>Login to continue overseeing your sales operations.</p>
                  </div>
                  <Feedback />
                  <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                      <label style={labelStyle}>Role</label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: '100%', padding: '0.75rem 2.5rem 0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid #CBD5E1', backgroundColor: '#F1F5F9', fontSize: '0.875rem', fontWeight: 600, color: '#0F172A' }}>{APP_ROLE}</div>
                        <ShieldCheck size={16} color={ACCENT} style={{ position: 'absolute', right: 12, pointerEvents: 'none' }} />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Email / Employee ID</label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input required type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. name@company.com" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                        <AtSign size={16} color="#94A3B8" style={{ position: 'absolute', right: 12, pointerEvents: 'none' }} />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Password</label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input required type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
                          {showPassword ? <EyeOff size={16} color="#94A3B8" /> : <Eye size={16} color="#94A3B8" />}
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#64748B' }}>
                        <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ accentColor: ACCENT }} />
                        Remember Me
                      </label>
                      <a href="#forgot" onClick={(e) => { e.preventDefault(); setShowForgotInfo(true); }} style={linkStyle}>Forgot Password?</a>
                    </div>
                    <button type="submit" disabled={!email || !password} style={{ ...btnStyle, ...((!email || !password) ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} onMouseEnter={btnOver} onMouseLeave={btnOut}>Login to Dashboard</button>
                  </form>
                  <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.8125rem', color: '#94A3B8' }}>
                    <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" style={{ color: '#64748B', textDecoration: 'none', fontWeight: 600 }}>Privacy Policy</a>
                  </p>
                </>
              )}

              {forgotStep === 1 && (
                <>
                  <div className="right-login-card-header" style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>Forgot Password? 🔒</h2>
                    <p style={{ fontSize: '0.875rem', color: '#64748B', margin: 0 }}>Enter your email ID to receive a verification OTP code.</p>
                  </div>
                  <Feedback />
                  <form onSubmit={handleSendOTP} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                      <label style={labelStyle}>Email Address</label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input required type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="e.g. name@company.com" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                        <AtSign size={16} color="#94A3B8" style={{ position: 'absolute', right: 12, pointerEvents: 'none' }} />
                      </div>
                    </div>
                    <button type="submit" style={btnStyle} onMouseEnter={btnOver} onMouseLeave={btnOut}>Send OTP</button>
                    <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                      <a href="#back" onClick={(e) => { e.preventDefault(); setForgotStep(0); }} style={{ color: '#64748B', textDecoration: 'none', fontSize: '0.8125rem', fontWeight: 600 }}>Back to Login</a>
                    </div>
                  </form>
                </>
              )}

              {forgotStep === 2 && (
                <>
                  <div className="right-login-card-header" style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>Verify OTP 🔑</h2>
                    <p style={{ fontSize: '0.875rem', color: '#64748B', margin: 0 }}>We sent a 6-digit verification code to <strong>{forgotEmail}</strong>.</p>
                  </div>
                  <Feedback />
                  <form onSubmit={handleVerifyOTP} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                      <label style={labelStyle}>Enter OTP Code</label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input required type="text" maxLength={6} value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="e.g. 123456" style={{ ...inputStyle, letterSpacing: otpCode ? '4px' : 'normal', fontWeight: otpCode ? 700 : 'normal' }} onFocus={onFocus} onBlur={onBlur} />
                        <Key size={16} color="#94A3B8" style={{ position: 'absolute', right: 12, pointerEvents: 'none' }} />
                      </div>
                    </div>
                    <button type="submit" style={btnStyle} onMouseEnter={btnOver} onMouseLeave={btnOut}>Verify OTP</button>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginTop: '0.5rem' }}>
                      <a href="#resend" onClick={(e) => { e.preventDefault(); handleSendOTP(e); }} style={linkStyle}>Resend Code</a>
                      <a href="#back" onClick={(e) => { e.preventDefault(); setForgotStep(0); }} style={{ color: '#64748B', textDecoration: 'none', fontWeight: 600 }}>Back to Login</a>
                    </div>
                  </form>
                </>
              )}

              {forgotStep === 3 && (
                <>
                  <div className="right-login-card-header" style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>New Password 🛠️</h2>
                    <p style={{ fontSize: '0.875rem', color: '#64748B', margin: 0 }}>Create a strong, new password for your account.</p>
                  </div>
                  <Feedback />
                  <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                      <label style={labelStyle}>New Password</label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input required type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                        <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} style={{ position: 'absolute', right: 12, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
                          {showNewPassword ? <EyeOff size={16} color="#94A3B8" /> : <Eye size={16} color="#94A3B8" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Confirm New Password</label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input required type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: 12, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
                          {showConfirmPassword ? <EyeOff size={16} color="#94A3B8" /> : <Eye size={16} color="#94A3B8" />}
                        </button>
                      </div>
                    </div>
                    <button type="submit" style={btnStyle} onMouseEnter={btnOver} onMouseLeave={btnOut}>Reset Password</button>
                    <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                      <a href="#back" onClick={(e) => { e.preventDefault(); setForgotStep(0); }} style={{ color: '#64748B', textDecoration: 'none', fontSize: '0.8125rem', fontWeight: 600 }}>Back to Login</a>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #E2E8F0', padding: '1.5rem', backgroundColor: '#FFFFFF' }}>
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1280px', margin: '0 auto', width: '100%', fontSize: '0.75rem', color: '#64748B', flexWrap: 'wrap', gap: '1rem' }}>
          <span>&copy; 2026 Nexus CRM · Sales Head. All rights reserved.</span>
          <div style={{ display: 'flex', gap: '1.5rem', fontWeight: 500 }}>
            <a href="#privacy" onClick={(e) => e.preventDefault()} style={{ color: 'inherit', textDecoration: 'none' }}>Privacy Policy</a>
            <a href="#terms" onClick={(e) => e.preventDefault()} style={{ color: 'inherit', textDecoration: 'none' }}>Terms of Service</a>
            <a href="#security" onClick={(e) => e.preventDefault()} style={{ color: 'inherit', textDecoration: 'none' }}>Security</a>
          </div>
        </div>
      </div>
    </div>
  );
}
