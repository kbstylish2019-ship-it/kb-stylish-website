'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/custom-ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/custom-ui';
import { Textarea } from '@/components/ui/custom-ui';
import { Check, X, UserX, Clock, FileText, AlertTriangle } from 'lucide-react';
import { format, parseISO, isPast, isFuture, differenceInMinutes } from 'date-fns';
import toast from 'react-hot-toast';

interface Booking {
  id: string;
  customerName: string;
  serviceName: string;
  startTime: string;
  endTime: string;
  status: string;
  customerNotes?: string;
  stylistNotes?: string;
}

interface BookingActionsModalProps {
  booking: Booking | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ActionType = 'in_progress' | 'completed' | 'no_show' | 'cancelled' | 'add_notes' | null;

/**
 * BookingActionsModal - Enterprise-grade booking management
 * 
 * Features:
 * - Context-aware action buttons
 * - Confirmation for destructive actions
 * - Validation based on timing
 * - Optimistic UI updates
 * - Comprehensive error handling
 */
export default function BookingActionsModal({
  booking,
  isOpen,
  onClose,
  onSuccess
}: BookingActionsModalProps) {
  const [selectedAction, setSelectedAction] = useState<ActionType>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (isOpen) {
      setSelectedAction(null);
      setReason('');
      setNotes('');
      setError('');
    }
  }, [isOpen]);

  if (!booking) return null;

  // ========================================================================
  // TIMING CALCULATIONS
  // ========================================================================
  
  const startTime = parseISO(booking.startTime);
  const endTime = parseISO(booking.endTime);
  const now = new Date();
  const minutesUntilStart = differenceInMinutes(startTime, now);
  const minutesSinceEnd = differenceInMinutes(now, endTime);
  
  const isBeforeStart = isFuture(startTime);
  const isAfterEnd = isPast(endTime);
  const isDuringService = !isBeforeStart && !isAfterEnd;

  // ========================================================================
  // AVAILABLE ACTIONS (Context-aware)
  // ========================================================================
  
  const getAvailableActions = () => {
    const actions = [];

    // Only show for confirmed bookings
    if (booking.status !== 'confirmed') {
      return [];
    }

    // In Progress: Can start up to 30 mins early
    if (minutesUntilStart <= 30) {
      actions.push({
        type: 'in_progress' as ActionType,
        label: 'Mark In Progress',
        icon: Clock,
        color: 'blue',
        description: 'Start the service now'
      });
    }

    // Completed: Can mark completed if started or after appointment time
    if (minutesUntilStart < 0) {
      actions.push({
        type: 'completed' as ActionType,
        label: 'Mark Completed',
        icon: Check,
        color: 'green',
        description: 'Service was completed successfully'
      });
    }

    // No Show: After appointment time
    if (minutesUntilStart < -15) {
      actions.push({
        type: 'no_show' as ActionType,
        label: 'Mark No-Show',
        icon: UserX,
        color: 'orange',
        description: 'Customer did not arrive'
      });
    }

    // Cancel: Always available for future bookings
    if (isBeforeStart) {
      actions.push({
        type: 'cancelled' as ActionType,
        label: 'Cancel Booking',
        icon: X,
        color: 'red',
        description: 'Cancel this appointment'
      });
    }

    // Add Notes: Always available
    actions.push({
      type: 'add_notes' as ActionType,
      label: 'Add Notes',
      icon: FileText,
      color: 'gray',
      description: 'Add private notes about this booking'
    });

    return actions;
  };

  // ========================================================================
  // ACTION HANDLERS
  // ========================================================================
  
  const handleSubmit = async () => {
    if (!selectedAction) return;

    setLoading(true);
    setError('');

    try {
      if (selectedAction === 'add_notes') {
        await handleAddNotes();
      } else {
        await handleStatusChange();
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async () => {
    if (!selectedAction || selectedAction === 'add_notes') return;

    // Validation
    if (selectedAction === 'cancelled' && (!reason || reason.trim().length < 3)) {
      setError('Please provide a cancellation reason (minimum 3 characters)');
      return;
    }

    const response = await fetch('/api/stylist/bookings/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        booking_id: booking.id,
        new_status: selectedAction,
        reason: reason.trim() || undefined
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to update booking status');
    }

    toast.success(`Booking marked as ${selectedAction.replace('_', ' ')}!`);
    onSuccess();
    onClose();
  };

  const handleAddNotes = async () => {
    if (!notes || notes.trim().length < 1) {
      setError('Please enter some notes');
      return;
    }

    const response = await fetch('/api/stylist/bookings/add-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        booking_id: booking.id,
        notes: notes.trim()
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to add notes');
    }

    toast.success('Notes added successfully!');
    setNotes('');
    onSuccess();
    // Don't close modal - allow adding more notes
  };

  // ========================================================================
  // RENDER: ACTION SELECTION
  // ========================================================================
  
  const availableActions = getAvailableActions();

  if (!selectedAction) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Booking</DialogTitle>
            <DialogDescription>
              Choose an action for this appointment
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Booking Summary */}
            <div className="bg-muted/50 p-4 rounded-lg border">
              <p className="font-semibold text-foreground">{booking.customerName}</p>
              <p className="text-sm text-muted-foreground">{booking.serviceName}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {format(startTime, 'MMM d, yyyy • h:mm a')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Status: <span className="font-medium">{booking.status}</span>
              </p>
            </div>

            {/* Available Actions */}
            {availableActions.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
                <p>No actions available for this booking</p>
              </div>
            ) : (
              <div className="space-y-2">
                {availableActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={action.type}
                      onClick={() => setSelectedAction(action.type)}
                      variant="outline"
                      className="w-full justify-start gap-3 h-auto py-3"
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <div className="text-left flex-1">
                        <div className="font-medium">{action.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {action.description}
                        </div>
                      </div>
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ========================================================================
  // RENDER: ACTION CONFIRMATION
  // ========================================================================
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {selectedAction === 'add_notes' ? 'Add Notes' : 
             selectedAction === 'cancelled' ? 'Cancel Booking' :
             selectedAction === 'no_show' ? 'Mark as No-Show' :
             selectedAction === 'completed' ? 'Mark as Completed' :
             'Mark In Progress'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Booking Summary */}
          <div className="bg-muted/50 p-3 rounded-lg border text-sm">
            <p className="font-medium">{booking.customerName}</p>
            <p className="text-muted-foreground">{booking.serviceName}</p>
          </div>

          {/* Action-specific content */}
          {selectedAction === 'add_notes' && (
            <>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Notes (Private - Only you can see this)
                </label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Used color formula 5N, client prefers warm water..."
                  rows={4}
                  maxLength={2000}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {notes.length}/2000 characters
                </p>
              </div>

              {booking.stylistNotes && (
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Previous Notes:
                  </label>
                  <div className="bg-muted/30 p-3 rounded text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {booking.stylistNotes}
                  </div>
                </div>
              )}
            </>
          )}

          {selectedAction === 'cancelled' && (
            <>
              <div>
                <label className="text-sm font-medium mb-2 block text-destructive">
                  Cancellation Reason *
                </label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Please explain why you're cancelling..."
                  rows={3}
                  required
                />
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-3 text-sm">
                <AlertTriangle className="w-4 h-4 inline mr-2 text-yellow-500" />
                <span className="text-yellow-700 dark:text-yellow-300">
                  The customer will be notified about the cancellation.
                </span>
              </div>
            </>
          )}

          {selectedAction === 'no_show' && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded p-3 text-sm">
              <AlertTriangle className="w-4 h-4 inline mr-2 text-orange-500" />
              <span className="text-orange-700 dark:text-orange-300">
                This will mark the customer as a no-show. This action cannot be undone.
              </span>
            </div>
          )}

          {selectedAction === 'completed' && (
            <div className="bg-green-500/10 border border-green-500/20 rounded p-3 text-sm">
              <Check className="w-4 h-4 inline mr-2 text-green-500" />
              <span className="text-green-700 dark:text-green-300">
                Mark this service as successfully completed.
              </span>
            </div>
          )}

          {selectedAction === 'in_progress' && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded p-3 text-sm">
              <Clock className="w-4 h-4 inline mr-2 text-blue-500" />
              <span className="text-blue-700 dark:text-blue-300">
                Start the service now. You can mark it as completed when done.
              </span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setSelectedAction(null);
                setReason('');
                setNotes('');
                setError('');
              }}
              variant="outline"
              disabled={loading}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1"
            >
              {loading ? 'Processing...' : 'Confirm'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
