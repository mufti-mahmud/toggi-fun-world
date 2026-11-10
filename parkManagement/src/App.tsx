import React from 'react';
import { PortalProvider, usePortal } from './context/PortalContext';
import { Header } from './components/Header';
import { ParkOverviewBanner } from './components/ParkOverviewBanner';
import { IssueFilterBar } from './components/IssueFilterBar';
import { IssueList } from './components/IssueList';
import { EngineersDirectory } from './components/EngineersDirectory';
import { TwinParksStatus } from './components/TwinParksStatus';
import { AgmDirectiveModal } from './components/AgmDirectiveModal';
import { IssueDetailModal } from './components/IssueDetailModal';
import { NewIssueModal } from './components/NewIssueModal';
import { AddEngineerModal } from './components/AddEngineerModal';
import { ExportSummaryModal } from './components/ExportSummaryModal';
import { ManageCategoriesModal } from './components/ManageCategoriesModal';
const PortalMain: React.FC = () => {
  const { activeTab } = usePortal();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'issues' && (
          <div>
            <ParkOverviewBanner />
            <IssueFilterBar />
            <IssueList />
          </div>
        )}

        {activeTab === 'engineers' && <EngineersDirectory />}

        {activeTab === 'parks' && <TwinParksStatus />}
      </main>

      {/* Footer / Status */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 mt-12 text-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-1">
          <p className="text-xs text-slate-400 font-medium">
            Mufti Mahmud Mollah
          </p>
          <p className="font-extrabold text-base sm:text-lg text-white tracking-tight">
            Tanvir Bashundhara Group
          </p>
          <p className="text-xs text-indigo-400 font-semibold tracking-wider uppercase">
            Entertainment &amp; Parks Hub
          </p>
        </div>
      </footer>

      {/* Modals */}
      <AgmDirectiveModal />
      <IssueDetailModal />
      <NewIssueModal />
      <AddEngineerModal />
      <ExportSummaryModal />
      <ManageCategoriesModal />
    </div>
  );
};

export default function App({ authenticatedUser }: { authenticatedUser?: any } = {}) {
  return (
    <PortalProvider initialUser={authenticatedUser}>
      <PortalMain />
    </PortalProvider>
  );
}
