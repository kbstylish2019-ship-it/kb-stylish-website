'use client';

import React, { useState } from 'react';
import { Button, Badge } from '@/components/ui/custom-ui';
import { Calendar, Loader2, Plus, Edit } from 'lucide-react';
import toast from 'react-hot-toast';
import CreateScheduleModal from './CreateScheduleModal';

interface StylistSchedule {
  stylist_user_id: string;
  display_name: string;
  has_schedule: boolean;
  schedules: any[];
}

interface Props {
  initialSchedules: StylistSchedule[];
}

export default function ScheduleManagementClient({ initialSchedules }: Props) {
  const [schedules, setSchedules] = useState<StylistSchedule[]>(initialSchedules);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStylist, setSelectedStylist] = useState<StylistSchedule | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function refreshSchedules() {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/schedules');
      const data = await response.json();
      
      if (data.success) {
        setSchedules(data.schedules);
      }
    } catch (err) {
      toast.error('Failed to refresh schedules');
    } finally {
      setIsLoading(false);
    }
  }

  function handleCreate(stylist: StylistSchedule) {
    setSelectedStylist(stylist);
    setIsModalOpen(true);
  }

  function handleScheduleCreated() {
    setIsModalOpen(false);
    setSelectedStylist(null);
    toast.success('Schedule created successfully!');
    refreshSchedules();
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-12 ring-1 ring-white/10">
        <div className="flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/40" />
          <span className="ml-3 text-foreground/70">Loading schedules...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-foreground" />
          <h2 className="text-xl font-semibold text-foreground">Stylist Schedules</h2>
        </div>
        <Button onClick={refreshSchedules} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      {/* Table Container */}
      <div className="rounded-2xl border border-white/10 bg-white/5 ring-1 ring-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4 text-sm font-medium text-foreground/80">Stylist Name</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-foreground/80">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-foreground/80">Working Days</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-foreground/80">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(schedule => (
                <tr key={schedule.stylist_user_id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-4 px-4 font-medium text-foreground">{schedule.display_name}</td>
                  <td className="py-4 px-4">
                    {schedule.has_schedule ? (
                      <Badge variant="default" className="bg-green-500/20 text-green-300 border-green-500/30">
                        ✅ Scheduled
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-red-500/20 text-red-300 border-red-500/30">
                        ❌ Not Set
                      </Badge>
                    )}
                  </td>
                  <td className="py-4 px-4 text-sm text-foreground/70">
                    {schedule.has_schedule ? `${schedule.schedules.length} days` : '-'}
                  </td>
                  <td className="py-4 px-4">
                    {schedule.has_schedule ? (
                      <Button size="sm" variant="outline" disabled>
                        <Edit className="w-4 h-4 mr-1" />
                        Edit (Coming Soon)
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => handleCreate(schedule)}>
                        <Plus className="w-4 h-4 mr-1" />
                        Create Schedule
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {schedules.length === 0 && (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-foreground/20 mx-auto mb-3" />
              <p className="text-foreground/60">No stylists found</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Schedule Modal */}
      {selectedStylist && (
        <CreateScheduleModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedStylist(null);
          }}
          stylist={selectedStylist}
          onSuccess={handleScheduleCreated}
        />
      )}
    </div>
  );
}
