import React, { useState } from 'react';
import { Search, Sparkles, HelpCircle, AlertCircle, RefreshCw, Quote, ArrowRight } from 'lucide-react';
import { SearchResult, Meeting, MeetingPlatform } from '../types';

interface MeetingMemorySearchProps {
  onSelectMeeting: (id: string) => void;
}

export default function MeetingMemorySearch({ onSelectMeeting }: MeetingMemorySearchProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [errorText, setErrorText] = useState('');

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setErrorText('');
    setResult(null);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || "Knowledge cognitive search failed.");
      }

      setResult(resData);
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || "Failed probing memory grids. Keep queries specific.");
    } finally {
      setIsLoading(false);
    }
  };

  // Simple Markdown format parser for AI response
  function renderMarkdown(markdown: string) {
    if (!markdown) return null;
    const lines = markdown.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('### ')) {
        return <h4 key={idx} className="text-[#1A1A1A] font-serif font-bold text-sm mt-3 mb-2 first:mt-0">{line.replace('### ', '')}</h4>;
      }
      if (line.startsWith('## ')) {
        return <h3 key={idx} className="text-[#1A1A1A] font-serif font-bold text-base mt-4 mb-2 first:mt-0">{line.replace('## ', '')}</h3>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <li key={idx} className="text-[#1A1A1A] text-xs list-disc ml-4 mb-1.5 leading-relaxed">
            {formatInlineText(line.substring(2))}
          </li>
        );
      }
      if (!line.trim()) return <div key={idx} className="h-2" />;
      return <p key={idx} className="text-[#1A1A1A] text-xs leading-relaxed mb-3">{formatInlineText(line)}</p>;
    });
  }

  function formatInlineText(text: string) {
    const boldPattern = /\*\*(.*?)\*\*/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = boldPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      parts.push(<strong key={match.index} className="text-[#1A1A1A] font-bold">{match[1]}</strong>);
      lastIndex = boldPattern.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  }

  // Pre-seed instant search tips
  const fastQueries = [
    "What are our current deliverables with Acme Corp?",
    "Why was our payments launch date postponed?",
    "Is Sarah Chen recommended for hiring?",
  ];

  return (
    <div id="meeting_memory_search_pane" className="bg-white border border-[#E5E5E1] p-6 rounded-3xl shadow-sm relative overflow-hidden mb-8">
      
      <div className="flex items-center gap-2.5 mb-4">
        <Sparkles className="w-5 h-5 text-[#1A1A1A] animate-pulse" />
        <div>
          <h3 className="text-sm font-bold font-serif text-[#1A1A1A] tracking-tight">Rez AI Corporate Memory & Semantic Explorer</h3>
          <p className="text-[11px] text-[#71716A] font-medium">Ask natural questions directly targeting transcript scopes</p>
        </div>
      </div>

      {/* Query Bar */}
      <form onSubmit={handleSearchSubmit} className="space-y-4">
        <div className="flex gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#71716A] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="inp_sys_memory_query"
              type="text"
              required
              disabled={isLoading}
              placeholder="e.g., What did the Acme client say regarding EU data residency?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-white border border-[#E5E5E1] rounded-xl py-3 pl-10 pr-4 text-xs text-[#1A1A1A] placeholder-[#71716A]/50 focus:outline-none focus:border-[#71716A] focus:ring-1 focus:ring-[#71716A] disabled:opacity-50"
            />
          </div>
          <button
            id="btn_probe_memory_search"
            type="submit"
            disabled={isLoading || !query.trim()}
            className="bg-[#1A1A1A] hover:bg-black text-white px-5 py-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 disabled:opacity-40 cursor-pointer"
          >
            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>{isLoading ? 'Scanning...' : 'Scan Memory'}</span>
          </button>
        </div>

        {/* Immediate suggestion tips */}
        {!result && !isLoading && (
          <div className="flex flex-wrap items-center gap-1.8 pt-1">
            <span className="text-[10px] text-[#71716A] font-bold uppercase tracking-wider flex items-center gap-1 shrink-0">
              <HelpCircle className="w-3 h-3 text-[#71716A]" />
              Suggested queries:
            </span>
            {fastQueries.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => { setQuery(q); }}
                className="text-[10px] bg-[#F8F7F4] hover:bg-[#E5E5E1] border border-[#E5E5E1] text-[#71716A] hover:text-[#1A1A1A] px-2.5 py-1 rounded transition"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* ERROR MESSAGE PANEL */}
      {errorText && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl flex items-start gap-2.5">
          <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{errorText}</p>
        </div>
      )}

      {/* LOADER SPLASH */}
      {isLoading && (
        <div className="mt-5 border border-[#E5E5E1] bg-[#F8F7F4]/40 p-6 rounded-2xl flex flex-col items-center justify-center text-center animate-pulse">
          <RefreshCw className="w-6 h-6 text-[#1A1A1A] animate-spin mb-3" />
          <p className="text-[#1A1A1A] text-xs font-semibold mb-1">Engaging Rez AI Corporate Memory Networks...</p>
          <p className="text-[#71716A] text-[10px] max-w-sm leading-relaxed">Gemini is probing meeting transcript histories, aligning discussions, and extracting supporting dialog evidence.</p>
        </div>
      )}

      {/* SEARCH RESULT DISCOVERY CARD */}
      {result && (
        <div className="mt-5 border border-[#E5E5E1] bg-[#F8F7F4] p-5 rounded-2xl space-y-4 animate-scale-up">
          
          {/* AI Comprehensive Answer bubble */}
          <div className="relative pr-2">
            <div className="flex items-center gap-1.5 mb-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A] bg-white border border-[#E5E5E1] px-2.2 py-0.5 rounded flex items-center gap-1">
                <Sparkles className="w-3 h-3 fill-[#1A1A1A]" />
                Synthesized Answer
              </span>
            </div>
            <div className="prose prose-sm max-w-none text-[#1A1A1A] font-serif leading-relaxed border-l-2 border-[#1A1A1A] pl-4 py-0.5">
              {renderMarkdown(result.aiAnswer)}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[#E5E5E1] pt-4 mt-2">
            
            {/* Matched Meetings links */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#71716A] mb-3 block">Matched Dialog Entities</h4>
              {result.meetings && result.meetings.length > 0 ? (
                <div className="space-y-1.5">
                  {result.meetings.map((meet) => (
                    <div 
                      key={meet.id}
                      onClick={() => meet.id && onSelectMeeting(meet.id)}
                      className="group/item flex items-center justify-between p-2.5 bg-white border border-[#E5E5E1] rounded-xl cursor-pointer hover:border-[#1A1A1A] transition-all font-medium text-xs text-[#1A1A1A]"
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="truncate pr-1 font-serif font-semibold">{meet.title}</span>
                        <span className="text-[9px] text-[#71716A] mt-0.5">{meet.relevance || 'Relevant content discussed.'}</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#71716A] group-hover/item:translate-x-0.5 transition-all shrink-0" />
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-[#71716A] text-xs italic">No specific source logs detected.</span>
              )}
            </div>

            {/* Citations citations */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#71716A] mb-3 block">Dialog Citations & Quotes</h4>
              {result.citations && result.citations.length > 0 ? (
                <div className="space-y-2.5 max-h-[170px] overflow-y-auto pr-1">
                  {result.citations.map((cite, i) => (
                    <div key={i} className="bg-white p-3 rounded-xl border border-[#E5E5E1]">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-bold text-[#1A1A1A] uppercase bg-[#F8F7F4] border border-[#E5E5E1] px-1.5 py-0.2 rounded">
                          {cite.speaker}
                        </span>
                        <span className="text-[9px] text-[#71716A] truncate max-w-[200px] italic">
                          {cite.meetingTitle}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#71716A] leading-normal pl-2 border-l border-[#E5E5E1]">
                        &ldquo;{cite.text}&rdquo;
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-[#71716A] text-xs italic">No matching verbal transcripts isolated.</span>
              )}
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
