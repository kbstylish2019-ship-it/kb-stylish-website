'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/custom-ui';
import { Plus } from 'lucide-react';
import WeeklyScheduleView from './WeeklyScheduleView';
import OverrideHistoryList from './OverrideHistoryList';
import TimeOffRequestModal from './TimeOffRequestModal';

interface SchedulePageClientProps {
  userId: string;
}

/**
 * Schedule Page Client Component
 * 
 * Main container for schedule management features.
 * Shows weekly schedule, time off history, and request modal.
 */
export default function SchedulePageClient({ userId }: SchedulePageClientProps) {
  const [showModal, setShowModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleOverrideCreated() {
    // Trigger refresh of schedule and history
    setRefreshKey(prev => prev + 1);
    setShowModal(false);
  }

  return (
    <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Schedule Management</h1>
          <p className="text-xs sm:text-sm text-foreground/70 mt-1">
            Manage your working hours and time off requests
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} className="flex items-center gap-2 w-full sm:w-auto justify-center">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Request Time Off</span>
          <span className="sm:hidden">Time Off</span>
        </Button>
      </div>

      {/* Weekly Schedule */}
      <WeeklyScheduleView userId={userId} refreshKey={refreshKey} />

      {/* Override History */}
      <OverrideHistoryList userId={userId} refreshKey={refreshKey} />

      {/* Time Off Request Modal */}
      <TimeOffRequestModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={handleOverrideCreated}
        userId={userId}
      />
    </div>
  );
}
