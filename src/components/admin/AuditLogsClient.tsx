'use client';

import React, { useState, useEffect } from 'react';
import { 
  AlertCircle, Shield, Database, Settings, 
  Info, AlertTriangle, XCircle, 
  ChevronLeft, ChevronRight, Loader2,
  Eye, FileText, User
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

type Category = 'governance' | 'security' | 'data_access' | 'configuration';
type Severity = 'info' | 'warning' | 'critical';
type UserRole = 'admin' | 'auditor' | 'super_auditor';

interface AuditLog {
  id: number;
  adminUserId: string;
  adminEmail: string;
  adminDisplayName: string | null;
  action: string;
  targetId: string | null;
  targetType: string | null;
  severity: Severity;
  category: Category;
  details: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface ApiResponse {
  success: boolean;
  logs?: AuditLog[];
  totalCount?: number;
  currentPage?: number;
  totalPages?: number;
  userRole?: UserRole;
  error?: string;
  code?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_CONFIG = {
  governance: { label: 'Governance', icon: Shield, color: 'violet' },
  security: { label: 'Security', icon: AlertCircle, color: 'red' },
  data_access: { label: 'Data Access', icon: Database, color: 'blue' },
  configuration: { label: 'Configuration', icon: Settings, color: 'amber' }
};

const SEVERITY_CONFIG = {
  info: { label: 'Info', icon: Info, color: 'bg-blue-500/15 text-blue-300 ring-blue-500/30' },
  warning: { label: 'Warning', icon: AlertTriangle, color: 'bg-amber-500/15 text-amber-300 ring-amber-500/30' },
  critical: { label: 'Critical', icon: XCircle, color: 'bg-red-500/15 text-red-300 ring-red-500/30' }
};

const ROLE_BADGE_CONFIG = {
  super_auditor: {
    label: 'Super Auditor Access',
    color: 'text-violet-300',
    icon: '🔓',
    description: 'Unrestricted access to all audit logs'
  },
  auditor: {
    label: 'Auditor Access',
    color: 'text-blue-300',
    icon: '🔍',
    description: 'All logs except your own actions'
  },
  admin: {
    label: 'Admin Access',
    color: 'text-amber-300',
    icon: '⚠️',
    description: 'Governance & Configuration only (excluding own actions)'
  }
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AuditLogsClient() {
  // State
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('admin');
  
  // Filters
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  
  // Details view
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  // Fetch logs function
  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/audit-logs/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: categoryFilter === 'all' ? undefined : categoryFilter,
          severity: severityFilter === 'all' ? undefined : severityFilter,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize
        })
      });

      const data: ApiResponse = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to fetch audit logs');
        setLogs([]);
        return;
      }

      setLogs(data.logs || []);
      setTotalCount(data.totalCount || 0);
      setTotalPages(data.totalPages || 1);
      if (data.userRole) {
        setUserRole(data.userRole);
      }

    } catch (err) {
      console.error('Fetch error:', err);
      setError('Network error. Please try again.');
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch on mount and filter/pagination changes
  useEffect(() => {
    fetchLogs();
  }, [categoryFilter, severityFilter, startDate, endDate, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, severityFilter, startDate, endDate, pageSize]);

  // Clear filters
  const clearFilters = () => {
    setCategoryFilter('all');
    setSeverityFilter('all');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  // Format date for display
  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-NP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  };

  // Render category badge
  const CategoryBadge = ({ category }: { category: Category }) => {
    const config = CATEGORY_CONFIG[category];
    const Icon = config.icon;
    return (
      <span className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1",
        `bg-${config.color}-500/15 text-${config.color}-300 ring-${config.color}-500/30`
      )}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  // Render severity badge
  const SeverityBadge = ({ severity }: { severity: Severity }) => {
    const config = SEVERITY_CONFIG[severity];
    const Icon = config.icon;
    return (
      <span className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1",
        config.color
      )}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  // Check if category is restricted for current user role
  const isCategoryRestricted = (category: Category) => {
    if (userRole === 'super_auditor') return false;
    if (userRole === 'auditor') return false;
    if (userRole === 'admin' && (category === 'security' || category === 'data_access')) return true;
    return false;
  };

  const roleBadge = ROLE_BADGE_CONFIG[userRole];

  return (
    <div className="space-y-4">
      {/* Role Badge */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{roleBadge.icon}</span>
          <div>
            <div className={cn("font-medium", roleBadge.color)}>
              {roleBadge.label}
            </div>
            <div className="text-xs text-foreground/60">
              {roleBadge.description}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="category-filter" className="block text-xs font-medium mb-1">
              Category
            </label>
            <select
              id="category-filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as Category | 'all')}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
            >
              <option value="all">All Categories</option>
              <option value="governance">Governance</option>
              <option 
                value="security" 
                disabled={isCategoryRestricted('security')}
              >
                Security {isCategoryRestricted('security') && '(Auditor Only)'}
              </option>
              <option 
                value="data_access" 
                disabled={isCategoryRestricted('data_access')}
              >
                Data Access {isCategoryRestricted('data_access') && '(Auditor Only)'}
              </option>
              <option value="configuration">Configuration</option>
            </select>
          </div>

          <div>
            <label htmlFor="severity-filter" className="block text-xs font-medium mb-1">
              Severity
            </label>
            <select
              id="severity-filter"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as Severity | 'all')}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
            >
              <option value="all">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label htmlFor="start-date" className="block text-xs font-medium mb-1">
              Start Date
            </label>
            <input
              id="start-date"
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
            />
          </div>

          <div>
            <label htmlFor="end-date" className="block text-xs font-medium mb-1">
              End Date
            </label>
            <input
              id="end-date"
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={clearFilters}
            className="text-sm text-foreground/60 hover:text-foreground underline"
          >
            Clear Filters
          </button>

          <div className="flex items-center gap-2">
            <label htmlFor="page-size" className="text-xs">
              Show:
            </label>
            <select
              id="page-size"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
            >
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-300">Error Loading Logs</p>
            <p className="text-sm text-red-300/80 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="overflow-hidden rounded-2xl border border-white/10 ring-1 ring-white/10">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-foreground/40 mb-4" />
            <p className="text-sm text-foreground/60">Loading audit logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
            <p className="text-sm text-foreground/60">No audit logs found</p>
            <p className="text-xs text-foreground/40 mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-left text-xs uppercase tracking-wide text-foreground/70">
                  <th className="px-4 py-3 w-40">Timestamp</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3 w-32">Category</th>
                  <th className="px-4 py-3 w-28">Severity</th>
                  <th className="px-4 py-3 w-20 text-center">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-xs text-foreground/70 font-mono">
                        {formatDate(log.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-foreground/40" />
                          <div>
                            <div className="font-medium">
                              {log.adminDisplayName || 'Unknown'}
                            </div>
                            <div className="text-xs text-foreground/60">
                              {log.adminEmail}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {log.action}
                      </td>
                      <td className="px-4 py-3">
                        <CategoryBadge category={log.category} />
                      </td>
                      <td className="px-4 py-3">
                        <SeverityBadge severity={log.severity} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                          className="text-foreground/60 hover:text-foreground"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    
                    {/* Expanded Details Row */}
                    {expandedLogId === log.id && (
                      <tr className="bg-white/5">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="space-y-3 text-xs">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <span className="font-medium text-foreground/70">Log ID:</span>
                                <span className="ml-2 font-mono">{log.id}</span>
                              </div>
                              {log.targetId && (
                                <div>
                                  <span className="font-medium text-foreground/70">Target ID:</span>
                                  <span className="ml-2 font-mono">{log.targetId}</span>
                                </div>
                              )}
                              {log.targetType && (
                                <div>
                                  <span className="font-medium text-foreground/70">Target Type:</span>
                                  <span className="ml-2">{log.targetType}</span>
                                </div>
                              )}
                              {log.ipAddress && (
                                <div>
                                  <span className="font-medium text-foreground/70">IP Address:</span>
                                  <span className="ml-2 font-mono">{log.ipAddress}</span>
                                </div>
                              )}
                            </div>
                            
                            {log.details ? (
                              <div>
                                <span className="font-medium text-foreground/70 block mb-2">Details:</span>
                                <pre className="bg-black/30 rounded-lg p-3 overflow-x-auto text-xs font-mono">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </div>
                            ) : (
                              <div>
                                <span className="font-medium text-foreground/70 block mb-2">Details:</span>
                                <div className="text-xs text-foreground/40 italic bg-black/20 rounded-lg p-3">
                                  [Details redacted - insufficient privileges]
                                </div>
                              </div>
                            )}
                            
                            {log.userAgent && (
                              <div>
                                <span className="font-medium text-foreground/70">User Agent:</span>
                                <span className="ml-2 text-foreground/60">{log.userAgent}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && logs.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-xl border border-white/10">
          <div className="text-sm text-foreground/60">
            Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount} logs
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <span className="text-sm text-foreground/60 px-3">
              Page {currentPage} of {totalPages}
            </span>
            
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
