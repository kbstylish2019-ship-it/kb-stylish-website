'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
  Textarea,
  Label
} from '@/components/ui/custom-ui';
import { AlertTriangle, Shield, Loader2, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface Booking {
  id: string;
  customerName: string;
  startTime: string;
}

interface SafetyDetailsModalProps {
  booking: Booking;
  isOpen: boolean;
  onClose: () => void;
}

export default function SafetyDetailsModal({ booking, isOpen, onClose }: SafetyDetailsModalProps) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleViewDetails() {
    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/stylist/customer-safety-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bookingId: booking.id,
          reason: reason.trim()
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch safety details');
      }

      setDetails(data.data);
      toast.success('Access logged for compliance');
    } catch (err) {
      console.error('Safety details error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load safety details');
      toast.error('Failed to load safety details');
    } finally {
      setIsLoading(false);
    }
  }

  function handleClose() {
    setReason('');
    setDetails(null);
    setError(null);
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Shield className="w-5 h-5 mr-2 text-amber-600" />
            Customer Safety Information
          </DialogTitle>
          <DialogDescription>
            Access to customer medical information is logged for GDPR compliance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer Info */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-600">Customer</p>
            <p className="font-medium">{booking.customerName}</p>
          </div>

          {!details ? (
            // STEP 1: Request access with reason
            <>
              <div className="space-y-2">
                <Label htmlFor="reason" className="text-sm font-medium">
                  Why are you accessing this information? *
                </Label>
                <Textarea
                  id="reason"
                  placeholder="e.g., Preparing for service, need to review allergy information for safety"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setError(null);
                  }}
                  rows={4}
                  className={error ? 'border-red-500' : ''}
                />
                <p className="text-xs text-gray-500">
                  Minimum 10 characters required
                </p>
                {error && (
                  <p className="text-sm text-red-600">{error}</p>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start">
                  <AlertTriangle className="w-4 h-4 text-blue-600 mr-2 mt-0.5" />
                  <div className="text-xs text-blue-800">
                    <strong>Privacy Notice:</strong> This access will be logged with your user ID, 
                    timestamp, IP address, and the reason provided. This is required by GDPR Article 30.
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleViewDetails}
                  disabled={reason.trim().length < 10 || isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4 mr-2" />
                      View Details
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            // STEP 2: Display safety details
            <>
              <div className="space-y-4">
                {/* Allergies */}
                {details.allergies && (
                  <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
                    <div className="flex items-start mb-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mr-2 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-amber-900">Allergies</h3>
                        <p className="text-sm text-amber-800 mt-1">{details.allergies}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Safety Notes */}
                {details.safetyNotes && (
                  <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                    <h3 className="font-semibold text-blue-900 mb-2">Safety Notes</h3>
                    <p className="text-sm text-blue-800">{details.safetyNotes}</p>
                  </div>
                )}

                {!details.allergies && !details.safetyNotes && (
                  <div className="text-center py-4 text-gray-500">
                    No safety information recorded for this customer
                  </div>
                )}

                {/* Audit Confirmation */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-start">
                    <CheckCircle className="w-4 h-4 text-green-600 mr-2 mt-0.5" />
                    <div className="text-xs text-green-800">
                      <strong>Access Logged:</strong> This access has been recorded in the audit log 
                      per GDPR Article 30 requirements.
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleClose}>
                  Close
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
