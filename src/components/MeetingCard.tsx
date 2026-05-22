import React from 'react';
import { Meeting } from '../types';
import { Video, Clock, MessageSquare, Mic, AlertCircle, RefreshCw, Trash2, Calendar, FileText } from 'lucide-react';

interface MeetingCardProps {
  key?: any;
  meeting: Meeting;
  isSelected: boolean;
  onSelect: (meeting: Meeting) => void;
  onDelete: (id: string, e: any) => any;
}

export default function MeetingCard({ meeting, isSelected, onSelect, onDelete }: MeetingCardProps) {
  
  // Format dates elegantly
  const formatMeetingDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) + ' • ' + d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Convert duration from seconds into mm:ss
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };  // Get Platform-specific JSX icons
  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'google-meet':
        return <Video className="w-4 h-4 text-[#71716A]" />;
      case 'zoom':
        return <Video className="w-4 h-4 text-[#71716A]" />;
      case 'teams':
        return <Video className="w-4 h-4 text-[#71716A]" />;
      case 'slack':
        return <MessageSquare className="w-4 h-4 text-[#71716A]" />;
      case 'discord':
        return <MessageSquare className="w-4 h-4 text-[#71716A]" />;
      default:
        return <Mic className="w-4 h-4 text-[#71716A]" />;
    }
  };

  const getPlatformLabel = (platform: string) => {
    if (platform === 'google-meet') return 'Google Meet';
    if (platform === 'zoom') return 'Zoom';
    if (platform === 'teams') return 'MS Teams';
    if (platform === 'slack') return 'Slack Huddles';
    if (platform === 'discord') return 'Discord';
    return 'Voice Recorder';
  };

  // Get status class styles
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            <RefreshCw className="w-2.5 h-2.5 animate-spin" />
            transcribing
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
            <AlertCircle className="w-2.5 h-2.5" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider text-[#1A1A1A] bg-[#F8F7F4] px-2 py-0.5 rounded border border-[#E5E5E1]">
            Bound
          </span>
        );
    }
  };

  // Get Template Badge styles
  const getTemplateBadge = (template: string) => {
    switch (template) {
      case 'scrum':
        return <span className="border border-[#E5E5E1] bg-[#F8F7F4] text-[#71716A] text-[9px] px-2.5 py-0.5 rounded font-mono uppercase tracking-wider">Scrum</span>;
      case 'client':
        return <span className="border border-[#E5E5E1] bg-[#F8F7F4] text-[#71716A] text-[9px] px-2.5 py-0.5 rounded font-mono uppercase tracking-wider">Client Brief</span>;
      case 'interview':
        return <span className="border border-[#E5E5E1] bg-[#F8F7F4] text-[#71716A] text-[9px] px-2.5 py-0.5 rounded font-mono uppercase tracking-wider">Interview</span>;
      case 'sales':
        return <span className="border border-[#E5E5E1] bg-[#F8F7F4] text-[#71716A] text-[9px] px-2.5 py-0.5 rounded font-mono uppercase tracking-wider">Sales scoping</span>;
      default:
        return <span className="border border-[#E5E5E1] bg-[#F8F7F4] text-[#71716A] text-[9px] px-2.5 py-0.5 rounded font-[#71716A] uppercase tracking-wider">Investor Audit</span>;
    }
  };

  const actionItemsCount = meeting.actionItems || [];
  const pendingActions = actionItemsCount.filter(a => a.status === 'pending').length;

  return (
    <div
      id={`meeting_card_${meeting.id}`}
      onClick={() => onSelect(meeting)}
      className={`border p-5 rounded-2xl cursor-pointer transition-all duration-300 relative group overflow-hidden shadow-sm ${
        isSelected 
          ? 'bg-white border-[#1A1A1A] ring-1 ring-[#1A1A1A]' 
          : 'bg-white border-[#E5E5E1] hover:border-[#1A1A1A]'
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {getPlatformIcon(meeting.platform)}
          <span className="text-[11px] text-[#71716A] truncate tracking-wide font-medium">
            {getPlatformLabel(meeting.platform)}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {getStatusBadge(meeting.status)}
          <button
            id={`delete_btn_${meeting.id}`}
            onClick={(e) => onDelete(meeting.id, e)}
            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 text-[#71716A] hover:text-red-600 rounded transition-all duration-200"
            title="Delete this meeting intelligence"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <h4 className="font-serif font-semibold text-[#1A1A1A] line-clamp-1 mb-2 text-[15px]">
         {meeting.title}
      </h4>

      <div className="flex items-center gap-3.5 text-xs text-[#71716A] font-medium mb-3">
        <div className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-[#71716A]" />
          <span>{formatMeetingDate(meeting.date)}</span>
        </div>
        <div className="flex items-center gap-1 font-mono text-[10px]">
          <Clock className="w-3.5 h-3.5 text-[#71716A]" />
          <span>{formatDuration(meeting.duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[#E5E5E1] pt-3 mt-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {getTemplateBadge(meeting.template)}
          {meeting.translated && (
            <span className="border border-emerald-200 bg-emerald-50/50 text-emerald-800 text-[9px] px-2 py-0.5 rounded font-mono uppercase tracking-wider flex items-center gap-0.5">
              <span>EN TRANSLATED</span>
            </span>
          )}
        </div>
        
        {meeting.status === 'completed' && (
          <div className="flex items-center gap-1.5 text-xs text-[#71716A] bg-[#F8F7F4] border border-[#E5E5E1] px-2 py-0.5 rounded">
            <FileText className="w-3 h-3 text-[#1A1A1A]" />
            <span className="font-mono text-[10px] text-[#1A1A1A] font-semibold">
              {pendingActions > 0 ? `${pendingActions} pending` : 'Done ✓'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
