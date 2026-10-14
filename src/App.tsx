import React, { useState, useEffect } from 'react';
import { db } from './services/db';
import { Child, LessonReport } from './types';
import { LoginView } from './components/auth/LoginView';
import { AdminNavigation } from './components/admin/AdminNavigation';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { ChildList } from './components/admin/ChildList';
import { ChildDetail } from './components/admin/ChildDetail';
import { ScheduleManager } from './components/admin/ScheduleManager';
import { AttendanceManager } from './components/admin/AttendanceManager';
import { PaymentManager } from './components/admin/PaymentManager';
import { AdminSettings } from './components/admin/AdminSettings';
import { ReportFormModal } from './components/admin/ReportFormModal';
import { WhatsappShareModal } from './components/admin/WhatsappShareModal';
import { ParentPortal } from './components/parent/ParentPortal';

export default function App() {
  // App views: 'dashboard' | 'children' | 'child_detail' | 'schedules' | 'attendance' | 'payments' | 'settings' | 'parent_view'
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [selectedChildId, setSelectedChildId] = useState<string>('ch_aisyah');
  const [parentToken, setParentToken] = useState<string>('');
  const [isTeacherPreview, setIsTeacherPreview] = useState<boolean>(false);

  // Auth state for admin
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('lesreport_auth') !== 'false';
  });

  // Global modals
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportModalChild, setReportModalChild] = useState<Child | null>(null);

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareModalChild, setShareModalChild] = useState<Child | null>(null);
  const [shareModalReport, setShareModalReport] = useState<LessonReport | null>(null);

  // Reactive DB change trigger
  const [, setDbVersion] = useState(0);

  // URL Hash routing listener
  useEffect(() => {
    const handleHashOrQueryChange = () => {
      // Check query parameter ?token=...
      const urlParams = new URLSearchParams(window.location.search);
      const queryToken = urlParams.get('token');
      if (queryToken) {
        setParentToken(queryToken);
        setIsTeacherPreview(false);
        setCurrentView('parent_view');
        return;
      }

      // Check hash
      const hash = window.location.hash;

      // Teacher preview route: #/preview/:token
      if (hash.startsWith('#/preview/')) {
        const tokenFromHash = hash.replace('#/preview/', '').split('?')[0];
        if (tokenFromHash) {
          setParentToken(tokenFromHash);
          setIsTeacherPreview(true);
          setCurrentView('parent_view');
          return;
        }
      }

      // Public parent report route: #/report/:token
      if (hash.startsWith('#/report/')) {
        const tokenFromHash = hash.replace('#/report/', '').split('?')[0];
        if (tokenFromHash) {
          setParentToken(tokenFromHash);
          setIsTeacherPreview(false);
          setCurrentView('parent_view');
          return;
        }
      }

      // If navigating to admin views, ensure preview state is reset
      setIsTeacherPreview(false);
      setParentToken('');

      if (hash.startsWith('#/children/')) {
        const cId = hash.replace('#/children/', '');
        if (cId) {
          setSelectedChildId(cId);
          setCurrentView('child_detail');
          return;
        }
      }

      if (hash === '#/children') {
        setCurrentView('children');
      } else if (hash === '#/schedules') {
        setCurrentView('schedules');
      } else if (hash === '#/attendance') {
        setCurrentView('attendance');
      } else if (hash === '#/payments') {
        setCurrentView('payments');
      } else if (hash === '#/settings') {
        setCurrentView('settings');
      } else if (hash === '#/dashboard' || hash === '#/' || !hash) {
        setCurrentView('dashboard');
      }
    };

    handleHashOrQueryChange();
    window.addEventListener('hashchange', handleHashOrQueryChange);
    window.addEventListener('popstate', handleHashOrQueryChange);

    const onDbChange = () => setDbVersion((v) => v + 1);
    window.addEventListener('lesreport_db_change', onDbChange);

    return () => {
      window.removeEventListener('hashchange', handleHashOrQueryChange);
      window.removeEventListener('popstate', handleHashOrQueryChange);
      window.removeEventListener('lesreport_db_change', onDbChange);
    };
  }, []);

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    localStorage.setItem('lesreport_auth', 'true');
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.setItem('lesreport_auth', 'false');
  };

  const handleSelectChild = (childId: string) => {
    setSelectedChildId(childId);
    setCurrentView('child_detail');
    window.location.hash = `#/children/${childId}`;
  };

  const handleStartReport = (childId: string) => {
    const child = db.getChildById(childId);
    if (child) {
      setReportModalChild(child);
      setIsReportModalOpen(true);
    }
  };

  const handlePreviewAsParent = (token?: string) => {
    let targetToken = token;
    if (!targetToken) {
      // Default to currently selected child or first child
      const targetChildId = selectedChildId || db.getChildren()[0]?.id;
      const tokObj = db.getTokenForChild(targetChildId);
      targetToken = tokObj.token;
    }
    setParentToken(targetToken);
    setIsTeacherPreview(true);
    setCurrentView('parent_view');
    window.location.hash = `#/preview/${targetToken}`;
  };

  const handleExitParentPreview = () => {
    setIsTeacherPreview(false);
    setParentToken('');
    setCurrentView('dashboard');
    window.location.hash = '#/dashboard';
  };

  const handleNavigate = (view: string) => {
    setIsTeacherPreview(false);
    setParentToken('');
    setCurrentView(view);
    window.location.hash = `#/${view}`;
  };

  // If viewing parent portal via private token
  if (currentView === 'parent_view' && parentToken) {
    return (
      <ParentPortal
        token={parentToken}
        onExitPreview={isTeacherPreview ? handleExitParentPreview : undefined}
        isTeacherPreview={isTeacherPreview}
      />
    );
  }

  // If not authenticated as teacher
  if (!isAuthenticated) {
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
        onOpenParentDemo={(token) => {
          setParentToken(token);
          setIsTeacherPreview(false);
          setCurrentView('parent_view');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Admin Header & Bottom Nav */}
      <AdminNavigation
        currentView={currentView}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        onPreviewAsParent={() => handlePreviewAsParent()}
      />

      {/* Main View Router */}
      <main className="flex-1 py-4 sm:py-6">
        {currentView === 'dashboard' && (
          <AdminDashboard
            onSelectChild={handleSelectChild}
            onStartReport={handleStartReport}
            onNavigate={handleNavigate}
          />
        )}

        {currentView === 'children' && (
          <ChildList
            onSelectChild={handleSelectChild}
            onStartReport={handleStartReport}
            onPreviewAsParent={handlePreviewAsParent}
          />
        )}

        {currentView === 'child_detail' && (
          <ChildDetail
            childId={selectedChildId}
            onBack={() => handleNavigate('children')}
            onPreviewAsParent={handlePreviewAsParent}
            originUrl={originUrl}
          />
        )}

        {currentView === 'schedules' && (
          <ScheduleManager
            onStartReport={handleStartReport}
            onSelectChild={handleSelectChild}
          />
        )}

        {currentView === 'attendance' && <AttendanceManager />}

        {currentView === 'payments' && <PaymentManager />}

        {currentView === 'settings' && <AdminSettings />}
      </main>

      {/* Global Quick Report Form Modal */}
      {reportModalChild && (
        <ReportFormModal
          isOpen={isReportModalOpen}
          onClose={() => {
            setIsReportModalOpen(false);
            setReportModalChild(null);
          }}
          child={reportModalChild}
          onSaved={(savedReport, openShare) => {
            setIsReportModalOpen(false);
            if (openShare) {
              setShareModalChild(reportModalChild);
              setShareModalReport(savedReport);
              setIsShareModalOpen(true);
            }
          }}
        />
      )}

      {/* Global WhatsApp Share Modal */}
      {shareModalChild && shareModalReport && (
        <WhatsappShareModal
          isOpen={isShareModalOpen}
          onClose={() => {
            setIsShareModalOpen(false);
            setShareModalChild(null);
            setShareModalReport(null);
          }}
          child={shareModalChild}
          report={shareModalReport}
          originUrl={originUrl}
        />
      )}
    </div>
  );
}
