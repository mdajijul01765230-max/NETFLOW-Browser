import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Play,
  Video,
  Sparkles,
  Link as LinkIcon,
  RotateCw,
  X,
  ExternalLink,
  Flame,
  Music,
  Compass,
  Radio,
  Tv,
} from "lucide-react";
import { Language } from "../locales";
import { extractYouTubeVideoId } from "../utils/youtubeHelper";

export interface YouTubeSearchResult {
  id: string;
  title: string;
  channel?: string;
  duration?: string;
  thumbnail: string;
}

interface YouTubeFallbackPortalProps {
  currentUrl?: string;
  lang: Language;
  onNavigate: (url: string) => void;
}

export function YouTubeFallbackPortal({
  currentUrl = "https://www.youtube.com",
  lang,
  onNavigate,
}: YouTubeFallbackPortalProps) {
  // Extract search query from currentUrl if present (e.g. ?search_query=xyz)
  const initialQueryFromUrl = (() => {
    try {
      const parsed = new URL(currentUrl.startsWith("http") ? currentUrl : `https://${currentUrl}`);
      return (
        parsed.searchParams.get("search_query") ||
        parsed.searchParams.get("q") ||
        ""
      );
    } catch {
      return "";
    }
  })();

  const [searchQuery, setSearchQuery] = useState(initialQueryFromUrl);
  const [activeQuery, setActiveQuery] = useState(initialQueryFromUrl || "Bangla Song");
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Direct paste link state
  const [directLinkInput, setDirectLinkInput] = useState("");
  const [directLinkError, setDirectLinkError] = useState<string | null>(null);
  const [showDirectLinkBox, setShowDirectLinkBox] = useState(false);

  const initialSearchDoneRef = useRef(false);

  // Quick category pills
  const categories = [
    { label: lang === "bn" ? "ট্রেন্ডিং" : "Trending", query: "Trending Viral Videos", icon: Flame },
    { label: lang === "bn" ? "বাংলা গান" : "Bangla Songs", query: "Bangla Songs 2025", icon: Music },
    { label: lang === "bn" ? "৪কে নেচার" : "4K Nature", query: "Nature 4K Relaxation", icon: Compass },
    { label: lang === "bn" ? "লোফাই মিউজিক" : "Lofi Music", query: "Lofi Hip Hop Live", icon: Radio },
    { label: lang === "bn" ? "বিজ্ঞান ও মহাকাশ" : "Science & Space", query: "Earth From Space 4K", icon: Tv },
  ];

  // Fetch search results from server-side safe scraper API
  const performSearch = async (queryToSearch: string) => {
    const trimmed = queryToSearch.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setSearchError(null);
    setActiveQuery(trimmed);

    try {
      const res = await fetch("/api/youtube/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });

      if (!res.ok) {
        throw new Error(`Search failed with status ${res.status}`);
      }

      const data = await res.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        setResults(data.results);
      } else {
        setResults([]);
        setSearchError(
          lang === "bn"
            ? `"${trimmed}" এর জন্য কোনো ভিডিও পাওয়া যায়নি। অনুগ্রহ করে অন্য কীওয়ার্ড দিয়ে চেষ্টা করুন।`
            : `No videos found for "${trimmed}". Please try different keywords.`
        );
      }
    } catch (err: any) {
      console.error("[YouTube Portal] Search Error:", err);
      setSearchError(
        lang === "bn"
          ? "ইউটিউব সার্চ ফলাফল লোড করতে সমস্যা হয়েছে। অনুগ্রহ করে পুনরায় চেষ্টা করুন।"
          : "Failed to load YouTube search results. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Perform initial search on mount
  useEffect(() => {
    if (initialSearchDoneRef.current) return;
    initialSearchDoneRef.current = true;
    performSearch(initialQueryFromUrl || "Bangla Songs 2025");
  }, []);

  // Handle direct video link submission
  const handlePlayDirectLink = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = directLinkInput.trim();
    if (!trimmed) {
      setDirectLinkError(
        lang === "bn"
          ? "অনুগ্রহ করে একটি ইউটিউব ভিডিও লিংক লিখুন।"
          : "Please paste a YouTube video link."
      );
      return;
    }

    const videoId =
      extractYouTubeVideoId(trimmed) ||
      (trimmed.length === 11 && !trimmed.includes("/") ? trimmed : null);

    if (videoId) {
      setDirectLinkError(null);
      onNavigate(`https://www.youtube.com/embed/${videoId}`);
    } else {
      setDirectLinkError(
        lang === "bn"
          ? "সঠিক ইউটিউব ভিডিও লিংক পাওয়া যায়নি। উদাহরণ: https://www.youtube.com/watch?v=dQw4w9WgXcQ"
          : "Invalid YouTube URL or ID. Example: https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      );
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      performSearch(searchQuery);
    }
  };

  return (
    <div className="h-full w-full flex-1 flex flex-col bg-stone-950 text-stone-100 overflow-y-auto select-none min-h-0">
      {/* Top YouTube Search Header */}
      <div className="sticky top-0 z-20 bg-stone-900/95 backdrop-blur-md border-b border-stone-800 px-3 sm:px-6 py-2.5 sm:py-3 shadow-md shrink-0">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Logo & Sandbox Badge */}
          <div className="flex items-center gap-2.5 w-full md:w-auto justify-between md:justify-start">
            <div
              onClick={() => performSearch("Trending")}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-950/60 group-hover:bg-red-500 transition-colors">
                <Video className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-base sm:text-lg text-white tracking-tight flex items-center gap-1">
                YouTube <span className="text-red-500 text-xs font-semibold px-1.5 py-0.5 rounded bg-red-950/60 border border-red-800/60">Safe Grid</span>
              </span>
            </div>

            {/* Direct Link Toggle on Mobile */}
            <button
              type="button"
              onClick={() => setShowDirectLinkBox((prev) => !prev)}
              className="md:hidden text-xs text-stone-400 hover:text-stone-200 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-800 border border-stone-700/60"
            >
              <LinkIcon className="w-3.5 h-3.5 text-red-400" />
              <span>{lang === "bn" ? "লিংক পেস্ট" : "Paste Link"}</span>
            </button>
          </div>

          {/* Search Bar */}
          <form
            onSubmit={handleSearchSubmit}
            className="w-full md:max-w-xl flex items-center gap-1.5"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="youtube-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  lang === "bn"
                    ? "ইউটিউবে ভিডিও খুঁজুন (গান, খবর, নাটক, টিউটোরিয়াল)..."
                    : "Search YouTube videos, songs, tutorials, 4K..."
                }
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-stone-800/90 border border-stone-700 text-stone-100 placeholder-stone-500 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all shadow-inner"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              id="btn-youtube-search-submit"
              type="submit"
              disabled={isLoading || !searchQuery.trim()}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-stone-800 disabled:text-stone-500 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-md shadow-red-950/40 shrink-0"
            >
              {isLoading ? (
                <RotateCw className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{lang === "bn" ? "খুঁজুন" : "Search"}</span>
            </button>

            {/* Direct Link Toggle on Desktop */}
            <button
              type="button"
              onClick={() => setShowDirectLinkBox((prev) => !prev)}
              className="hidden md:flex text-xs text-stone-400 hover:text-stone-200 items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-750 border border-stone-700 transition-colors shrink-0 cursor-pointer"
              title={lang === "bn" ? "সরাসরি ভিডিও লিংক পেস্ট করুন" : "Paste direct video link"}
            >
              <LinkIcon className="w-3.5 h-3.5 text-red-400" />
              <span>{lang === "bn" ? "লিংক দিন" : "Paste URL"}</span>
            </button>
          </form>
        </div>

        {/* Category Pills Bar */}
        <div className="max-w-6xl mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar pt-2.5 pb-0.5">
          {categories.map((cat, idx) => {
            const Icon = cat.icon;
            const isSelected = activeQuery.toLowerCase().includes(cat.label.toLowerCase()) || activeQuery === cat.query;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setSearchQuery(cat.query);
                  performSearch(cat.query);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  isSelected
                    ? "bg-red-600 text-white shadow-xs"
                    : "bg-stone-800 hover:bg-stone-750 text-stone-300 hover:text-white border border-stone-700/60"
                }`}
              >
                <Icon className="w-3 h-3 text-red-400" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Body Content */}
      <div className="max-w-6xl mx-auto w-full p-3 sm:p-6 flex-1 flex flex-col">
        {/* Sandbox Privacy Guard Notice */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-3.5 rounded-xl bg-stone-900 border border-stone-800/80 text-xs text-stone-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <p className="leading-relaxed">
              {lang === "bn"
                ? "নিরাপত্তা নীতি: স্যান্ডবক্স আইফ্রেমের ভিতরে প্রতিটি ভিডিও অফিসিয়াল এমবেড প্লেয়ার (Safe Embed) দিয়ে সরাসরি চলবে।"
                : "Security Policy: Videos in sandbox preview load safely via the official YouTube Embed Player."}
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-stone-800 text-stone-400 border border-stone-700 shrink-0">
            Query: {activeQuery}
          </span>
        </div>

        {/* Direct Link Drawer (Collapsible) */}
        {showDirectLinkBox && (
          <form
            onSubmit={handlePlayDirectLink}
            className="mb-6 p-4 rounded-xl bg-stone-900 border border-red-900/40 shadow-lg animate-in fade-in duration-200"
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-stone-200 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-red-400" />
                <span>{lang === "bn" ? "সরাসরি ইউটিউব ভিডিও লিংক পেস্ট করুন" : "Paste Direct YouTube Link"}</span>
              </label>
              <button
                type="button"
                onClick={() => setShowDirectLinkBox(false)}
                className="text-stone-400 hover:text-stone-200 text-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={directLinkInput}
                onChange={(e) => {
                  setDirectLinkInput(e.target.value);
                  if (directLinkError) setDirectLinkError(null);
                }}
                placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                className="flex-1 px-3.5 py-2 rounded-lg bg-stone-800 border border-stone-700 text-stone-100 placeholder-stone-500 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>{lang === "bn" ? "ভিডিও চালান" : "Watch Now"}</span>
              </button>
            </div>
            {directLinkError && (
              <p className="text-xs text-rose-400 mt-2 font-medium">{directLinkError}</p>
            )}
          </form>
        )}

        {/* Search Results / Video Grid */}
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-stone-400">
            <div className="w-12 h-12 rounded-full border-2 border-stone-800 border-t-red-600 animate-spin mb-4" />
            <p className="text-sm font-medium text-stone-200">
              {lang === "bn" ? `"${activeQuery}" খোঁজা হচ্ছে...` : `Searching for "${activeQuery}"...`}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              {lang === "bn" ? "সার্ভার থেকে থাম্বনেইল ও তথ্য লোড হচ্ছে" : "Fetching thumbnails and metadata safely"}
            </p>
          </div>
        ) : searchError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center text-stone-500 mb-3">
              <Search className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-stone-200 mb-1">
              {lang === "bn" ? "কোনো ফলাফল পাওয়া যায়নি" : "No Results Found"}
            </h4>
            <p className="text-xs text-stone-400 max-w-sm mb-4 leading-relaxed">{searchError}</p>
            <button
              type="button"
              onClick={() => performSearch("Trending")}
              className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium transition-colors cursor-pointer"
            >
              {lang === "bn" ? "ট্রেন্ডিং ভিডিও দেখুন" : "View Trending Videos"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {results.map((video) => (
              <div
                key={video.id}
                onClick={() => onNavigate(`https://www.youtube.com/embed/${video.id}`)}
                className="group flex flex-col rounded-2xl bg-stone-900 border border-stone-850 hover:border-stone-700 overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/60"
              >
                {/* 16:9 Thumbnail Container */}
                <div className="relative aspect-video w-full bg-stone-950 overflow-hidden">
                  <img
                    src={video.thumbnail || `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
                    alt={video.title}
                    loading="lazy"
                    onError={(e) => {
                      // Fallback thumbnail if primary fails
                      (e.currentTarget as HTMLImageElement).src = `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`;
                    }}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />

                  {/* Play Overlay on Hover */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="w-12 h-12 rounded-full bg-red-600/90 flex items-center justify-center shadow-lg shadow-black/80 transform group-hover:scale-110 transition-transform">
                      <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                    </span>
                  </div>

                  {/* Duration Badge */}
                  {video.duration && (
                    <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-stone-950/85 backdrop-blur-xs text-stone-200 font-mono text-[10px] font-semibold tracking-wider">
                      {video.duration}
                    </span>
                  )}
                </div>

                {/* Video Info */}
                <div className="p-3 sm:p-3.5 flex flex-col flex-1 justify-between">
                  <div>
                    <h3
                      className="text-xs sm:text-sm font-semibold text-stone-100 group-hover:text-red-400 line-clamp-2 leading-snug transition-colors mb-1.5"
                      title={video.title}
                    >
                      {video.title}
                    </h3>
                    {video.channel && (
                      <p className="text-[11px] text-stone-400 truncate flex items-center gap-1">
                        <span>{video.channel}</span>
                      </p>
                    )}
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-stone-800/60 flex items-center justify-between text-[11px] text-stone-500">
                    <span className="font-mono text-[10px]">ID: {video.id}</span>
                    <span className="text-red-500 font-medium group-hover:underline flex items-center gap-0.5">
                      {lang === "bn" ? "দেখুন" : "Watch"} →
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
