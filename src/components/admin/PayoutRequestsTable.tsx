"use client";

import React, { useState } from "react";
import { CheckCircle, XCircle, Clock, ExternalLink, AlertCircle, Loader2 } from "lucide-react";
import type { PayoutRequest } from "@/actions/admin/payouts";
import { approvePayoutRequest, rejectPayoutRequest } from "@/actions/admin/payouts";

interface PayoutRequestsTableProps {
  requests: PayoutRequest[];
}

export default function PayoutRequestsTable({ requests }: PayoutRequestsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [error, setError] = useState('');

  const handleApprove = async (request: PayoutRequest) => {
    if (!confirm(`Approve payout of NPR ${(request.requested_amount_cents / 100).toLocaleString('en-IN')} to ${request.vendor_name}?`)) {
      return;
    }

    setActioningId(request.request_id);
    setError('');

    const result = await approvePayoutRequest({
      requestId: request.request_id,
      paymentReference: paymentReference || undefined,
      adminNotes: adminNotes || undefined,
    });

    if (result.success) {
      alert(result.message);
      window.location.reload();
    } else {
      setError(result.message);
      setActioningId(null);
    }
  };

  const handleReject = async (request: PayoutRequest) => {
    if (!rejectionReason || rejectionReason.trim().length < 10) {
      setError('Rejection reason must be at least 10 characters');
      return;
    }

    if (!confirm(`Reject payout request from ${request.vendor_name}?`)) {
      return;
    }

    setActioningId(request.request_id);
    setError('');

    const result = await rejectPayoutRequest({
      requestId: request.request_id,
      rejectionReason: rejectionReason.trim(),
    });

    if (result.success) {
      alert(result.message);
      window.location.reload();
    } else {
      setError(result.message);
      setActioningId(null);
    }
  };

  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center ring-1 ring-white/10">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
          <Clock className="h-8 w-8 text-foreground/40" />
        </div>
        <h3 className="text-lg font-medium">No Pending Requests</h3>
        <p className="mt-2 text-sm text-foreground/60">
          All payout requests have been processed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-200">{error}</p>
          </div>
        </div>
      )}

      {requests.map((request) => {
        const isExpanded = expandedId === request.request_id;
        const isActioning = actioningId === request.request_id;
        const balance = request.available_balance;

        return (
          <div
            key={request.request_id}
            className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden ring-1 ring-white/10"
          >
            {/* Header */}
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">{request.vendor_name}</h3>
                    <span className="text-xs text-foreground/50">#{request.request_id.slice(0, 8)}</span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-foreground/60">Amount: </span>
                      <span className="font-semibold text-emerald-400">
                        NPR {(request.requested_amount_cents / 100).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div>
                      <span className="text-foreground/60">Method: </span>
                      <span className="capitalize">{request.payment_method.replace('_', ' ')}</span>
                    </div>
                    <div>
                      <span className="text-foreground/60">Requested: </span>
                      <span>{new Date(request.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setExpandedId(isExpanded ? null : request.request_id)}
                  className="rounded-lg bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10 transition-colors"
                >
                  {isExpanded ? 'Collapse' : 'Review'}
                </button>
              </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
              <div className="border-t border-white/10 bg-white/[0.02] p-6 space-y-6">
                {/* Vendor Balance Info */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-foreground/60 mb-1">Available Balance</div>
                    <div className="text-lg font-semibold text-emerald-400">
                      NPR {(balance.pending_payout_cents / 100).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-foreground/60 mb-1">Delivered GMV</div>
                    <div className="text-lg font-semibold">
                      NPR {(balance.delivered_gmv_cents / 100).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-foreground/60 mb-1">Platform Fees</div>
                    <div className="text-lg font-semibold">
                      NPR {(balance.platform_fees_cents / 100).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                {/* Payment Details */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <h4 className="text-sm font-medium mb-3">Payment Details</h4>
                  <div className="space-y-2 text-sm">
                    {Object.entries(request.payment_details).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-foreground/60 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                        <span className="font-mono">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Validation Warning */}
                {balance.pending_payout_cents < request.requested_amount_cents && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
                    <div className="flex gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-amber-300">Insufficient Balance</h4>
                        <p className="text-sm text-amber-200/80 mt-1">
                          Vendor's available balance (NPR {(balance.pending_payout_cents / 100).toLocaleString('en-IN')}) 
                          is less than requested amount.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Admin Actions */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Payment Reference (Optional)</label>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Transaction ID, UTR, etc."
                      className="w-full rounded-lg border border-white/10 bg-white/5 py-2 px-4 text-foreground placeholder:text-foreground/40 focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20"
                      disabled={isActioning}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Admin Notes (Optional)</label>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Internal notes..."
                      rows={2}
                      className="w-full rounded-lg border border-white/10 bg-white/5 py-2 px-4 text-foreground placeholder:text-foreground/40 focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20"
                      disabled={isActioning}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Rejection Reason <span className="text-red-400">(Required to reject)</span>
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Provide detailed reason for rejection..."
                      rows={3}
                      className="w-full rounded-lg border border-white/10 bg-white/5 py-2 px-4 text-foreground placeholder:text-foreground/40 focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20"
                      disabled={isActioning}
                    />
                    {rejectionReason && rejectionReason.trim().length < 10 && (
                      <p className="mt-1 text-xs text-red-400">Minimum 10 characters required</p>
                    )}
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => handleReject(request)}
                      disabled={isActioning || !rejectionReason || rejectionReason.trim().length < 10}
                      className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isActioning ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4" />
                          Reject
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleApprove(request)}
                      disabled={isActioning || balance.pending_payout_cents < request.requested_amount_cents}
                      className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 font-medium text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isActioning ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4" />
                          Approve & Process
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
