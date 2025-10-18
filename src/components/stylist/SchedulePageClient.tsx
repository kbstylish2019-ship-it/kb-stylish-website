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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Schedule Management</h1>
          <p className="text-foreground/70 mt-1">
            Manage your working hours and time off requests
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Request Time Off
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
