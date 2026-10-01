import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { clearSession, notificationsApi } from '../api/client';
import './Topbar.css';

const timeAgo = (date) => {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  if (isNaN(diff) || diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
};

export default function Topbar({ toggleSidebar }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef(null);

  const handleSignOut = () => {
    // Log out of THIS app's own Sales Head login and return to it.
    clearSession();
    window.location.href = '/login?loggedout=1';
  };

  const getBreadcrumbs = () => {
    const paths = location.pathname.split('/').filter(Boolean);
    if (paths.length === 0) return 'Dashboard';
    return paths.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' / ');
  };

  // Pull the real, DB-backed notifications + unread badge count.
  const load = useCallback(async () => {
    try {
      const data = await notificationsApi.getNotifications();
      setNotifs(Array.isArray(data?.notifications) ? data.notifications : []);
      setUnreadCount(Number(data?.unreadCount) || 0);
    } catch {
      /* leave last-known state on transient errors */
    }
  }, []);

  // Fetch on mount and poll every 30s for near-real-time updates.
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  // Close the dropdown when clicking outside
  useEffect(() => {
    const onDocClick = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const markRead = async (n) => {
    if (n.isRead) return;
    // Optimistic update: flip the item + decrement the badge immediately.
    setNotifs(prev => prev.map(x => x._id === n._id ? { ...x, isRead: true } : x));
    setUnreadCount(c => Math.max(0, c - 1));
    try {
      await notificationsApi.markRead(n._id);
    } catch {
      load(); // reconcile with the server if the write failed
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    setNotifs(prev => prev.map(x => ({ ...x, isRead: true })));
    setUnreadCount(0);
    try {
      await notificationsApi.markAllRead();
    } catch {
      load();
    }
  };

  return (
    <header className="topbar">
      <div className="topbar__left">
        <button className="topbar__menu-btn" onClick={toggleSidebar}>
          <Menu size={20} />
        </button>
        <div className="topbar__breadcrumb">
          {getBreadcrumbs()}
        </div>
      </div>

      <div className="topbar__right">
        <div ref={panelRef} style={{ position: 'relative' }}>
          <button className="topbar__icon-btn" onClick={() => setOpen(o => !o)} title="Notifications">
            <Bell size={20} />
            {unreadCount > 0 && (
              <span
                style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 9999, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: '16px', textAlign: 'center', border: '2px solid #fff' }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {open && (
            <div
              style={{ position: 'absolute', right: 0, top: 'calc(100% + 10px)', width: 360, maxHeight: 440, overflowY: 'auto', background: '#fff', border: '1px solid #E5E9F0', borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,0.16)', zIndex: 1000 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', borderBottom: '1px solid #EEF1F5', position: 'sticky', top: 0, background: '#fff' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827' }}>
                  Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}
                </span>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Mark all as read
                  </button>
                )}
              </div>
              {notifs.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>You're all caught up.</div>
              ) : (
                notifs.map(n => {
                  const unread = !n.isRead;
                  return (
                    <div
                      key={n._id}
                      onClick={() => markRead(n)}
                      style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '0.75rem 1rem', borderBottom: '1px solid #F4F6FA', cursor: unread ? 'pointer' : 'default', background: unread ? '#F5F8FF' : '#fff', borderLeft: unread ? '3px solid #4f46e5' : '3px solid transparent' }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: unread ? '#4f46e5' : 'transparent' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', color: unread ? '#111827' : '#475569', fontWeight: unread ? 700 : 500 }}>{n.title}</div>
                        <div style={{ fontSize: '0.8rem', color: unread ? '#334155' : '#64748B', marginTop: 1 }}>{n.message}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                          <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{timeAgo(n.eventAt || n.createdAt)}</span>
                          {unread && (
                            <button
                              onClick={(e) => { e.stopPropagation(); markRead(n); }}
                              style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                            >
                              Mark as read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="topbar__avatar" onClick={handleSignOut} title="Sign out" style={{ cursor: 'pointer' }}>SK</div>
      </div>
    </header>
  );
}
