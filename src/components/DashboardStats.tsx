import { Meeting } from '../types';
import { Video, CheckSquare, Clock, FileText, ArrowUpRight } from 'lucide-react';

interface DashboardStatsProps {
  meetings: Meeting[];
}

export default function DashboardStats({ meetings }: DashboardStatsProps) {
  const totalMeetings = meetings.filter(m => m.status === 'completed').length;
  
  // Aggregate actions
  const allActions = meetings.flatMap(m => m.actionItems || []);
  const completedActionsCount = allActions.filter(a => a.status === 'completed').length;
  const totalActionsCount = allActions.length;
  const completionPercentage = totalActionsCount > 0 
    ? Math.round((completedActionsCount / totalActionsCount) * 100) 
    : 0;

  // Calculate total duration in hours/minutes
  const totalDurationSeconds = meetings
    .filter(m => m.status === 'completed')
    .reduce((sum, m) => sum + m.duration, 0);
  
  const formattedMinutes = Math.floor(totalDurationSeconds / 60);

  // Platform counting
  const platformCounts = meetings.reduce((acc, m) => {
    if (m.status === 'completed') {
      acc[m.platform] = (acc[m.platform] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const topPlatform = Object.entries(platformCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  const formatPlatformName = (name: string) => {
    if (name === 'google-meet') return 'Google Meet';
    if (name === 'zoom') return 'Zoom';
    if (name === 'teams') return 'MS Teams';
    if (name === 'slack') return 'Slack Huddles';
    if (name === 'discord') return 'Discord';
    if (name === 'recording') return 'Audio Ingest';
    return name;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
      {/* Stat 1: Total Meetings */}
      <div id="stat_total_meetings" className="bg-white border border-[#E5E5E1] p-6 rounded-2xl relative overflow-hidden group hover:border-[#1A1A1A] transition-all duration-300 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[#71716A] text-[11px] uppercase font-bold tracking-wider">Indexed Meetings</span>
          <div className="p-2 bg-[#F8F7F4] text-[#1A1A1A] rounded-lg">
            <Video className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-serif font-light text-[#1A1A1A]">{totalMeetings}</span>
          <span className="text-[#71716A] text-xs font-medium">sessions</span>
        </div>
        <div className="mt-3 flex items-center text-[10px] text-[#71716A] uppercase tracking-wider font-semibold">
          <span>Storage: 12.4GB of 20GB</span>
        </div>
      </div>

      {/* Stat 2: Action Item Tracker */}
      <div id="stat_action_items" className="bg-white border border-[#E5E5E1] p-6 rounded-2xl relative overflow-hidden group hover:border-[#1A1A1A] transition-all duration-300 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[#71716A] text-[11px] uppercase font-bold tracking-wider">Action Resolution</span>
          <div className="p-2 bg-[#F8F7F4] text-[#1A1A1A] rounded-lg">
            <CheckSquare className="w-4 h-4" />
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-4xl font-serif font-light text-[#1A1A1A]">{completionPercentage}%</span>
            <span className="text-[10px] text-[#71716A] font-mono lowercase">
              {completedActionsCount} of {totalActionsCount} done
            </span>
          </div>
          <div className="w-full bg-[#E5E5E1] h-1 rounded-full overflow-hidden">
            <div 
              className="bg-[#1A1A1A] h-full rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stat 3: Processing Hours */}
      <div id="stat_minutes_processed" className="bg-white border border-[#E5E5E1] p-6 rounded-2xl relative overflow-hidden group hover:border-[#1A1A1A] transition-all duration-300 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[#71716A] text-[11px] uppercase font-bold tracking-wider">Voice Footprint</span>
          <div className="p-2 bg-[#F8F7F4] text-[#1A1A1A] rounded-lg">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-serif font-light text-[#1A1A1A]">{formattedMinutes}</span>
          <span className="text-[#71716A] text-xs font-semibold">minutes parsed</span>
        </div>
        <div className="mt-3 text-[10px] text-[#71716A] uppercase tracking-wider font-semibold">
          <span>Avg rate: 145 wpm</span>
        </div>
      </div>

      {/* Stat 4: Top Platform integration */}
      <div id="stat_top_platform" className="bg-white border border-[#E5E5E1] p-6 rounded-2xl relative overflow-hidden group hover:border-[#1A1A1A] transition-all duration-300 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[#71716A] text-[11px] uppercase font-bold tracking-wider">Primary Channel</span>
          <div className="p-2 bg-[#F8F7F4] text-[#1A1A1A] rounded-lg">
            <FileText className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-medium text-[#1A1A1A] truncate max-w-full">
            {formatPlatformName(topPlatform)}
          </span>
        </div>
        <div className="mt-3 text-[10px] text-[#71716A] uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600" />
          <span>Active integration feed</span>
        </div>
      </div>
    </div>
  );
}
